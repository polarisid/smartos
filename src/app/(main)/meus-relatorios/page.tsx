"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Camera, CloudUpload, Download, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTechnicians } from "@/hooks/queries";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { buildAndDownloadPdf } from "@/lib/technicalReportPdf";
import { flushQueue, subscribe, subscribeSync, type PendingReport, type SyncState } from "@/lib/offlineReportQueue";
import type { TechnicalReport } from "@/lib/data";

const TYPE_LABEL: Record<string, string> = { reparo: "Reparo", visita: "Visita" };

export default function MeusRelatoriosPage() {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const { data: technicians = [] } = useTechnicians();
  const isTechnician = appUser?.role === "technician" || appUser?.role === "counter_technician";
  // Admin/master abrindo esta tela escolhem o técnico; o técnico vê os próprios.
  const [pickedTechId, setPickedTechId] = useState("");
  const technicianId = isTechnician ? appUser?.uid || "" : pickedTechId;

  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [sync, setSync] = useState<SyncState>({ isFlushing: false });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: reports = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["meus-relatorios", appUser?.uid, technicianId],
    queryFn: () => technicalReportService.getByTechnician(technicianId),
    enabled: !!technicianId,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    const unsubscribe = subscribe(setPending);
    const unsubscribeSync = subscribeSync(setSync);
    return () => { unsubscribe(); unsubscribeSync(); };
  }, []);

  // Terminou de enviar algum: traz a lista atualizada sem o técnico precisar puxar.
  useEffect(() => {
    if (sync.lastResult?.sent) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.lastResult?.at]);

  const term = search.trim().toLowerCase();
  const matches = (os: string, model?: string) => !term || os.toLowerCase().includes(term) || (model || "").toLowerCase().includes(term);
  const visiblePending = pending.filter(p => matches(p.payload.serviceOrderNumber, p.payload.productModel));
  const visibleReports = useMemo(
    () => reports.filter(r => matches(r.serviceOrderNumber, r.productModel)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, term]
  );

  const downloadSent = async (report: TechnicalReport) => {
    setDownloadingId(report.id);
    try {
      await buildAndDownloadPdf(report);
    } catch (e) {
      console.error("Falha ao gerar PDF", e);
      toast({ variant: "destructive", title: "Erro ao gerar o PDF", description: "Verifique a conexão e tente de novo." });
    } finally {
      setDownloadingId(null);
    }
  };

  // Relatório ainda no aparelho: o PDF sai das fotos locais, sem depender de rede.
  const downloadPending = async (item: PendingReport) => {
    setDownloadingId(item.localId);
    const blobUrls: string[] = [];
    try {
      const localPhotoUrls: Record<string, string> = {};
      const photos = item.photos.map((p, i) => {
        const path = `local-${i}`;
        if ("file" in p) {
          const url = URL.createObjectURL(p.file);
          blobUrls.push(url);
          localPhotoUrls[path] = url;
          return { category: p.category, order: p.order, url, path };
        }
        return { category: p.category, order: p.order, url: p.url, path: p.path };
      });
      await buildAndDownloadPdf(
        { id: item.existingReportId || "pendente", createdAt: new Date(item.createdAt), updatedAt: new Date(), ...item.payload, photos },
        { localPhotoUrls }
      );
    } catch (e) {
      console.error("Falha ao gerar PDF", e);
      toast({ variant: "destructive", title: "Erro ao gerar o PDF" });
    } finally {
      blobUrls.forEach(URL.revokeObjectURL);
      setDownloadingId(null);
    }
  };

  const retryNow = async () => {
    const result = await flushQueue();
    if (result.status === "skipped-offline") toast({ variant: "destructive", title: "Sem internet no momento" });
    else if (result.status === "skipped-running") toast({ title: "Já está enviando" });
    else if (result.status === "done" && result.failed > 0) toast({ variant: "destructive", title: "Não foi possível enviar", description: result.error });
  };

  return (
    <div className="max-w-3xl mx-auto w-full space-y-4 animate-in fade-in ease-out duration-300">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Meus Relatórios</h2>
        <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching || !technicianId} aria-label="Atualizar">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {!isTechnician && (
        <Select value={pickedTechId} onValueChange={setPickedTechId}>
          <SelectTrigger className="max-w-xs"><SelectValue placeholder="Escolha um técnico" /></SelectTrigger>
          <SelectContent>
            {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por OS ou modelo..." className="pl-8" />
      </div>

      {visiblePending.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <CloudUpload className="h-4 w-4" /> {sync.isFlushing ? "Enviando agora" : "Aguardando envio"} ({visiblePending.length})
          </h3>
          {visiblePending.map(item => (
            <Card key={item.localId} className="border-amber-500/40">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold">{item.payload.serviceOrderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.createdAt), "dd/MM/yyyy 'às' HH:mm")} · {item.photos.length} foto{item.photos.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {sync.isFlushing
                    ? <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Enviando</Badge>
                    : <Badge variant="outline" className="text-amber-700 border-amber-400">No aparelho</Badge>}
                </div>
                {item.lastError && !sync.isFlushing && (
                  <p className="text-xs text-red-600 flex items-start gap-1"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {item.lastError}</p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => downloadPending(item)} disabled={downloadingId === item.localId}>
                    {downloadingId === item.localId ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} Baixar PDF
                  </Button>
                  {!sync.isFlushing && <Button size="sm" variant="outline" onClick={retryNow}>Enviar agora</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Enviados {technicianId ? `(${visibleReports.length})` : ""}</h3>
        {!technicianId ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">Escolha um técnico para ver os relatórios.</div>
        ) : isError ? (
          <div className="flex flex-col items-center p-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground">Não foi possível carregar. Verifique a conexão e tente de novo.</p>
          </div>
        ) : isLoading ? (
          <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : visibleReports.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">
            {term ? "Nenhum relatório encontrado para essa busca." : "Nenhum relatório enviado ainda."}
          </div>
        ) : (
          visibleReports.map(report => (
            <Card key={report.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold">{report.serviceOrderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(report.createdAt, "dd/MM/yyyy 'às' HH:mm")}
                      {report.productModel ? ` · ${report.productModel}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Badge variant="outline">{TYPE_LABEL[report.reportType || "reparo"] || "Reparo"}</Badge>
                    <Badge variant="secondary" className="gap-1"><Camera className="h-3 w-3" /> {report.photos.length}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => downloadSent(report)} disabled={downloadingId === report.id}>
                    {downloadingId === report.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} Baixar PDF
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/report-view/${encodeURIComponent(report.serviceOrderNumber)}`}>
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ver
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
