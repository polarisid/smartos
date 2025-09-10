
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp, query, where } from 'firebase/firestore';
import { type ServiceOrder, type Route, type Technician } from '@/lib/data';

export async function GET() {
  try {
    // Fetch all necessary data from Firestore in parallel
    const activeRoutesQuery = query(collection(db, "routes"), where("isActive", "==", true));
    const [ordersSnapshot, activeRoutesSnapshot, techniciansSnapshot] = await Promise.all([
      getDocs(collection(db, "serviceOrders")),
      getDocs(activeRoutesQuery),
      getDocs(collection(db, "technicians"))
    ]);

    // Process technicians into a map for quick lookup
    const techniciansMap = new Map<string, string>();
    techniciansSnapshot.forEach(doc => {
      const tech = doc.data() as Omit<Technician, 'id'>;
      techniciansMap.set(doc.id, tech.name);
    });

    // Process service orders into a map for quick lookup
    const serviceOrdersMap = new Map<string, ServiceOrder>();
    ordersSnapshot.forEach(doc => {
      const order = { id: doc.id, ...doc.data() } as ServiceOrder;
      serviceOrdersMap.set(order.serviceOrderNumber, order);
    });

    // Process active routes and enrich them with their service orders
    const enrichedRoutes = activeRoutesSnapshot.docs.map(doc => {
        const route = { id: doc.id, ...doc.data() } as Route;
        
        const serviceOrdersInRoute = (route.stops || [])
            .map(stop => {
                const serviceOrder = serviceOrdersMap.get(stop.serviceOrder);
                if (serviceOrder) {
                    const technicianName = techniciansMap.get(serviceOrder.technicianId) || 'N/A';
                    const date = (serviceOrder.date as unknown as Timestamp).toDate().toISOString();
                    return {
                        ...serviceOrder,
                        date,
                        technicianName,
                    };
                }
                return null;
            })
            .filter((os): os is ServiceOrder & { date: string; technicianName: string } => os !== null);

        // Convert route's Timestamps to serializable format
        const createdAt = (route.createdAt as unknown as Timestamp)?.toDate().toISOString();
        const departureDate = (route.departureDate as unknown as Timestamp)?.toDate().toISOString();
        const arrivalDate = (route.arrivalDate as unknown as Timestamp)?.toDate().toISOString();

        return {
            ...route,
            createdAt,
            departureDate,
            arrivalDate,
            serviceOrders: serviceOrdersInRoute,
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
