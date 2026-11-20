"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, CloudOff, CloudUpload, HardDrive, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { flushQueue, subscribe, subscribeSync, type PendingReportSummary, type SyncState } from "@/lib/offlineReportQueue";
import { flushTrackingQueue, subscribeTracking } from "@/lib/offlineTrackingQueue";
import { flushVehicleQueue, subscribeVehicleQueue } from "@/lib/offlineVehicleQueue";
import { ageLabel, buildSyncOverview, type SyncOverviewState } from "@/lib/syncOverview";
import { cn } from "@/lib/utils";

const LAST_SYNC_KEY = "smartos_last_sync_at";

const readLastSync = (): number | null => {
  try { const v = Number(localStorage.getItem(LAST_SYNC_KEY)); return v > 0 ? v : null; } catch { return null; }
};
const saveLastSync = (at: number) => { try { localStorage.setItem(LAST_SYNC_KEY, String(at)); } catch { /* sem armazenamento */ } };

const TONE: Record<SyncOverviewState, { box: string; Icon: typeof Cloud }> = {
  ok: { box: "border-emerald-500/30 bg-background text-emerald-700 dark:text-emerald-400", Icon: Cloud },
  pending: { box: "border-amber-500/40 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300", Icon: CloudUpload },
  syncing: { box: "border-blue-500/40 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300", Icon: Loader2 },
  error: { box: "border-red-500/40 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300", Icon: AlertCircle },
  offline: { box: "border-slate-400/50 bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300", Icon: CloudOff },
};

const formatBytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/**
 * Botão fixo com a situação da sincronização do aparelho (online/offline, o que está guardado esperando envio)
 * e uma janela com o detalhe de cada item da fila. Junta as três filas: relatórios com fotos, rastreios e km/abastecimento.
 */
export function SyncStatus() {
  const { toast } = useToast();
  const [reports, setReports] = useState<PendingReportSummary[]>([]);
  const [sync, setSync] = useState<SyncState>({ isFlushing: false });
  const [tracking, setTracking] = useState(0);
  const [vehicle, setVehicle] = useState(0);
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean | null; usage?: number; quota?: number }>({ persisted: null });

  useEffect(() => {
    setLastSync(readLastSync());
    const offReports = subscribe(setReports);
    const offSync = subscribeSync(setSync);
    const offTracking = subscribeTracking(setTracking);
    const offVehicle = subscribeVehicleQueue(setVehicle);
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    // Pede ao navegador para não apagar os relatórios guardados quando faltar espaço no aparelho.
    void navigator.storage?.persist?.().catch(() => undefined);
    return () => {
      offReports(); offSync(); offTracking(); offVehicle();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      clearInterval(tick);
    };
  }, []);

  const overview = useMemo(
    () => buildSyncOverview({ online, isFlushing: sync.isFlushing, reports, trackingCount: tracking, vehicleCount: vehicle, now }),
    [online, sync.isFlushing, reports, tracking, vehicle, now],
  );

  // Quando a fila esvazia depois de ter itens, foi uma sincronização: guarda o horário.
  const hadPending = useRef(false);
  useEffect(() => {
    if (overview.totalPending > 0) { hadPending.current = true; return; }
    if (hadPending.current && overview.state === "ok") {
      hadPending.current = false;
      const at = Date.now();
      saveLastSync(at);
      setLastSync(at);
    }
  }, [overview.totalPending, overview.state]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const s = navigator.storage;
    if (!s) return;
    void Promise.all([s.persisted?.().catch(() => null) ?? null, s.estimate?.().catch(() => null) ?? null]).then(([persisted, est]) =>
      setStorage({ persisted: persisted ?? null, usage: est?.usage, quota: est?.quota }));
  }, [open]);

  const syncAll = async () => {
    setBusy(true);
    try {
      if (!navigator.onLine) {
        toast({ variant: "destructive", title: "Sem internet no momento", description: "Assim que a conexão voltar, tudo é enviado sozinho." });
        return;
      }
      const [r, t, v] = await Promise.all([flushQueue(), flushTrackingQueue(), flushVehicleQueue()]);
      const failed = r.status === "done" && r.failed > 0;
      if (failed) toast({ variant: "destructive", title: "Não foi possível enviar tudo", description: r.status === "done" ? r.error : undefined });
      else if (r.status === "skipped-running") toast({ title: "Já está enviando", description: "Acompanhe o andamento aqui." });
      else if ((r.status === "done" && r.sent > 0) || t.sent > 0 || v.sent > 0) toast({ title: "Envio concluído" });
      else toast({ title: "Nada pendente", description: "Tudo já está sincronizado." });
    } finally {
      setBusy(false);
    }
  };

  const tone = TONE[overview.state];
  const Icon = tone.Icon;
  const compact = overview.state === "ok";
  const prog = sync.progress;
  const label =
    overview.state === "syncing"
      ? sync.step === "saving" ? "Salvando…" : prog ? `Foto ${Math.min(prog.doneCount + 1, prog.totalCount)}/${prog.totalCount}` : "Enviando…"
      : overview.state === "offline" ? (overview.totalPending > 0 ? `Offline · ${overview.totalPending}` : "Offline")
      : overview.state === "ok" ? "" : String(overview.totalPending);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={overview.headline}
        aria-label={`Sincronização: ${overview.headline}`}
        className={cn(
          "fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex items-center gap-1.5 rounded-full border text-xs font-semibold shadow-md transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-4 md:right-4",
          compact ? "h-9 w-9 justify-center opacity-70 hover:opacity-100" : "h-9 px-3",
          tone.box,
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", overview.state === "syncing" && "animate-spin")} />
        {label && <span className="tabular-nums">{label}</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icon className={cn("h-5 w-5", overview.state === "syncing" && "animate-spin")} /> Sincronização</DialogTitle>
            <DialogDescription>{overview.headline}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="flex items-center gap-2">
                {online ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> : <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />}
                {online ? "Com internet" : "Sem internet"}
              </span>
              <span className="text-xs text-muted-foreground">
                {lastSync ? `Última sincronização ${ageLabel(lastSync, now)}` : "Nenhuma sincronização registrada neste aparelho"}
              </span>
            </div>

            {overview.hasMemoryOnly && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-700 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p><strong>Não feche nem atualize a página.</strong> Um relatório está guardado só na memória desta aba (o aparelho não deixou gravar) e se perde ao fechar.</p>
              </div>
            )}

            {overview.totalPending === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                <p className="font-medium text-foreground">Nada esperando envio</p>
                <p className="text-xs">Relatórios, rastreios e registros de veículo estão salvos no servidor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {overview.reports.length > 0 && (
                  <section>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Relatórios ({overview.reports.length})</p>
                    <ul className="divide-y rounded-lg border">
                      {overview.reports.map(r => (
                        <li key={r.localId} className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.title}</span>
                            <span className="text-xs text-muted-foreground">{r.age}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.photoCount} foto(s){r.attempts > 0 ? ` · ${r.attempts} tentativa(s)` : ""}{r.memoryOnly ? " · só na memória da aba" : " · guardado no aparelho"}
                          </p>
                          {r.lastError && <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-700 dark:text-red-400">{r.lastError}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {overview.trackingCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Códigos de rastreio</span><strong className="tabular-nums">{overview.trackingCount}</strong>
                  </div>
                )}
                {overview.vehicleCount > 0 && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <span>Km / abastecimentos</span><strong className="tabular-nums">{overview.vehicleCount}</strong>
                  </div>
                )}
              </div>
            )}

            {sync.isFlushing && prog && (
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Enviando{sync.position && sync.position.total > 1 ? ` relatório ${sync.position.index} de ${sync.position.total}` : ""} — foto {Math.min(prog.doneCount + 1, prog.totalCount)} de {prog.totalCount} · {Math.round(prog.fraction * 100)}%
              </p>
            )}

            <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {storage.persisted ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <HardDrive className="h-4 w-4" />}
                {storage.persisted === null ? "Armazenamento do aparelho" : storage.persisted ? "Armazenamento protegido contra limpeza" : "Armazenamento pode ser limpo pelo aparelho se faltar espaço"}
              </span>
              {storage.usage !== undefined && storage.quota ? <span className="tabular-nums">{formatBytes(storage.usage)} de {formatBytes(storage.quota)}</span> : null}
            </div>

            <div className="flex justify-end">
              <Button onClick={syncAll} disabled={busy || sync.isFlushing} className="gap-1.5">
                {busy || sync.isFlushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {overview.totalPending > 0 ? "Enviar tudo agora" : "Verificar agora"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
