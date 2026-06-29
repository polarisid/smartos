import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, Timestamp } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.envaju') });

// Setup Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Setup Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use SERVICE_ROLE_KEY if available to bypass RLS, otherwise fallback
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log("Starting migration...");
    const routesRef = collection(db, "routes");
    const snapshot = await getDocs(query(routesRef));
    
    console.log(`Found ${snapshot.size} routes in Firebase.`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const doc of snapshot.docs) {
        const data = doc.data();
        
        try {
            // Check if it already exists
            const { data: existing, error: findError } = await supabase.from('routes').select('id').eq('id', doc.id).single();
            if (existing) {
                console.log(`Route ${doc.id} already exists in Supabase. Skipping.`);
                continue;
            }
            if (findError && findError.code !== 'PGRST116') {
               console.error(`Error checking existence of route ${doc.id}:`, findError);
            }
            
            const createdAt = data.createdAt ? (data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date();
            const departureDate = data.departureDate ? (data.departureDate instanceof Timestamp ? data.departureDate.toDate() : new Date(data.departureDate)) : null;
            const arrivalDate = data.arrivalDate ? (data.arrivalDate instanceof Timestamp ? data.arrivalDate.toDate() : new Date(data.arrivalDate)) : null;
            
            const supabaseRow = {
                id: doc.id,
                name: data.name,
                stops: data.stops || [],
                is_active: data.isActive ?? true,
                is_canceled: data.isCanceled ?? false,
                departure_date: departureDate ? departureDate.toISOString() : null,
                arrival_date: arrivalDate ? arrivalDate.toISOString() : null,
                route_type: data.routeType || null,
                license_plate: data.licensePlate || null,
                technician_id: data.technicianId || null,
                technician_name: data.technicianName || null,
                driver_id: data.driverId || null,
                driver_name: data.driverName || null,
                driver_phone: data.driverPhone || null,
                created_at: createdAt.toISOString(),
            };
            
            const { error } = await supabase.from('routes').insert(supabaseRow);
            if (error) {
                if (error.code === '23503') { // Foreign key violation
                    console.log(`Foreign key violation for route ${doc.id}, attempting to insert without foreign keys (driver_id, technician_id)`);
                    const { technician_id, driver_id, ...safeRow } = supabaseRow;
                    const { error: retryError } = await supabase.from('routes').insert(safeRow);
                    if (retryError) {
                        console.error(`Error retrying route ${doc.id}:`, retryError.message);
                        failCount++;
                    } else {
                        console.log(`Successfully migrated route ${doc.id} (without foreign keys)`);
                        successCount++;
                    }
                } else {
                    console.error(`Error inserting route ${doc.id}:`, error.message);
                    failCount++;
                }
            } else {
                console.log(`Successfully migrated route ${doc.id}`);
                successCount++;
            }
        } catch (e) {
            console.error(`Exception migrating route ${doc.id}:`, e);
            failCount++;
        }
    }
    
    console.log(`Migration finished. Success: ${successCount}, Fail: ${failCount}`);
    process.exit(0);
}

migrate();
