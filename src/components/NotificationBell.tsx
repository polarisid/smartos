"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { pushService, type PushSupport } from "@/services/supabase/pushService";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, BellRing, CheckCheck, MinusCircle, PlusCircle, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/context/NotificationsContext";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, { icon: typeof Bell; className: string }> = {
  route_assigned: { icon: PlusCircle, className: "text-emerald-500" },
  route_removed: { icon: MinusCircle, className: "text-amber-500" },
  route_canceled: { icon: XCircle, className: "text-red-500" },
  route_changed: { icon: RefreshCw, className: "text-blue-500" },
};

export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const canAskPermission = typeof Notification !== "undefined" && Notification.permission === "default";
  const { appUser } = useAuth();
  const { toast } = useToast();
  const [pushState, setPushState] = useState<"loading" | "on" | PushSupport>("loading");
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPushState = async () => {
    const support = pushService.support();
    if (support !== "ready") { setPushState(support); return; }
    try {
      setPushState((await pushService.getCurrent()) ? "on" : "ready");
    } catch {
      setPushState("ready");
    }
  };
  useEffect(() => { if (open) refreshPushState(); }, [open]);

  const handleEnablePush = async () => {
    if (!appUser?.uid) return;
    setPushBusy(true);
    try {
      await pushService.subscribe(appUser.uid);
      toast({ title: "Avisos no aparelho ativados", description: "Você receberá as mudanças nas suas rotas mesmo com o app fechado." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível ativar", description: e?.message || "Tente novamente." });
    } finally {
      setPushBusy(false);
      refreshPushState();
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      await pushService.unsubscribe();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível desativar", description: e?.message });
    } finally {
      setPushBusy(false);
      refreshPushState();
    }
  };

  const handleOpenItem = (id: string, read: boolean) => {
    if (!read) markAsRead([id]);
    setOpen(false);
    router.push("/routes");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground", className)}
          aria-label={unreadCount > 0 ? `${unreadCount} avisos não lidos` : "Avisos"}
        >
          {unreadCount > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Avisos das minhas rotas</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => markAllAsRead()}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Marcar lidas
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">
              Nenhum aviso ainda. Você será avisado quando uma rota nova chegar ou a sua for alterada.
            </p>
          ) : (
            notifications.map(n => {
              const meta = TYPE_ICON[n.type] || { icon: Bell, className: "text-muted-foreground" };
              const Icon = meta.icon;
              const unread = !n.readAt;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleOpenItem(n.id, !unread)}
                  className={cn("w-full text-left flex gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-muted/60 transition-colors", unread && "bg-primary/5")}
                >
                  <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", meta.className)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>{n.title}</p>
                      {unread && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t p-2 space-y-1.5">
          {pushState === "on" && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <BellRing className="h-3.5 w-3.5" /> Avisos no aparelho ativados
              </span>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={pushBusy} onClick={handleDisablePush}>Desativar</Button>
            </div>
          )}
          {pushState === "ready" && (
            <Button variant="outline" size="sm" className="w-full text-xs" disabled={pushBusy} onClick={handleEnablePush}>
              <BellRing className="h-3.5 w-3.5 mr-1.5" /> {pushBusy ? "Ativando..." : "Receber avisos no aparelho (mesmo com o app fechado)"}
            </Button>
          )}
          {pushState === "denied" && (
            <p className="text-[11px] text-muted-foreground">Os avisos estão bloqueados neste navegador. Libere nas configurações do site para receber com o app fechado.</p>
          )}
          {pushState === "unconfigured" && canAskPermission && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => Notification.requestPermission().then(() => setOpen(false))}
            >
              <BellRing className="h-3.5 w-3.5 mr-1.5" /> Ativar avisos do sistema (com o app em segundo plano)
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
