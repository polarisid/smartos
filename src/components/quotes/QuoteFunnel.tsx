"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { BarChart3, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildQuoteSheets, type ExportQuote } from "@/lib/quoteExport";
import { downloadSpreadsheet } from "@/lib/spreadsheetXml";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_OPTIONS, funnelStats, monthlyFunnel, quotesInPeriod, type FunnelQuote, type PeriodKey } from "@/lib/quoteFunnel";
import { cn } from "@/lib/utils";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Stage({ label, count, value, widthPct, barClass, hint }: { label: string; count: number; value: number; widthPct: number; barClass: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <strong className="text-foreground">{count}</strong> · {brl(value)}
          {hint && <span className="ml-1.5 text-xs">({hint})</span>}
        </span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${Math.max(count > 0 ? 2 : 0, Math.min(100, widthPct))}%` }} />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums leading-none", tone)}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Funil dos orçamentos: orçados → aprovados → quitados, taxa de aprovação e valor por período, com a evolução mês a mês. */
export function QuoteFunnel({ quotes }: { quotes: (FunnelQuote & ExportQuote)[] }) {
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [open, setOpen] = useState(true);

  const now = useMemo(() => new Date(), []);
  const periodQuotes = useMemo(() => quotesInPeriod(quotes, period, now), [quotes, period, now]);
  const stats = useMemo(() => funnelStats(periodQuotes), [periodQuotes]);

  const exportSheet = () => {
    const label = PERIOD_OPTIONS.find(p => p.key === period)?.label || "";
    downloadSpreadsheet(`Orçamentos - ${label} - ${format(now, "yyyy-MM-dd")}`, buildQuoteSheets({ quotes: periodQuotes, label, months: monthlyFunnel(quotes, 12, now) }));
  };
  const months = useMemo(() => monthlyFunnel(quotes, 6, now), [quotes, now]);
  const maxMonth = Math.max(1, ...months.map(m => m.stats.total.count));
  const base = Math.max(1, stats.total.count);

  const rateTone = stats.approvalRate === null ? undefined : stats.approvalRate >= 60 ? "text-green-700 dark:text-green-400" : stats.approvalRate >= 35 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-left" aria-expanded={open}>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></span>
          <span>
            <span className="block font-semibold leading-tight">Funil de orçamentos</span>
            <span className="block text-xs text-muted-foreground">Do orçado ao recebido, pela data em que o orçamento foi criado</span>
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={v => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportSheet} disabled={periodQuotes.length === 0} title="Baixa o resumo do funil, a evolução mês a mês e a lista dos orçamentos do período">
            <FileSpreadsheet className="h-4 w-4" /> Exportar planilha
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-5 border-t p-4">
          {stats.total.count === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum orçamento criado neste período.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Kpi label="Taxa de aprovação" value={stats.approvalRate === null ? "—" : `${stats.approvalRate}%`} tone={rateTone}
                  hint={stats.approvalRate === null ? "Ninguém respondeu ainda" : `${stats.aprovado.count} aprovado(s) de ${stats.aprovado.count + stats.reprovado.count} respondido(s)`} />
                <Kpi label="Conversão" value={stats.conversionRate === null ? "—" : `${stats.conversionRate}%`} hint={`${stats.aprovado.count} de ${stats.total.count} orçados viraram serviço`} />
                <Kpi label="Ticket médio" value={brl(stats.avgTicket)} hint="por orçamento aprovado" />
                <Kpi label="Tempo de resposta" value={stats.avgDecisionDays === null ? "—" : stats.avgDecisionDays < 1 ? "menos de 1 dia" : `${String(stats.avgDecisionDays).replace(".", ",")} dia(s)`} hint="entre criar e aprovar/reprovar" />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Funil</p>
                  <Stage label="Orçados" count={stats.total.count} value={stats.total.value} widthPct={100} barClass="bg-slate-400" />
                  <Stage label="Aprovados" count={stats.aprovado.count} value={stats.aprovado.value} widthPct={(stats.aprovado.count / base) * 100} barClass="bg-green-600"
                    hint={stats.conversionRate === null ? undefined : `${stats.conversionRate}% dos orçados`} />
                  <Stage label="Quitados (recebido por inteiro)" count={stats.quitado.count} value={stats.quitado.value} widthPct={(stats.quitado.count / base) * 100} barClass="bg-emerald-400"
                    hint={stats.aprovado.count > 0 ? `${Math.round((stats.quitado.count / stats.aprovado.count) * 100)}% dos aprovados` : undefined} />
                  <div className="flex flex-wrap gap-2 pt-1 text-xs">
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400">Aguardando resposta: {stats.pendente.count} · {brl(stats.pendente.value)}</span>
                    <span className="rounded-full bg-red-600/15 px-2.5 py-1 font-medium text-red-700 dark:text-red-400">Reprovados: {stats.reprovado.count} · {brl(stats.reprovado.value)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-green-600/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Já recebido</p>
                      <p className="font-bold tabular-nums text-green-700 dark:text-green-400">{brl(stats.received)}</p>
                    </div>
                    <div className="rounded-lg bg-orange-500/10 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Falta receber</p>
                      <p className="font-bold tabular-nums text-orange-700 dark:text-orange-400">{brl(stats.toReceive)}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Últimos 6 meses (quantidade de orçamentos)</p>
                  <div className="space-y-2">
                    {months.map(m => {
                      const t = m.stats.total.count;
                      const seg = (n: number) => (n / maxMonth) * 100;
                      return (
                        <div key={m.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{m.label}</span>
                          <div className="flex h-4 w-full overflow-hidden rounded bg-muted" title={`${t} orçamento(s): ${m.stats.aprovado.count} aprovado(s), ${m.stats.pendente.count} pendente(s), ${m.stats.reprovado.count} reprovado(s)`}>
                            <div className="h-full bg-green-600" style={{ width: `${seg(m.stats.aprovado.count)}%` }} />
                            <div className="h-full bg-amber-400" style={{ width: `${seg(m.stats.pendente.count)}%` }} />
                            <div className="h-full bg-red-500" style={{ width: `${seg(m.stats.reprovado.count)}%` }} />
                          </div>
                          <span className="min-w-[8.5rem] text-right tabular-nums text-muted-foreground">
                            {t === 0 ? "—" : <><strong className="text-foreground">{t}</strong> · {m.stats.approvalRate === null ? "sem resposta" : `${m.stats.approvalRate}% aprov.`}</>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-600" /> Aprovado</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400" /> Pendente</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" /> Reprovado</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
