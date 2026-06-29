import { supabase } from "@/lib/supabase";

export const chargebackService = {
  async getAll(): Promise<any[]> {
    const { data, error } = await supabase.from('chargebacks').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async getById(id: string): Promise<any | null> {
    const { data, error } = await supabase.from('chargebacks').select('*').eq('id', id).single();
    if (error) { if (error.code === 'PGRST116') return null; throw error; }
    return data;
  },
  async create(data: any): Promise<string> {
    const { data: newDoc, error } = await supabase.from('chargebacks').insert(data).select().single();
    if (error) throw error;
    return newDoc.id;
  },
  async update(id: string, data: any): Promise<void> {
    const { error } = await supabase.from('chargebacks').update(data).eq('id', id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('chargebacks').delete().eq('id', id);
    if (error) throw error;
  }
};
