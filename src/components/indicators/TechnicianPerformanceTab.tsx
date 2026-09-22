"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { startOfMonth, endOfMonth, addMonths, isWithinInterval, isAfter, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTechnicians, useServiceOrders, useReturns, useAllRoutes } from "@/hooks/queries";

type SortKey = "pendingRate" | "effectiveness" | "returnRate" | "osCount" | "revenue";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "pendingRate", label: "Pior taxa de pendência" },
  { key: "effectiveness", label: "Pior efetividade de rotas" },
  { key: "returnRate", label: "Pior taxa de retorno" },
  { key: "osCount", label: "Maior volume de OS" },
  { key: "revenue", label: "Maior faturamento" },
];

const formatBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(0)}%`);

// Verde/âmbar/vermelho pela distância da meta implícita - "invert" quando menor é melhor
// (pendência, retorno) ao invés de maior é melhor (efetividade, limpeza).
function rateBadgeClass(value: number | null, invert: boolean): string {
  if (value === null) return "text-muted-foreground";
  const good = invert ? value <= 10 : value >= 85;
  const bad = invert ? value >= 25 : value < 60;
  if (bad) return "text-rose-600 dark:text-rose-400 font-semibold";
  if (good) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  return "text-amber-600 dark:text-amber-400 font-semibold";
}

export function TechnicianPerformanceTab() {
  const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
  const { data: serviceOrders = [], isLoading: loadingSo } = useServiceOrders();
  const { data: returns = [], isLoading: loadingReturns } = useReturns();
  const { data: allRoutes = [], isLoading: loadingRoutes } = useAllRoutes();
  const isLoading = loadingTech || loadingSo || loadingReturns || loadingRoutes;

  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [sortKey, setSortKey] = useState<SortKey>("pendingRate");

  const monthStart = month;
  const monthEnd = endOfMonth(month);

  const rows = useMemo(() => {
    return technicians.map(tech => {
      const techOrders = serviceOrders.filter(os =>
        os.technicianId === tech.id && isWithinInterval(os.date, { start: monthStart, end: monthEnd })
      );
      const osCount = techOrders.length;
      const pendingCount = techOrders.filter(os => os.isFinalized === false).length;
      const pendingRate = osCount > 0 ? (pendingCount / osCount) * 100 : null;

      const cleaningCount = techOrders.filter(os => os.cleaningPerformed).length;
      const cleaningRate = osCount > 0 ? (cleaningCount / osCount) * 100 : null;

      const revenue = techOrders.reduce((sum, os) => {
        if (os.serviceType === "visita_orcamento_samsung" && os.samsungBudgetApproved && os.samsungBudgetValue) {
          return sum + os.samsungBudgetValue;
        }
        return sum;
      }, 0);

      const techReturns = returns.filter(r =>
        r.technicianId === tech.id && r.returnDate && isWithinInterval(r.returnDate, { start: monthStart, end: monthEnd })
      );
      const returnRate = osCount > 0 ? (techReturns.length / osCount) * 100 : null;

      // Mesma definição da "Efetividade de rotas" do Dashboard (média do % de conclusão
      // de cada rota, não o total de paradas somado) - aqui filtrada por técnico e mês,
      // em vez de "último mês corrido" e geral.
      const techRoutes = allRoutes.filter(route => {
        if (route.isDraft || route.isCanceled) return false;
        if (route.technicianId !== tech.id) return false;
        const opDate = (route.departureDate || route.plannedDate || route.createdAt) as Date | undefined;
        return !!opDate && isWithinInterval(opDate, { start: monthStart, end: monthEnd });
      });
      const completionPercents = techRoutes.map(route => {
        const stops = route.stops || [];
        if (stops.length === 0) return null;
        const completed = stops.filter(stop => {
          const related = serviceOrders.filter(os =>
            os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt as Date)
          );
          if (related.length === 0) return false;
          const mostRecent = [...related].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
          return mostRecent.isFinalized !== false;
        }).length;
        return (completed / stops.length) * 100;
      }).filter((p): p is number => p !== null);
      const effectiveness = completionPercents.length > 0
        ? completionPercents.reduce((a, b) => a + b, 0) / completionPercents.length
        : null;

      return {
        technician: tech,
        osCount,
        pendingCount,
        pendingRate,
        cleaningCount,
        cleaningRate,
        revenue,
        returnCount: techReturns.length,
        returnRate,
        routeCount: techRoutes.length,
        effectiveness,
      };
    }).filter(r => r.osCount > 0 || r.routeCount > 0);
  }, [technicians, serviceOrders, returns, allRoutes, monthStart, monthEnd]);

  const sortedRows = useMemo(() => {
    const value = (r: (typeof rows)[number]): number => {
      switch (sortKey) {
        case "pendingRate": return r.pendingRate ?? -1;
        case "effectiveness": return r.effectiveness ?? 101; // sem rota no mês não é "ruim" - manda pro fim
        case "returnRate": return r.returnRate ?? -1;
        case "osCount": return r.osCount;
        case "revenue": return r.revenue;
      }
    };
    // "Pior primeiro": pendência/retorno/volume/faturamento = maior primeiro; efetividade = menor primeiro.
    const ascending = sortKey === "effectiveness";
    return [...rows].sort((a, b) => ascending ? value(a) - value(b) : value(b) - value(a));
  }, [rows, sortKey]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="h-5 w-5" /> Desempenho por Técnico</CardTitle>
          <CardDescription>
            Indicadores calculados a partir das OS e rotas do próprio sistema, mês a mês.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(m => startOfMonth(addMonths(m, -1)))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold capitalize w-36 text-center">
                {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
                disabled={startOfMonth(addMonths(month, 1)) > startOfMonth(new Date())}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Ordenar por</span>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : sortedRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhuma OS ou rota registrada nesse mês.</p>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-center">OS no mês</TableHead>
                    <TableHead className="text-center">Pendência</TableHead>
                    <TableHead className="text-center">Retorno</TableHead>
                    <TableHead className="text-center">Efetividade de Rotas</TableHead>
                    <TableHead className="text-center">Limpezas</TableHead>
                    <TableHead className="text-right">Faturamento Líquido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map(row => (
                    <TableRow key={row.technician.id}>
                      <TableCell className="font-medium">{row.technician.name}</TableCell>
                      <TableCell className="text-center font-mono">{row.osCount}</TableCell>
                      <TableCell className="text-center">
                        <span className={rateBadgeClass(row.pendingRate, true)}>{pct(row.pendingRate)}</span>
                        {row.pendingCount > 0 && <span className="text-[10px] text-muted-foreground ml-1">({row.pendingCount})</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={rateBadgeClass(row.returnRate, true)}>{pct(row.returnRate)}</span>
                        {row.returnCount > 0 && <span className="text-[10px] text-muted-foreground ml-1">({row.returnCount})</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={rateBadgeClass(row.effectiveness, false)}>{pct(row.effectiveness)}</span>
                        {row.routeCount > 0 && <span className="text-[10px] text-muted-foreground ml-1">({row.routeCount} rota{row.routeCount !== 1 ? "s" : ""})</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Sparkles className="h-3.5 w-3.5 text-primary" /> {row.cleaningCount}
                        </span>
                        {row.osCount > 0 && <span className="text-[10px] text-muted-foreground ml-1">({pct(row.cleaningRate)})</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatBRL(row.revenue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
