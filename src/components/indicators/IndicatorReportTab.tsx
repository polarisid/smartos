"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { type IndicatorMetric, type IndicatorReport } from "@/lib/data";
import { indicatorReportService } from "@/services/supabase/indicatorReportService";
import { FileUp, ListChecks, Loader2, TrendingUp, TrendingDown, FileText, Building2 } from "lucide-react";

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatMonthLabel(period: string): string {
  const [year, month] = period.split(".");
  const idx = parseInt(month, 10) - 1;
  const name = MONTH_NAMES[idx] || month;
  return `${name}/${(year || "").slice(2)}`;
}

// Mês posterior ao mês corrente não pode ter dado real ainda. Protege relatórios
// já salvos (parseados antes do filtro na API) de mostrar meses que não existem.
function isFutureMonthPeriod(period: string): boolean {
  const [y, m] = (period || "").split(".").map(Number);
  if (!y || !m || m > 12) return false;
  const now = new Date();
  return y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1);
}

function formatWeekLabel(period: string): string {
  const [, week] = period.split(".");
  return `Sem ${week}`;
}

function formatValue(value: number | null, unit: IndicatorMetric["unit"]): string {
  if (value === null || value === undefined) return "-";
  if (unit === "percent") return `${value.toLocaleString("pt-BR")}%`;
  if (unit === "currency") return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return value.toLocaleString("pt-BR");
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function MetricChartCard({ metric }: { metric: IndicatorMetric }) {
  const monthlyData = metric.monthly
    .filter(p => !isFutureMonthPeriod(p.period))
    .map(p => ({ label: formatMonthLabel(p.period), value: p.value }));
  const weeklyData = metric.weekly.map(p => ({ label: formatWeekLabel(p.period), value: p.value }));
  const DirectionIcon = metric.direction === "up" ? TrendingUp : metric.direction === "down" ? TrendingDown : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-1.5">
              {metric.name}
              {DirectionIcon && <DirectionIcon className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
            <CardDescription>{metric.section}</CardDescription>
          </div>
          {metric.meta !== null && (
            <Badge variant="outline" className="shrink-0">Meta: {formatValue(metric.meta, metric.unit)}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Evolução Mensal</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip formatter={(v: any) => formatValue(v, metric.unit)} contentStyle={{ fontSize: 12 }} />
                {metric.meta !== null && <ReferenceLine y={metric.meta} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />}
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Últimas Semanas</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={36} />
                <Tooltip formatter={(v: any) => formatValue(v, metric.unit)} contentStyle={{ fontSize: 12 }} />
                {metric.meta !== null && <ReferenceLine y={metric.meta} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />}
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrackMetricsDialog({ report, trackedKeys, onSave }: { report: IndicatorReport; trackedKeys: string[]; onSave: (metrics: { key: string; name: string; section: string }[]) => Promise<void> }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setSelected(new Set(trackedKeys));
  }, [isOpen, trackedKeys]);

  const grouped = useMemo(() => {
    const map = new Map<string, IndicatorMetric[]>();
    report.metrics.forEach(m => {
      if (!map.has(m.section)) map.set(m.section, []);
      map.get(m.section)!.push(m);
    });
    return Array.from(map.entries());
  }, [report]);

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const metrics = report.metrics.filter(m => selected.has(m.key)).map(m => ({ key: m.key, name: m.name, section: m.section }));
      await onSave(metrics);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ListChecks className="mr-2 h-4 w-4" /> Escolher Indicadores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Indicadores acompanhados</DialogTitle>
          <DialogDescription>Escolha quais indicadores do relatório aparecem nos gráficos de evolução.</DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-4 max-h-[60vh] overflow-y-auto">
          {grouped.map(([section, metrics]) => (
            <div key={section}>
              <p className="text-sm font-semibold mb-2">{section}</p>
              <div className="space-y-2">
                {metrics.map(m => (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={selected.has(m.key)} onCheckedChange={() => toggle(m.key)} />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : `Salvar seleção (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IndicatorReportTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<IndicatorReport | null>(null);
  const [trackedKeys, setTrackedKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSeconds, setUploadSeconds] = useState(0);

  const load = async () => {
    setIsLoading(true);
    try {
      const [latest, tracked] = await Promise.all([
        indicatorReportService.getLatest(),
        indicatorReportService.getTrackedMetrics(),
      ]);
      setReport(latest);
      setTrackedKeys(tracked.map(t => t.metricKey));
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao carregar relatório de indicadores" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsUploading(true);
    setUploadSeconds(0);
    const timer = setInterval(() => setUploadSeconds(s => s + 1), 1000);
    try {
      const pdfBase64 = await readFileAsBase64(file);
      const res = await fetch("/api/indicators/parse-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64 }),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar o PDF.");

      const saved = await indicatorReportService.replace({
        fileName: file.name,
        partnerName: data.partnerName,
        location: data.location,
        metrics: data.metrics,
      });
      setReport(saved);
      toast({ title: "Relatório importado!", description: `${data.metrics.length} indicadores extraídos do PDF.` });
    } catch (error: any) {
      console.error(error);
      const message = error.name === "TimeoutError" || error.name === "AbortError"
        ? "A IA demorou demais para processar o PDF. Tente novamente."
        : error.message;
      toast({ variant: "destructive", title: "Erro ao importar PDF", description: message });
    } finally {
      clearInterval(timer);
      setIsUploading(false);
    }
  };

  const handleSaveTracked = async (metrics: { key: string; name: string; section: string }[]) => {
    try {
      await indicatorReportService.setTrackedMetrics(metrics);
      setTrackedKeys(metrics.map(m => m.key));
      toast({ title: "Seleção de indicadores salva!" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao salvar seleção" });
    }
  };

  const trackedMetrics = useMemo(() => {
    if (!report) return [];
    const keySet = new Set(trackedKeys);
    return report.metrics.filter(m => keySet.has(m.key));
  }, [report, trackedKeys]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" /> Relatório de Performance (PDF)</CardTitle>
          <CardDescription>Envie o PDF de indicadores da Samsung para atualizar os gráficos de evolução mensal e semanal.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="indicator-pdf-input" />
          <Button asChild disabled={isUploading}>
            <label htmlFor="indicator-pdf-input" className="cursor-pointer">
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {isUploading ? `Processando PDF... (${uploadSeconds}s)` : "Enviar PDF do relatório"}
            </label>
          </Button>
          {isUploading && (
            <p className="text-sm text-muted-foreground">A IA está lendo a tabela do relatório - isso costuma levar de 1 a 2 minutos, não feche esta aba.</p>
          )}
          {!isUploading && report && (
            <div className="text-sm text-muted-foreground space-y-0.5">
              {report.partnerName && <p className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {report.partnerName}</p>}
              {report.fileName && <p className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {report.fileName} · atualizado em {report.uploadedAt.toLocaleString("pt-BR")}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center p-8 text-muted-foreground">Carregando...</div>
      ) : !report ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-10">
            Nenhum relatório enviado ainda. Envie um PDF para gerar os gráficos de evolução.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Gráficos de Evolução</h2>
            <TrackMetricsDialog report={report} trackedKeys={trackedKeys} onSave={handleSaveTracked} />
          </div>

          {trackedMetrics.length === 0 ? (
            <Card>
              <CardContent className="text-center text-muted-foreground py-10">
                Nenhum indicador selecionado ainda. Clique em "Escolher Indicadores" para montar os gráficos.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {trackedMetrics.map(metric => <MetricChartCard key={metric.key} metric={metric} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
