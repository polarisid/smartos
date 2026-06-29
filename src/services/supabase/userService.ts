import { supabase } from "@/lib/supabase";
import { type AppUser } from "@/lib/data";

export const userService = {
  /**
   * Obtém todos os usuários administradores/técnicos.
   */
  async getAll(): Promise<AppUser[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(profile => ({
      uid: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role
    } as AppUser));
  },

  /**
   * Obtém um usuário específico.
   */
  async getById(id: string): Promise<AppUser | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
    }

    return {
      uid: data.id,
      name: data.name,
      email: data.email,
      role: data.role
    } as AppUser;
  },

  /**
   * Atualiza os dados de um usuário na tabela profiles.
   */
  async update(id: string, data: Partial<AppUser>): Promise<void> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role;

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Exclui um usuário.
   * NOTA: No Supabase, excluir de `profiles` não exclui de `auth.users`. 
   * Para excluir de `auth.users`, é necessário usar a Admin API do Supabase no backend, 
   * pois o client-side não tem permissão de excluir usuários do Auth.
   * Neste caso, vamos apenas excluir o perfil (ou deveríamos usar uma API Route).
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
};
