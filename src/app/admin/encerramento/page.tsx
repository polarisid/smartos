"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { AlertTriangle, Camera, ClipboardCheck, Copy, Download, Loader2, PackageCheck, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/context/AuthContext";
import { useCodes, useTechnicians } from "@/hooks/queries";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import {
  buildClosingSummary, buildServiceOrderText, closingPartsForOrder, indexStopsBySO,
  type ClosingPart,
} from "@/lib/orderClosing";
import type { ServiceOrder, TechnicalReportPhoto } from "@/lib/data";
import { downloadPhotosZip } from "@/lib/photoZip";
import { routeService } from "@/services/supabase/routeService";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { technicalReportService } from "@/services/supabase/technicalReportService";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  reparo_samsung: "Reparo Samsung",
  visita_orcamento_samsung: "Visita Orçamento",
  visita_assurant: "Visita Assurant",
  coleta_eco_rma: "Coleta Eco/RMA",
  instalacao_inicial: "Instalação Inicial",
};

const PAGE_SIZE = 25;
const NONE = "all";

type Entry = {
  order: ServiceOrder;
  technicianName: string;
  parts: ClosingPart[];
  text: string;
  missingTracking: number;
  /** undefined = ainda carregando; [] = sem relatório fotográfico. */
  photos: TechnicalReportPhoto[] | undefined;
};

export default function OrderClosingPage() {
  const { toast } = useToast();
  const { activeUnidadeId, appUser } = useAuth();
  const enabled = !!appUser?.uid;
  const keyBase = [activeUnidadeId, appUser?.uid];

  const [from, setFrom] = useState(() => format(subDays(new Date(), 6), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [technicianId, setTechnicianId] = useState(NONE);
  const [search, setSearch] = useState("");
  const [onlyFinalized, setOnlyFinalized] = useState(true);
  const [onlyWithParts, setOnlyWithParts] = useState(false);
  const [onlyMissingTracking, setOnlyMissingTracking] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const start = useMemo(() => startOfDay(new Date(`${from}T12:00:00`)), [from]);
  const end = useMemo(() => endOfDay(new Date(`${to}T12:00:00`)), [to]);
  const rangeOk = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end;

  const { data: orders = [], isLoading: loadingOrders, isError: errOrders } = useQuery({
    queryKey: ["closing-orders", ...keyBase, from, to],
    queryFn: () => serviceOrderService.getByDateRange(start, end, activeUnidadeId),
    enabled: enabled && rangeOk,
  });
  // Rotas inclusive as de entrega: é nelas que ficam as peças e os códigos de rastreio.
  const { data: routes = [], isLoading: loadingRoutes } = useQuery({
    queryKey: ["closing-routes", ...keyBase],
    queryFn: () => routeService.getAll(activeUnidadeId, { includeDelivery: true }),
    enabled,
    staleTime: 2 * 60 * 1000,
  });
  // Fotos do relatório fotográfico de cada OS do período (carregam depois da lista, que aparece sem esperar).
  const { data: photosBySO } = useQuery({
    queryKey: ["closing-photos", ...keyBase, from, to, orders.length],
    queryFn: () => technicalReportService.getPhotosByServiceOrderNumbers(orders.map(o => o.serviceOrderNumber), activeUnidadeId),
    enabled: enabled && orders.length > 0,
    staleTime: 2 * 60 * 1000,
  });
  const { data: technicians = [] } = useTechnicians();
  const { data: codes } = useCodes();

  const techName = useMemo(() => new Map(technicians.map(t => [t.id, t.name])), [technicians]);
  const stopsBySO = useMemo(() => indexStopsBySO(routes), [routes]);

  const entries: Entry[] = useMemo(() => orders.map(order => {
    const parts = closingPartsForOrder(order, stopsBySO);
    const category = order.equipmentType as "TV/AV" | "DA";
    const technicianName = techName.get(order.technicianId) || "—";
    return {
      order,
      technicianName,
      parts,
      text: buildServiceOrderText(order, {
        technicianName,
        symptoms: codes?.symptomCodes?.[category],
        repairs: codes?.repairCodes?.[category],
      }),
      missingTracking: parts.filter(p => p.status === "usada" && !p.trackingCode).length,
      photos: photosBySO ? (photosBySO.get(order.serviceOrderNumber) ?? []) : undefined,
    };
  }), [orders, stopsBySO, techName, codes, photosBySO]);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return entries.filter(e => {
      if (onlyFinalized && e.order.isFinalized === false) return false;
      if (technicianId !== NONE && e.order.technicianId !== technicianId) return false;
      if (q && !e.order.serviceOrderNumber.toUpperCase().includes(q)) return false;
      if (onlyWithParts && !e.parts.some(p => p.status === "usada")) return false;
      if (onlyMissingTracking && e.missingTracking === 0) return false;
      return true;
    });
  }, [entries, onlyFinalized, technicianId, search, onlyWithParts, onlyMissingTracking]);

  const totals = useMemo(() => ({
    orders: filtered.length,
    withParts: filtered.filter(e => e.parts.some(p => p.status === "usada")).length,
    missing: filtered.filter(e => e.missingTracking > 0).length,
  }), [filtered]);

  const copy = async (text: string, what: string) => {
    const ok = await copyToClipboard(text);
    toast(ok ? { title: `${what} copiado!` } : { variant: "destructive", title: "Não foi possível copiar" });
  };

  const loading = loadingOrders || loadingRoutes;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6" /> Encerramento de Ordens</h1>
        <p className="text-sm text-muted-foreground">
          Para cada OS lançada: o texto gerado pelo técnico, as peças usadas e os rastreios das peças, prontos para copiar.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="c-from">De</Label>
            <Input id="c-from" type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); setVisible(PAGE_SIZE); }} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-to">Até</Label>
            <Input id="c-to" type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setVisible(PAGE_SIZE); }} />
          </div>
          <div className="grid gap-2">
            <Label>Técnico</Label>
            <Select value={technicianId} onValueChange={v => { setTechnicianId(v); setVisible(PAGE_SIZE); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Todos os técnicos</SelectItem>
                {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-search">Nº da OS</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="c-search" className="pl-8" value={search} onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }} placeholder="Buscar" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyFinalized} onChange={e => { setOnlyFinalized(e.target.checked); setVisible(PAGE_SIZE); }} />
              Só atendimentos finalizados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyWithParts} onChange={e => { setOnlyWithParts(e.target.checked); setVisible(PAGE_SIZE); }} />
              Só com peças usadas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyMissingTracking} onChange={e => { setOnlyMissingTracking(e.target.checked); setVisible(PAGE_SIZE); }} />
              Só com rastreio pendente
            </label>
          </div>
        </CardContent>
      </Card>

      {!rangeOk ? (
        <p className="text-sm text-destructive">Período inválido: a data inicial deve ser anterior à final.</p>
      ) : errOrders ? (
        <p className="text-sm text-destructive">Não foi possível carregar as ordens de serviço.</p>
      ) : loading ? (
        <p className="p-4 text-center text-sm text-muted-foreground">Carregando ordens...</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{totals.orders}</span> OS · <span className="font-semibold text-foreground">{totals.withParts}</span> com peças usadas
            {totals.missing > 0 && <> · <span className="font-semibold text-amber-600">{totals.missing} com rastreio pendente</span></>}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">Nenhuma OS encontrada neste período.</div>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.slice(0, visible).map(e => (
                <OrderCard key={e.order.id} entry={e} onCopy={copy} />
              ))}
              {filtered.length > visible && (
                <Button variant="outline" className="self-center" onClick={() => setVisible(v => v + PAGE_SIZE)}>
                  Mostrar mais ({filtered.length - visible} restantes)
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrderCard({ entry, onCopy }: { entry: Entry; onCopy: (text: string, what: string) => void }) {
  const { order, technicianName, parts, text, missingTracking, photos } = entry;
  const used = parts.filter(p => p.status === "usada");
  const notUsed = parts.filter(p => p.status === "nao_usada");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-lg">
            {order.serviceOrderNumber}
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar nº da OS" onClick={() => onCopy(order.serviceOrderNumber, "Nº da OS")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {order.isFinalized === false && <Badge variant="secondary">Pendência</Badge>}
            {missingTracking > 0 && (
              <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
                <AlertTriangle className="mr-1 h-3 w-3" /> {missingTracking} rastreio pendente
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {format(order.date, "dd/MM/yyyy HH:mm")} · {technicianName} · {order.equipmentType} · {SERVICE_TYPE_LABELS[order.serviceType] || order.serviceType}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => onCopy(buildClosingSummary(text, parts), "Texto e peças")}>
          <Copy className="mr-2 h-4 w-4" /> Copiar tudo
        </Button>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Texto do técnico</p>
            <Button variant="ghost" size="sm" onClick={() => onCopy(text, "Texto")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar texto</Button>
          </div>
          <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-sm">{text}</pre>
        </div>

        <div className="grid content-start gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium"><PackageCheck className="h-4 w-4" /> Peças usadas e rastreio</p>
          {used.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Nenhuma peça usada nesta OS{notUsed.length > 0 ? ` (a rota tem ${notUsed.length} peça(s) não usada(s))` : ""}.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Peça</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Rastreio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {used.map(p => (
                  <TableRow key={p.code}>
                    <TableCell>
                      <p className="font-mono text-sm">{p.code}</p>
                      <p className="text-xs text-muted-foreground">{p.description || (p.fromRoute ? "" : "Fora das peças da rota")}</p>
                      {p.defective && <p className="text-xs font-semibold text-destructive">Peça nova com defeito</p>}
                    </TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell>
                      {p.trackingCode ? (
                        <span className="inline-flex items-center gap-1 font-mono text-sm">
                          {p.trackingCode}
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Copiar rastreio" onClick={() => onCopy(p.trackingCode!, "Rastreio")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">não informado</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {notUsed.length > 0 && used.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{notUsed.length} peça(s) da rota não usada(s)</summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                {notUsed.map(p => (
                  <li key={p.code}><span className="font-mono">{p.code}</span>{p.description ? ` - ${p.description}` : ""}{p.trackingCode ? ` · rastreio ${p.trackingCode}` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <PhotosSection serviceOrderNumber={order.serviceOrderNumber} photos={photos} />
      </CardContent>
    </Card>
  );
}

function PhotosSection({ serviceOrderNumber, photos }: { serviceOrderNumber: string; photos: TechnicalReportPhoto[] | undefined }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const count = photos?.length ?? 0;

  const download = async () => {
    if (!photos || photos.length === 0) return;
    setProgress({ done: 0, total: photos.length });
    try {
      const r = await downloadPhotosZip(serviceOrderNumber, photos, (done, total) => setProgress({ done, total }));
      if (r.downloaded === 0) toast({ variant: "destructive", title: "Não foi possível baixar as fotos" });
      else if (r.failed > 0) toast({ variant: "destructive", title: "ZIP baixado com falhas", description: `${r.failed} foto(s) não puderam ser baixadas e ficaram de fora.` });
      else toast({ title: "ZIP baixado!", description: `${r.downloaded} foto(s) da OS ${serviceOrderNumber}.` });
    } catch (e) {
      console.error("Erro ao gerar o ZIP de fotos:", e);
      toast({ variant: "destructive", title: "Não foi possível gerar o ZIP" });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 lg:col-span-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Camera className="h-4 w-4" /> Fotos{count > 0 ? ` (${count})` : ""}
        {photos === undefined && <span className="text-xs font-normal text-muted-foreground">carregando...</span>}
        {photos !== undefined && count === 0 && <span className="text-xs font-normal text-muted-foreground">sem relatório fotográfico para esta OS</span>}
      </p>
      <Button variant="outline" size="sm" onClick={download} disabled={count === 0 || progress !== null}>
        {progress ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Baixando {progress.done}/{progress.total}</>
        ) : (
          <><Download className="mr-2 h-4 w-4" /> Baixar fotos (ZIP)</>
        )}
      </Button>
    </div>
  );
}
