require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local', override: true });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const { createClient } = require('@supabase/supabase-js');

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function convertDates(obj) {
  for (let key in obj) {
    if (obj[key] && typeof obj[key].toDate === 'function') {
      obj[key] = obj[key].toDate().toISOString();
    }
  }
  return obj;
}

const collectionsToMigrate = [
  { firebase: 'technicians', supabase: 'technicians', map: (d) => ({ id: d.id, name: d.name, phone: d.phone, goal: d.goal }) },
  { firebase: 'drivers', supabase: 'drivers', map: (d) => ({ id: d.id, name: d.name, phone: d.phone }) },
  { firebase: 'checklists', supabase: 'checklists', map: (d) => ({ id: d.id, name: d.name, pdf_url: d.pdfUrl, type: d.type, fields: d.fields }) },
  { firebase: 'presets', supabase: 'presets', map: (d) => ({ id: d.id, name: d.name, equipment_type: d.equipmentType, symptom_code: d.symptomCode, repair_code: d.repairCode, replaced_part: d.replacedPart, observations: d.observations }) },
  { firebase: 'indicators', supabase: 'indicators', map: (d) => ({ id: d.id, name: d.name, description: d.description, goal_type: d.goalType, goal_value: d.goalValue, goal_description: d.goalDescription, evaluation_logic: d.evaluationLogic, current_value: d.currentValue }) },
  { firebase: 'serviceOrders', supabase: 'service_orders', map: (d) => ({
      id: d.id, technician_id: d.technicianId, service_order_number: d.serviceOrderNumber, date: d.date, equipment_type: d.equipmentType, service_type: d.serviceType,
      samsung_repair_type: d.samsungRepairType, samsung_budget_approved: d.samsungBudgetApproved, samsung_budget_value: d.samsungBudgetValue,
      symptom_code: d.symptomCode, repair_code: d.repairCode, defect_found: d.defectFound, parts_requested: d.partsRequested,
      product_collected_or_installed: d.productCollectedOrInstalled, collection_type: d.collectionType, replaced_part: d.replacedPart, observations: d.observations,
      cleaning_performed: d.cleaningPerformed, is_finalized: d.isFinalized, pending_reason: d.pendingReason
  }) },
  { firebase: 'routes', supabase: 'routes', map: (d) => ({
      id: d.id, name: d.name, is_active: d.isActive, is_canceled: d.isCanceled, departure_date: d.departureDate, arrival_date: d.arrivalDate,
      route_type: d.routeType, license_plate: d.licensePlate, technician_id: d.technicianId, technician_name: d.technicianName,
      driver_id: d.driverId, driver_name: d.driverName, driver_phone: d.driverPhone, stops: d.stops || []
  }) },
  { firebase: 'returns', supabase: 'returns', map: (d) => ({
      id: d.id, technician_id: d.technicianId, technician_name: d.technicianName, original_service_order: d.originalServiceOrder,
      original_replaced_part: d.originalReplacedPart, return_service_order: d.returnServiceOrder, return_replaced_part: d.returnReplacedPart,
      return_date: d.returnDate, days_to_return: d.daysToReturn, product_model: d.productModel
  }) },
  { firebase: 'chargebacks', supabase: 'chargebacks', map: (d) => ({
      id: d.id, technician_id: d.technicianId, technician_name: d.technicianName, service_order_number: d.serviceOrderNumber,
      value: d.value, reason: d.reason, date: d.date
  }) },
  { firebase: 'triages', supabase: 'triages', map: (d) => ({
      id: d.id, service_order_number: d.serviceOrderNumber, product_model: d.productModel, product_line: d.productLine,
      status: d.status, symptoms_reported: d.symptomsReported, suggested_parts: d.suggestedParts, final_diagnosis: d.finalDiagnosis,
      messages: d.messages || [], is_corrected: d.isCorrected, corrected_diagnosis: d.correctedDiagnosis, corrected_parts: d.correctedParts
  }) },
  { firebase: 'knowledgeBase', supabase: 'knowledge_base_rules', map: (d) => ({
      id: d.id, title: d.title, product_family: d.productFamily, product_line: d.productLine, content: d.content
  }) },
  { firebase: 'codes', supabase: 'codes', map: (d) => null } // Tratado individualmente
];

async function migrate() {
  for (const coll of collectionsToMigrate) {
    console.log(`Migrando ${coll.firebase}...`);
    try {
      if (coll.firebase === 'codes') {
         const snapshot = await getDocs(collection(db, 'codes'));
         const records = [];
         snapshot.forEach(doc => {
            const type = doc.id === 'symptoms' ? 'symptom' : 'repair';
            const data = doc.data();
            ['TV/AV', 'DA'].forEach(category => {
                if (data[category]) {
                    Object.entries(data[category]).forEach(([code, desc]) => {
                        records.push({ code, description: desc, type, category });
                    });
                }
            });
         });
         if (records.length > 0) {
            const { error } = await supabase.from('codes').upsert(records);
            if (error) console.error("Erro inserindo codes:", error);
            else console.log(`Sucesso! ${records.length} códigos inseridos.`);
         }
         continue;
      }

      const snapshot = await getDocs(collection(db, coll.firebase));
      const records = [];
      snapshot.forEach(doc => {
        let data = convertDates(doc.data());
        data.id = doc.id;
        records.push(coll.map(data));
      });

      if (records.length > 0) {
        const { error } = await supabase.from(coll.supabase).upsert(records);
        if (error) {
          console.error(`Erro ao inserir na tabela ${coll.supabase}:`, error);
        } else {
          console.log(`Sucesso! ${records.length} registros inseridos em ${coll.supabase}`);
        }
      } else {
        console.log(`Nenhum registro encontrado em ${coll.firebase}`);
      }
    } catch (err) {
      console.error(`Erro fatal migrando ${coll.firebase}:`, err.message);
    }
  }
  console.log("Migração concluída!");
  process.exit(0);
}

migrate();
