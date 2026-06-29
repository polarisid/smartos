import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

function convertTimestamps(obj: any): any {
    if (!obj) return obj;
    if (obj instanceof Timestamp) {
        return obj.toDate().toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(convertTimestamps);
    }
    if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = convertTimestamps(obj[key]);
        }
        return newObj;
    }
    return obj;
}

export async function POST() {
    try {
        console.log("Starting Firebase to Supabase sync...");
        
        // 1. Sync Technicians
        const techSnap = await getDocs(collection(db, 'technicians'));
        const technicians = techSnap.docs.map(doc => {
            const data = convertTimestamps(doc.data());
            return {
                id: doc.id,
                name: data.name,
                phone: data.phone || null,
                goal: data.goal || null,
                created_at: data.createdAt || new Date().toISOString()
            };
        });
        if (technicians.length > 0) {
            const { error } = await supabase.from('technicians').upsert(technicians);
            if (error) console.error("Error syncing technicians:", error);
        }

        // 2. Sync Drivers
        const driverSnap = await getDocs(collection(db, 'drivers'));
        const drivers = driverSnap.docs.map(doc => {
            const data = convertTimestamps(doc.data());
            return {
                id: doc.id,
                name: data.name,
                phone: data.phone || null,
                created_at: data.createdAt || new Date().toISOString()
            };
        });
        if (drivers.length > 0) {
            const { error } = await supabase.from('drivers').upsert(drivers);
            if (error) console.error("Error syncing drivers:", error);
        }

        // 3. Sync Routes
        const routesSnap = await getDocs(collection(db, 'routes'));
        const routes = routesSnap.docs.map(doc => {
            const data = convertTimestamps(doc.data());
            return {
                id: doc.id,
                name: data.name,
                is_active: data.isActive,
                is_canceled: data.isCanceled,
                departure_date: data.departureDate,
                arrival_date: data.arrivalDate,
                route_type: data.routeType,
                license_plate: data.licensePlate,
                technician_id: data.technicianId || null,
                technician_name: data.technicianName,
                driver_id: data.driverId || null,
                driver_name: data.driverName,
                driver_phone: data.driverPhone,
                stops: data.stops || [], // Ensure stops array is captured
                created_at: data.createdAt || new Date().toISOString()
            };
        });
        if (routes.length > 0) {
            const { error } = await supabase.from('routes').upsert(routes);
            if (error) console.error("Error syncing routes:", error);
        }

        // 4. Sync Service Orders
        const osSnap = await getDocs(collection(db, 'serviceOrders'));
        const orders = osSnap.docs.map(doc => {
            const data = convertTimestamps(doc.data());
            return {
                id: doc.id,
                technician_id: data.technicianId || null,
                service_order_number: data.serviceOrderNumber,
                date: data.date || new Date().toISOString(),
                equipment_type: data.equipmentType,
                service_type: data.serviceType,
                samsung_repair_type: data.samsungRepairType,
                samsung_budget_approved: data.samsungBudgetApproved,
                samsung_budget_value: data.samsungBudgetValue,
                symptom_code: data.symptomCode,
                repair_code: data.repairCode,
                defect_found: data.defectFound,
                parts_requested: data.partsRequested,
                product_collected_or_installed: data.productCollectedOrInstalled,
                collection_type: data.collectionType,
                replaced_part: data.replacedPart,
                observations: data.observations,
                cleaning_performed: data.cleaningPerformed,
                is_finalized: data.isFinalized,
                pending_reason: data.pendingReason,
                created_at: data.createdAt || new Date().toISOString()
            };
        });
        if (orders.length > 0) {
            // Process in chunks of 500 to avoid payload limits
            for (let i = 0; i < orders.length; i += 500) {
                const chunk = orders.slice(i, i + 500);
                const { error } = await supabase.from('service_orders').upsert(chunk);
                if (error) console.error("Error syncing service orders chunk:", error);
            }
        }

        // 5. Sync Checklists
        const checklistsSnap = await getDocs(collection(db, 'checklistTemplates'));
        const checklists = checklistsSnap.docs.map(doc => {
            const data = convertTimestamps(doc.data());
            return {
                id: doc.id,
                name: data.name,
                pdf_url: data.pdfUrl || '',
                type: data.type || 'counter',
                fields: data.fields || [],
                created_at: data.createdAt || new Date().toISOString()
            };
        });
        if (checklists.length > 0) {
            const { error } = await supabase.from('checklists').upsert(checklists);
            if (error) console.error("Error syncing checklists:", error);
        }

        return NextResponse.json({ success: true, message: 'Sync completed successfully' });

    } catch (error: any) {
        console.error("Sync Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
