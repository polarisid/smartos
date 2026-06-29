import { supabase } from "@/lib/supabase";

export const checklistService = {
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase.from('checklists').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(this.mapFromDb);
  },
  async getById(id: string): Promise<any | null> {
    const { data, error } = await supabase.from('checklists').select('*').eq('id', id).single();
    if (error) { if (error.code === 'PGRST116') return null; throw error; }
    return this.mapFromDb(data);
  },
  async create(data: any): Promise<string> {
    const { data: newDoc, error } = await supabase.from('checklists').insert(this.mapToDb(data)).select().single();
    if (error) throw error;
    return newDoc.id;
  },
  async update(id: string, data: any): Promise<void> {
    const { error } = await supabase.from('checklists').update(this.mapToDb(data)).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('checklists').delete().eq('id', id);
    if (error) throw error;
  },
  mapFromDb(row: any): any {
    if (!row) return row;
    return {
      ...row,
      pdfUrl: row.pdf_url,
    };
  },
  mapToDb(obj: any): any {
    if (!obj) return obj;
    const { pdfUrl, ...rest } = obj;
    return {
      ...rest,
      ...(pdfUrl !== undefined ? { pdf_url: pdfUrl } : {})
    };
  }
};
