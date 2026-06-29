import { supabase } from "@/lib/supabase";
import { type Technician } from "@/lib/data";

export const technicianService = {
  async getAll(): Promise<Technician[]> {
    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data as Technician[];
  },

  async getById(id: string): Promise<Technician | null> {
    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as Technician;
  },

  async create(data: Omit<Technician, 'id'>, id?: string): Promise<string> {
    const payload = id ? { id, ...data } : data;
    const { data: newDoc, error } = await supabase
      .from('technicians')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<Technician>): Promise<void> {
    const { error } = await supabase
      .from('technicians')
      .update(data)
      .eq('id', id);

    if (error) throw error;
  },

  async updateBatch(updates: { id: string, data: Partial<Technician> }[]): Promise<void> {
    await Promise.all(updates.map(u => this.update(u.id, u.data)));
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('technicians')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
