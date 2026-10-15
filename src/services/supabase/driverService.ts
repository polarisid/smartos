import { supabase } from "@/lib/supabase";
import { type Driver } from "@/lib/data";

export const driverService = {
  async getAll(unidadeId?: string | null): Promise<Driver[]> {
    let query = supabase.from('drivers').select('*').order('name', { ascending: true });
    if (unidadeId) query = query.eq('unidade_id', unidadeId);
    const { data, error } = await query;

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

  // unidadeId: obrigatório na prática pro master (sem unidade própria, o gatilho do banco não preenche
  // e o motorista ficaria sem unidade - sumindo da lista da unidade escolhida).
  async create(data: Omit<Driver, 'id'>, unidadeId?: string | null): Promise<string> {
    const { data: newDoc, error } = await supabase
      .from('drivers')
      .insert((unidadeId ? { ...data, unidade_id: unidadeId } : data) as any)
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
