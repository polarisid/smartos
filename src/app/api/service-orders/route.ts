
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

    // Process active routes into a map where key is serviceOrderNumber and value is route info
    const activeServiceOrdersMap = new Map<string, { routeId: string; routeName: string }>();
    activeRoutesSnapshot.forEach(doc => {
      const route = { id: doc.id, ...doc.data() } as Route;
      if (route.stops) {
        route.stops.forEach(stop => {
          activeServiceOrdersMap.set(stop.serviceOrder, {
            routeId: route.id,
            routeName: route.name,
          });
        });
      }
    });

    // Filter and enrich service orders that are in an active route
    const enrichedServiceOrders = ordersSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as ServiceOrder))
      .filter(order => activeServiceOrdersMap.has(order.serviceOrderNumber))
      .map(order => {
        const routeInfo = activeServiceOrdersMap.get(order.serviceOrderNumber)!; // We know it exists due to the filter
        const technicianName = techniciansMap.get(order.technicianId) || 'N/A';
        
        // Convert Firebase Timestamp to a serializable format (ISO string)
        const date = (order.date as unknown as Timestamp).toDate().toISOString();

        return {
          ...order,
          date, // Override with the ISO string date
          routeName: routeInfo.routeName,
          routeId: routeInfo.routeId,
          technicianName: technicianName,
        };
      });

    return NextResponse.json(enrichedServiceOrders, {
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
