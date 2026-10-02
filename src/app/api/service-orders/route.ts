import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'crypto';
import { subMonths } from 'date-fns';
import { routeService } from '@/services/supabase/routeService';
import { serviceOrderService } from '@/services/supabase/serviceOrderService';

// Este endpoint não tem usuário logado (é consumido por outro sistema), então a
// RLS do banco bloquearia tudo com a chave anônima. Ele lê com a service role
// no servidor e, por isso mesmo, só responde com uma chave de API válida
// (SERVICE_ORDERS_API_KEY) - sem ela qualquer pessoa leria os dados de todas
// as unidades.

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(req: NextRequest, expectedKey: string): boolean {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const provided = req.headers.get('x-api-key') || bearer || '';
  if (!provided) return false;
  return timingSafeEqual(sha256(provided), sha256(expectedKey));
}

// PostgREST devolve no máximo 1000 linhas por requisição - pagina até acabar.
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const rows: any[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await build(from, from + step - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < step) break;
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const expectedKey = process.env.SERVICE_ORDERS_API_KEY;
  if (!expectedKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'Server misconfiguration: SERVICE_ORDERS_API_KEY / SUPABASE_SERVICE_ROLE_KEY not set.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  if (!isAuthorized(req, expectedKey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  try {
    const admin = getSupabaseAdmin();
    const sixMonthsAgo = subMonths(new Date(), 6);

    const [unidades, techRows, routeRows, orderRows] = await Promise.all([
      fetchAll((from, to) => admin.from('unidades').select('id, nome').range(from, to)),
      fetchAll((from, to) => admin.from('technicians').select('id, name').range(from, to)),
      fetchAll((from, to) => admin.from('routes').select('*').eq('is_active', true).order('created_at', { ascending: false }).range(from, to)),
      fetchAll((from, to) => admin.from('service_orders').select('*').gte('date', sixMonthsAgo.toISOString()).order('date', { ascending: false }).range(from, to)),
    ]);

    // ?unidade=<id ou nome> filtra uma unidade só; sem o parâmetro vem todas,
    // cada rota marcada com unidadeId/unidadeNome pro outro sistema separar.
    const unidadeParam = (req.nextUrl.searchParams.get('asc') || req.nextUrl.searchParams.get('unidade'))?.trim().toLowerCase();
    const unidadeNomeById = new Map<string, string>(unidades.map((u: any) => [u.id, u.nome]));
    const unidadeFiltroId = unidadeParam
      ? unidades.find((u: any) => u.id.toLowerCase() === unidadeParam || String(u.nome).toLowerCase() === unidadeParam)?.id
      : undefined;
    if (unidadeParam && !unidadeFiltroId) {
      return NextResponse.json({ error: `Unidade "${unidadeParam}" não encontrada.` }, { status: 404, headers: CORS_HEADERS });
    }

    const techniciansMap = new Map<string, string>(techRows.map((t: any) => [t.id, t.name]));

    // Mesma OS pode existir em unidades diferentes - o casamento é por unidade +
    // número. Pedidos vêm do mais novo pro mais antigo: fica o primeiro (o mais recente).
    const serviceOrdersMap = new Map<string, any>();
    for (const row of orderRows) {
      const key = `${row.unidade_id}:${row.service_order_number}`;
      if (!serviceOrdersMap.has(key)) serviceOrdersMap.set(key, serviceOrderService.mapFromDb(row));
    }

    const enrichedRoutes = routeRows
      .filter((row: any) => !unidadeFiltroId || row.unidade_id === unidadeFiltroId)
      .map((row: any) => {
        const route = routeService.mapFromDb(row);
        const serviceOrdersInRoute = (route.stops || [])
          .map(stop => {
            const serviceOrder = serviceOrdersMap.get(`${row.unidade_id}:${stop.serviceOrder}`);
            if (!serviceOrder) return null;

            let status = 'Vai ser feita';
            if (serviceOrder.isFinalized) {
              status = 'Finalizada';
            } else if (serviceOrder.pendingReason && serviceOrder.pendingReason.trim() !== '') {
              status = 'Pendente';
            }

            return {
              ...serviceOrder,
              date: (serviceOrder.date instanceof Date ? serviceOrder.date : new Date()).toISOString(),
              technicianName: techniciansMap.get(serviceOrder.technicianId) || 'N/A',
              asc: unidadeNomeById.get(row.unidade_id),
              unidadeId: row.unidade_id,
              unidadeNome: unidadeNomeById.get(row.unidade_id),
              status,
            };
          })
          .filter((os): os is NonNullable<typeof os> => os !== null);

        return {
          ...route,
          asc: unidadeNomeById.get(row.unidade_id),
          unidadeId: row.unidade_id,
          unidadeNome: unidadeNomeById.get(row.unidade_id),
          createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : undefined,
          departureDate: route.departureDate instanceof Date ? route.departureDate.toISOString() : undefined,
          arrivalDate: route.arrivalDate instanceof Date ? route.arrivalDate.toISOString() : undefined,
          serviceOrders: serviceOrdersInRoute,
          finalizadas: serviceOrdersInRoute.filter(os => os.status === 'Finalizada'),
          pendentes: serviceOrdersInRoute.filter(os => os.status === 'Pendente'),
          a_fazer: serviceOrdersInRoute.filter(os => os.status === 'Vai ser feita'),
        };
      });

    return NextResponse.json(enrichedRoutes, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching service orders for API:', error);
    return NextResponse.json({ error: 'Failed to fetch service orders.' }, { status: 500, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
