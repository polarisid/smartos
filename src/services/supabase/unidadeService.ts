import { supabase } from "@/lib/supabase";
import { type Unidade } from "@/lib/data";

export const unidadeService = {
  async getAll(): Promise<Unidade[]> {
    const { data, error } = await supabase
      .from('unidades')
      .select('*')
      .order('nome', { ascending: true });

    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      nome: row.nome,
      createdAt: new Date(row.created_at),
    }));
  },

  async create(nome: string): Promise<string> {
    const { data, error } = await supabase
      .from('unidades')
      .insert({ nome })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  },
};
