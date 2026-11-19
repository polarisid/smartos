import { supabase } from "@/lib/supabase";
import type { RouteReminder } from "@/lib/routeReminders";

export type NewRouteReminder = {
  title: string;
  osNumber?: string;
  clientName?: string;
  city?: string;
  notes?: string;
  /** "yyyy-MM-dd" */
  dueDate?: string;
  createdByName?: string;
};

const fromRow = (r: any): RouteReminder => ({
  id: r.id,
  createdAt: new Date(r.created_at),
  createdByName: r.created_by_name ?? undefined,
  title: r.title,
  osNumber: r.os_number ?? undefined,
  clientName: r.client_name ?? undefined,
  city: r.city ?? undefined,
  notes: r.notes ?? undefined,
  dueDate: r.due_date ? String(r.due_date).slice(0, 10) : undefined,
  doneAt: r.done_at ? new Date(r.done_at) : undefined,
  doneByName: r.done_by_name ?? undefined,
});

const toRow = (input: Omit<NewRouteReminder, "createdByName">) => ({
  title: input.title.trim(),
  os_number: (input.osNumber || "").replace(/\s/g, "") || null,
  client_name: input.clientName?.trim() || null,
  city: input.city?.trim() || null,
  notes: input.notes?.trim() || null,
  due_date: input.dueDate || null,
});

export const routeReminderService = {
  async getAll(unidadeId?: string | null): Promise<RouteReminder[]> {
    let query = supabase.from("route_reminders").select("*").order("created_at", { ascending: false });
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(fromRow);
  },

  // unidadeId: obrigatório na prática pro master (o gatilho do banco só preenche a unidade de quem não é master).
  async create(input: NewRouteReminder, unidadeId?: string | null): Promise<RouteReminder> {
    const { data, error } = await supabase
      .from("route_reminders")
      .insert({ ...toRow(input), created_by_name: input.createdByName || null, ...(unidadeId ? { unidade_id: unidadeId } : {}) } as any)
      .select("*")
      .single();
    if (error) throw error;
    return fromRow(data);
  },

  async update(id: string, input: Omit<NewRouteReminder, "createdByName">): Promise<void> {
    await this.patch(id, toRow(input));
  },

  async setDone(id: string, done: boolean, byName?: string): Promise<void> {
    await this.patch(id, { done_at: done ? new Date().toISOString() : null, done_by_name: done ? byName || null : null });
  },

  async remove(id: string): Promise<void> {
    const { data, error } = await supabase.from("route_reminders").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("O lembrete não foi apagado (sem permissão ou já removido).");
  },

  // .select('id'): o Supabase devolve sucesso mesmo quando o RLS barra a escrita (0 linhas); aqui isso vira erro.
  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await supabase.from("route_reminders").update(patch as any).eq("id", id).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("A alteração não foi salva (sem permissão ou lembrete removido).");
  },
};
