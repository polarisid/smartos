import { supabase } from "@/lib/supabase";
import { type Driver } from "@/lib/data";

export const driverService = {
  async getAll(): Promise<Driver[]> {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data as Driver[];
  },

  async getById(id: string): Promise<Driver | null> {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as Driver;
  },

  async create(data: Omit<Driver, 'id'>): Promise<string> {
    const { data: newDoc, error } = await supabase
      .from('drivers')
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return newDoc.id;
  },

  async update(id: string, data: Partial<Driver>): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .update(data)
      .eq('id', id);

    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('drivers')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
