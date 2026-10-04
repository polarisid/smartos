"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Suspense } from "react";
import { PermissionErrorDisplay } from "@/components/PermissionErrorDisplay";
import { useAuth } from "@/context/AuthContext";
import { Loader2, CloudUpload, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import { subscribe, subscribeSync, flushQueue, type PendingReport, type SyncState } from "@/lib/offlineReportQueue";
import { useToast } from "@/hooks/use-toast";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

function AppLoadingScreen({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-sidebar">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 15% 20%, rgba(23,233,176,0.10), transparent 40%), radial-gradient(circle at 85% 80%, rgba(76,111,255,0.14), transparent 40%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="relative flex items-center justify-center">
          <span className="absolute inline-flex h-16 w-16 rounded-3xl border-2 border-[#17E9B0]/25 animate-ping" />
          <Logo size={44} />
        </div>
        <div className="flex items-center gap-2 text-sidebar-foreground/70 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-[#17E9B0]" />
          {message}
        </div>
      </div>
    </div>
  );
}

// Aviso de relatórios guardados no aparelho aguardando envio - fica visível em
// qualquer tela do técnico, já que esse layout é compartilhado. Mostra o que
// está acontecendo de verdade: enviando (com foto x de y e %), erro da última
// tentativa, ou aguardando conexão - e responde ao "Tentar agora".
function OfflineQueueBanner() {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [sync, setSync] = useState<SyncState>({ isFlushing: false });
  const [online, setOnline] = useState(true);
  const lastToastAt = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribe(setPending);
    const unsubscribeSync = subscribeSync(setSync);
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();

    flushQueue();
    window.addEventListener('online', flushQueue);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    const interval = setInterval(flushQueue, 60000);

    return () => {
      unsubscribe();
      unsubscribeSync();
      window.removeEventListener('online', flushQueue);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(interval);
    };
  }, []);

  // Aviso de sucesso quando um envio em segundo plano (ou o "Tentar agora")
  // conclui - o aviso do topo some junto com a fila, então sem isso o técnico
  // não saberia que deu certo.
  useEffect(() => {
    const result = sync.lastResult;
    if (!result || result.at === lastToastAt.current) return;
    lastToastAt.current = result.at;
    if (result.sent > 0) {
      toast({ title: result.sent > 1 ? `${result.sent} relatórios enviados!` : "Relatório enviado com sucesso!", description: result.failed > 0 ? "Ainda há relatórios pendentes." : undefined });
    }
  }, [sync.lastResult, toast]);

  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const result = await flushQueue();
      if (result.status === "skipped-running") {
        toast({ title: "Já está enviando", description: "Acompanhe o andamento aqui no topo." });
      } else if (result.status === "skipped-offline") {
        toast({ variant: "destructive", title: "Sem internet no momento", description: "Assim que a conexão voltar o envio é feito sozinho." });
      } else if (result.status === "done" && result.failed > 0) {
        toast({ variant: "destructive", title: "Não foi possível enviar", description: result.error });
      }
      // Sucesso: o toast sai pelo efeito acima (único ponto, evita duplicar).
    } finally {
      setIsRetrying(false);
    }
  };

  if (pending.length === 0 && !sync.isFlushing) return null;

  const failedItem = pending.find(p => p.lastError);
  const prog = sync.progress;

  let tone = "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400";
  let icon = <CloudUpload className="h-4 w-4 shrink-0" />;
  let message: React.ReactNode;

  if (sync.isFlushing) {
    tone = "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400";
    icon = <Loader2 className="h-4 w-4 shrink-0 animate-spin" />;
    const pos = sync.position && sync.position.total > 1 ? ` (${sync.position.index} de ${sync.position.total})` : "";
    message = sync.step === "saving"
      ? <>Enviando relatório{pos} — salvando...</>
      : prog
        ? <>Enviando relatório{pos} — foto {Math.min(prog.doneCount + 1, prog.totalCount)} de {prog.totalCount} · {Math.round(prog.fraction * 100)}%{prog.retrying > 0 ? " · sinal instável, tentando de novo" : ""}</>
        : <>Enviando relatório{pos}...</>;
  } else if (!online) {
    message = <>{pending.length} relatório{pending.length > 1 ? "s" : ""} guardado{pending.length > 1 ? "s" : ""} no aparelho — sem internet no momento. Será enviado sozinho quando a conexão voltar.</>;
  } else if (failedItem) {
    tone = "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400";
    icon = <AlertCircle className="h-4 w-4 shrink-0" />;
    message = <>Não foi possível enviar {pending.length > 1 ? `os ${pending.length} relatórios` : "o relatório"} ({failedItem.lastError}). Nova tentativa automática em até 1 minuto, ou toque em "Tentar agora".</>;
  } else {
    message = <>{pending.length} relatório{pending.length > 1 ? "s" : ""} aguardando envio — será{pending.length > 1 ? "m" : ""} enviado{pending.length > 1 ? "s" : ""} em instantes.</>;
  }

  return (
    <div className={`border-b ${tone} text-sm`}>
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span>{message}</span>
        </div>
        {!sync.isFlushing && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 hover:bg-black/5 dark:hover:bg-white/10" onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? "Tentando..." : "Tentar agora"}
          </Button>
        )}
      </div>
      {sync.isFlushing && prog && <Progress value={prog.fraction * 100} className="h-1 rounded-none" />}
    </div>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/admin/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <AppLoadingScreen message="Verificando permissões..." />;
  }

  return (
    <NotificationsProvider>
      <div className="min-h-screen flex flex-col md:flex-row bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col w-full min-h-screen pt-[64px] md:pt-0 overflow-x-hidden relative">
            <Suspense fallback={null}>
                <PermissionErrorDisplay />
            </Suspense>
            <OfflineQueueBanner />
            <div className="flex-1 w-full p-4 md:p-8">
               {children}
            </div>
            <footer className="glass border-t p-4 flex-none text-center text-xs text-muted-foreground mt-auto">
                <p>SmartService OS - Feito com ❤️ para simplificar sua vida.</p>
            </footer>
        </main>
      </div>
    </NotificationsProvider>
  );
}
