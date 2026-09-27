"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Suspense } from "react";
import { PermissionErrorDisplay } from "@/components/PermissionErrorDisplay";
import { useAuth } from "@/context/AuthContext";
import { Loader2, CloudUpload } from "lucide-react";
import { Logo } from "@/components/Logo";
import { subscribe, flushQueue, type PendingReport } from "@/lib/offlineReportQueue";
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

// Indicador de relatórios salvos no aparelho aguardando internet pra sincronizar
// - fica visível em qualquer tela do técnico, já que esse layout é compartilhado.
function OfflineQueueBanner() {
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe(setPending);

    flushQueue();
    window.addEventListener('online', flushQueue);
    const interval = setInterval(flushQueue, 60000);

    return () => {
      unsubscribe();
      window.removeEventListener('online', flushQueue);
      clearInterval(interval);
    };
  }, []);

  if (pending.length === 0) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await flushQueue();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
      <div className="flex items-center gap-2">
        <CloudUpload className="h-4 w-4 shrink-0" />
        <span>
          {pending.length} relatório{pending.length > 1 ? "s" : ""} aguardando envio - será{pending.length > 1 ? "m" : ""} enviado{pending.length > 1 ? "s" : ""} sozinho{pending.length > 1 ? "s" : ""} quando a internet voltar.
        </span>
      </div>
      <Button variant="ghost" size="sm" className="h-7 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20" onClick={handleRetry} disabled={isRetrying}>
        {isRetrying ? "Tentando..." : "Tentar agora"}
      </Button>
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
  );
}
