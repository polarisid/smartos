import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

export const runtime = 'nodejs';

// Chamado pelo BANCO (gatilho em `notifications`, via pg_net) assim que um aviso
// é criado: manda o push para todos os aparelhos inscritos daquele usuário.
// Autenticado por segredo compartilhado (PUSH_WEBHOOK_SECRET), não por login.
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !publicKey || !privateKey || !serviceKey) {
    return NextResponse.json({ error: 'Push não configurado neste ambiente.' }, { status: 500 });
  }
  if (req.headers.get('x-push-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const userId: string | undefined = payload?.user_id;
  if (!userId) return NextResponse.json({ error: 'user_id obrigatório.' }, { status: 400 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) {
    console.error('push: falha ao ler inscrições', error);
    return NextResponse.json({ error: 'Falha ao ler inscrições.' }, { status: 500 });
  }

  const message = JSON.stringify({
    id: payload.id,
    title: payload.title || 'SmartOS',
    body: payload.body || '',
    url: '/routes',
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e: any) {
      // 404/410: o aparelho cancelou a inscrição — limpa pra não tentar de novo.
      if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.id);
      else console.warn('push: falha ao enviar', e?.statusCode, e?.body);
    }
  }));
  if (gone.length) await supabase.from('push_subscriptions').delete().in('id', gone);

  return NextResponse.json({ sent, removed: gone.length });
}
