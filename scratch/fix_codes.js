require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local', override: true });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const { createClient } = require('@supabase/supabase-js');

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getFirestore(app);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixCodes() {
  console.log("Apagando códigos errados...");
  await supabase.from('codes').delete().neq('id', 'dummy');

  console.log("Migrando codes do jeito certo...");
  const snapshot = await getDocs(collection(db, 'codes'));
  const records = [];
  snapshot.forEach(doc => {
     const type = doc.id === 'symptoms' ? 'symptom' : 'repair';
     const data = doc.data();
     ['TV/AV', 'DA'].forEach(category => {
         if (data[category] && Array.isArray(data[category])) {
             data[category].forEach(item => {
                 records.push({ code: item.code, description: item.description, type, category });
             });
         } else if (data[category]) {
             // Caso fosse um objeto dicionário (fallback)
             Object.entries(data[category]).forEach(([code, desc]) => {
                 records.push({ code, description: desc, type, category });
             });
         }
     });
  });

  if (records.length > 0) {
     const { error } = await supabase.from('codes').insert(records);
     if (error) console.error("Erro inserindo codes:", error);
     else console.log(`Sucesso! ${records.length} códigos inseridos corretamente.`);
  }
}

fixCodes();
