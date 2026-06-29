const fs = require('fs');
const path = require('path');

const services = [
  'checklistService',
  'returnService',
  'chargebackService',
  'indicatorService',
  'presetService',
  'codeService',
  'triageService',
  'knowledgeService'
];

const template = (name) => `import { supabase } from "@/lib/supabase";
import { type any } from "@/lib/data"; // Replace 'any' with correct type later if needed

export const ${name} = {
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase.from('${name.replace('Service', 's').replace(/([A-Z])/g, "_$1").toLowerCase()}').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async getById(id: string): Promise<any | null> {
    const { data, error } = await supabase.from('${name.replace('Service', 's').replace(/([A-Z])/g, "_$1").toLowerCase()}').select('*').eq('id', id).single();
    if (error) { if (error.code === 'PGRST116') return null; throw error; }
    return data;
  },
  async create(data: any): Promise<string> {
    const { data: newDoc, error } = await supabase.from('${name.replace('Service', 's').replace(/([A-Z])/g, "_$1").toLowerCase()}').insert(data).select().single();
    if (error) throw error;
    return newDoc.id;
  },
  async update(id: string, data: any): Promise<void> {
    const { error } = await supabase.from('${name.replace('Service', 's').replace(/([A-Z])/g, "_$1").toLowerCase()}').update(data).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('${name.replace('Service', 's').replace(/([A-Z])/g, "_$1").toLowerCase()}').delete().eq('id', id);
    if (error) throw error;
  }
};
`;

const dir = path.join(__dirname, '..', '..', 'src', 'services', 'supabase');

if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

services.forEach(s => {
  const file = path.join(dir, s + '.ts');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, template(s));
    console.log('Created ' + s);
  }
});
