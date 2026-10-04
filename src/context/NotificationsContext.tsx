"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { notificationService, type AppNotification } from "@/services/supabase/notificationService";

type NotificationsContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Avisos de mudança nas rotas do técnico. A notificação é criada pelo banco
// (gatilho em `routes`); aqui só se lê a lista, assina o Realtime pra avisar na
// hora e mantém o contador de não lidas. Sem Realtime (sinal ruim), a lista é
// reconsultada a cada minuto e quando o app volta ao primeiro plano.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const uid = appUser?.uid;
  const queryKey = useMemo(() => ["notifications", uid], [uid]);

  const { data: notifications = [] } = useQuery({
    queryKey,
    queryFn: () => notificationService.getRecent(),
    enabled: !!uid,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const showNewRef = useRef<(n: AppNotification) => void>(() => {});
  showNewRef.current = (n) => {
    // Evita duplicar se o mesmo aviso chegar por Realtime e pela reconsulta.
    queryClient.setQueryData<AppNotification[]>(queryKey, (prev = []) => (prev.some(p => p.id === n.id) ? prev : [n, ...prev]));
    // A rota mudou: as telas que mostram rotas/OS devem recarregar agora.
    queryClient.invalidateQueries({ queryKey: ["routes"] });

    toast({ title: n.title, description: n.body });

    // App aberto mas em segundo plano (outra aba/janela): avisa também pelo sistema.
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(n.title, { body: n.body, icon: "/icon-512.svg", tag: n.id });
      } catch {
        /* alguns navegadores móveis só aceitam via service worker - o aviso na tela já cobre */
      }
    }
  };

  useEffect(() => {
    if (!uid) return;
    return notificationService.subscribeToNew(uid, (n) => showNewRef.current(n));
  }, [uid]);

  // Ao abrir o app com avisos que chegaram enquanto estava fechado, lembra uma vez por sessão.
  const remindedRef = useRef(false);
  useEffect(() => {
    if (remindedRef.current || notifications.length === 0) return;
    const unread = notifications.filter(n => !n.readAt).length;
    if (unread === 0) return;
    remindedRef.current = true;
    try {
      if (sessionStorage.getItem("notificationsReminded") === uid) return;
      sessionStorage.setItem("notificationsReminded", uid || "");
    } catch { /* sem sessionStorage: lembra mesmo assim */ }
    toast({
      title: unread === 1 ? "Você tem 1 aviso novo" : `Você tem ${unread} avisos novos`,
      description: "Toque no sino pra ver as mudanças nas suas rotas.",
    });
  }, [notifications, toast, uid]);

  const markAsRead = useCallback(async (ids: string[]) => {
    const now = new Date();
    queryClient.setQueryData<AppNotification[]>(queryKey, (prev = []) => prev.map(n => (ids.includes(n.id) && !n.readAt ? { ...n, readAt: now } : n)));
    try {
      await notificationService.markAsRead(ids);
    } catch (e) {
      console.error("Falha ao marcar notificação como lida", e);
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, queryKey]);

  const markAllAsRead = useCallback(async () => {
    const now = new Date();
    queryClient.setQueryData<AppNotification[]>(queryKey, (prev = []) => prev.map(n => (n.readAt ? n : { ...n, readAt: now })));
    try {
      await notificationService.markAllAsRead();
    } catch (e) {
      console.error("Falha ao marcar todas como lidas", e);
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, queryKey]);

  const value = useMemo<NotificationsContextType>(() => ({
    notifications,
    unreadCount: notifications.filter(n => !n.readAt).length,
    markAsRead,
    markAllAsRead,
  }), [notifications, markAsRead, markAllAsRead]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextType {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications precisa estar dentro de NotificationsProvider");
  return ctx;
}
