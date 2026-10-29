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

  async update(id: string, nome: string): Promise<void> {
    const { error } = await supabase.from('unidades').update({ nome }).eq('id', id);
    if (error) throw error;
  },
};

// Avisa os seletores de unidade já montados (o do menu carrega a lista uma vez só).
export const UNIDADES_CHANGED_EVENT = 'smartos:unidades-changed';
