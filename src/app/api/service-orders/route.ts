
import { NextResponse } from 'next/server';
import { routeService } from '@/services/supabase/routeService';
import { serviceOrderService } from '@/services/supabase/serviceOrderService';
import { technicianService } from '@/services/supabase/technicianService';
import { subMonths } from 'date-fns';

export async function GET() {
  try {
    const sixMonthsAgo = subMonths(new Date(), 6);
    // Fetch only recent service orders (last 6 months) + active routes + technicians in parallel
    const [allOrders, allRoutes, allTechnicians] = await Promise.all([
      serviceOrderService.getAll(),
      routeService.getAll(),
      technicianService.getAll()
    ]);

    const recentOrders = allOrders.filter(os => os.date >= sixMonthsAgo);
    const activeRoutes = allRoutes.filter(r => r.isActive);

    // Process technicians into a map for quick lookup
    const techniciansMap = new Map<string, string>();
    allTechnicians.forEach(tech => {
      techniciansMap.set(tech.id, tech.name);
    });

    // Process service orders into a map for quick lookup
    const serviceOrdersMap = new Map<string, any>();
    recentOrders.forEach(order => {
      serviceOrdersMap.set(order.serviceOrderNumber, order);
    });

    // Process active routes and enrich them with their service orders
    const enrichedRoutes = activeRoutes.map(route => {
        const serviceOrdersInRoute = (route.stops || [])
            .map(stop => {
                const serviceOrder = serviceOrdersMap.get(stop.serviceOrder);
                if (serviceOrder) {
                    const technicianName = techniciansMap.get(serviceOrder.technicianId) || 'N/A';
                    const date = (serviceOrder.date instanceof Date ? serviceOrder.date : new Date()).toISOString();
                    
                    let status = 'Vai ser feita';
                    if (serviceOrder.isFinalized) {
                        status = 'Finalizada';
                    } else if (serviceOrder.pendingReason && serviceOrder.pendingReason.trim() !== '') {
                        status = 'Pendente';
                    }

                    return {
                        ...serviceOrder,
                        date,
                        technicianName,
                        status,
                    };
                }
                return null;
            })
            .filter((os): os is any => os !== null);

        // Convert route's Dates to serializable format
        const createdAt = route.createdAt instanceof Date ? route.createdAt.toISOString() : undefined;
        const departureDate = route.departureDate instanceof Date ? route.departureDate.toISOString() : undefined;
        const arrivalDate = route.arrivalDate instanceof Date ? route.arrivalDate.toISOString() : undefined;

        const finalizadas = serviceOrdersInRoute.filter(os => os.status === 'Finalizada');
        const pendentes = serviceOrdersInRoute.filter(os => os.status === 'Pendente');
        const a_fazer = serviceOrdersInRoute.filter(os => os.status === 'Vai ser feita');

        return {
            ...route,
            createdAt,
            departureDate,
            arrivalDate,
            serviceOrders: serviceOrdersInRoute,
            finalizadas,
            pendentes,
            a_fazer,
        };
    });

    return NextResponse.json(enrichedRoutes, {
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow requests from any origin
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error("Error fetching service orders for API:", error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch service orders.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Optional: Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
