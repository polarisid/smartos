import { supabase } from "@/lib/supabase";
import { type Preset } from "@/lib/data";

export const presetService = {
  async getAll(): Promise<Preset[]> {
    const { data, error } = await supabase.from('presets').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data.map(this.mapFromDb);
  },

  async getById(id: string): Promise<Preset | null> {
    const { data, error } = await supabase.from('presets').select('*').eq('id', id).single();
    if (error) { if (error.code === 'PGRST116') return null; throw error; }
    return this.mapFromDb(data);
  },

  async create(data: Omit<Preset, 'id'>): Promise<string> {
    const dbData = this.mapToDb(data as Preset);
    const { data: newDoc, error } = await supabase.from('presets').insert(dbData).select().single();
    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<Preset>): Promise<void> {
    const dbData = this.mapToDb(data as Preset);
    const { error } = await supabase.from('presets').update(dbData).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('presets').delete().eq('id', id);
    if (error) throw error;
  },

  mapFromDb(row: any): Preset {
    return {
      id: row.id,
      name: row.name,
      equipmentType: row.equipment_type,
      symptomCode: row.symptom_code,
      repairCode: row.repair_code,
      replacedPart: row.replaced_part,
      observations: row.observations
    };
  },

  mapToDb(obj: Partial<Preset>): any {
    const row: any = {};
    if (obj.name !== undefined) row.name = obj.name;
    if (obj.equipmentType !== undefined) row.equipment_type = obj.equipmentType;
    if (obj.symptomCode !== undefined) row.symptom_code = obj.symptomCode;
    if (obj.repairCode !== undefined) row.repair_code = obj.repairCode;
    if (obj.replacedPart !== undefined) row.replaced_part = obj.replacedPart;
    if (obj.observations !== undefined) row.observations = obj.observations;
    return row;
  }
};
