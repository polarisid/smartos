import { supabase } from "@/lib/supabase";

export type OrderClosing = {
  closedAt: Date;
  closedByName?: string;
};

const BATCH = 80; // ids (uuid) vão na URL: em lotes para não passar do limite de tamanho

export const orderClosingService = {
  /** OS (por id) já marcadas como encerradas no sistema, entre as informadas. */
  async getByOrderIds(orderIds: string[]): Promise<Map<string, OrderClosing>> {
    const result = new Map<string, OrderClosing>();
    const unique = Array.from(new Set(orderIds.filter(Boolean)));
    for (let i = 0; i < unique.length; i += BATCH) {
      const { data, error } = await supabase
        .from('service_order_closings')
        .select('service_order_id, closed_at, closed_by_name')
        .in('service_order_id', unique.slice(i, i + BATCH));
      if (error) throw error;
      for (const row of data || []) {
        result.set(row.service_order_id, { closedAt: new Date(row.closed_at), closedByName: row.closed_by_name ?? undefined });
      }
    }
    return result;
  },

  // unidadeId: obrigatório na prática pro master (o gatilho do banco só preenche a unidade de quem não é master).
  // upsert: marcar duas vezes (dois cliques, duas pessoas) não dá erro e mantém a 1ª marcação.
  async markClosed(orderId: string, closedByName: string | undefined, unidadeId?: string | null): Promise<void> {
    const { error } = await supabase
      .from('service_order_closings')
      .upsert(
        { service_order_id: orderId, closed_by_name: closedByName || null, ...(unidadeId ? { unidade_id: unidadeId } : {}) } as any,
        { onConflict: 'service_order_id', ignoreDuplicates: true }
      );
    if (error) throw error;
  },

  async unmarkClosed(orderId: string): Promise<void> {
    const { error } = await supabase.from('service_order_closings').delete().eq('service_order_id', orderId);
    if (error) throw error;
  },
};
