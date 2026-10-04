import { supabase } from "@/lib/supabase";

export type AppNotification = {
  id: string;
  type: "route_assigned" | "route_removed" | "route_canceled" | "route_changed" | string;
  title: string;
  body: string;
  routeId?: string;
  createdAt: Date;
  readAt: Date | null;
};

function mapFromDb(row: any): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || "",
    routeId: row.route_id || undefined,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null,
  };
}

export const notificationService = {
  // A RLS já limita às notificações do próprio usuário.
  async getRecent(limit: number = 40): Promise<AppNotification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapFromDb);
  },

  async markAsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids)
      .is("read_at", null);
    if (error) throw error;
  },

  async markAllAsRead(): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw error;
  },

  // Aviso na hora, via Realtime, assim que o banco cria a notificação.
  subscribeToNew(userId: string, onNew: (n: AppNotification) => void): () => void {
    // Nome único por assinatura: se o React montar/desmontar/montar de novo (modo
    // dev, troca rápida de tela), o supabase-js reaproveitava o canal de mesmo
    // nome que ainda estava fechando e a nova assinatura ficava muda.
    const channel = supabase
      .channel(`notifications-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => onNew(mapFromDb(payload.new))
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Avisos em tempo real indisponíveis (segue pela reconsulta a cada minuto):", status, err?.message);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  },
};
