"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AlertCircle, BadgeCheck, ChevronLeft, ChevronRight, Medal, Sparkles, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { configService } from "@/services/supabase/configService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useTechnicians } from "@/hooks/queries";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import type { ServiceOrder } from "@/lib/data";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SERVICE_TYPE_LABELS: Record<ServiceOrder["serviceType"], string> = {
  reparo_samsung: "Reparo Samsung",
  visita_orcamento_samsung: "Visita Orçamento",
  visita_assurant: "Visita Assurant",
  coleta_eco_rma: "Coleta Eco/RMA",
  instalacao_inicial: "Instalação Inicial",
};

function OrderCard({ os, showValue }: { os: ServiceOrder; showValue?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono font-semibold">{os.serviceOrderNumber}</p>
            <p className="text-xs text-muted-foreground">{format(os.date, "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {showValue && os.samsungBudgetValue != null && (
              <span className="font-bold text-green-600">{brl(os.samsungBudgetValue)}</span>
            )}
            <div className="flex gap-1">
              <Badge variant="outline" className="text-[10px]">{os.equipmentType}</Badge>
              <Badge variant="secondary" className="text-[10px]">{SERVICE_TYPE_LABELS[os.serviceType] || os.serviceType}</Badge>
            </div>
          </div>
        </div>
        {os.productCollectedOrInstalled && <p className="text-sm">{os.productCollectedOrInstalled}</p>}
        {os.observations && <p className="text-xs text-muted-foreground line-clamp-2">{os.observations}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">{text}</div>
  );
}

export default function ProducaoPage() {
  const { appUser, activeUnidadeId } = useAuth();
  const { data: technicians = [] } = useTechnicians();
  const isTechnician = appUser?.role === "technician" || appUser?.role === "counter_technician";

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // Admin/master abrindo esta tela escolhem de qual técnico querem ver; o técnico
  // vê sempre a própria produção (o id do técnico é o mesmo do login).
  const [pickedTechId, setPickedTechId] = useState("");
  const technicianId = isTechnician ? appUser?.uid || "" : pickedTechId;

  // Produção da unidade inteira no mês (a RLS já limita à unidade): dela saem o ranking e a
  // comparação com o mês anterior; as listas abaixo são só as OS do técnico escolhido.
  const monthQuery = (m: Date) => ({
    queryKey: ["producao-equipe", appUser?.uid, m.toISOString()],
    queryFn: () => serviceOrderService.getByDateRange(startOfMonth(m), endOfMonth(m)),
    enabled: !!technicianId,
    staleTime: 60 * 1000,
  });
  const { data: teamOrders = [], isLoading, isError } = useQuery(monthQuery(month));
  const { data: prevTeamOrders = [] } = useQuery(monthQuery(addMonths(month, -1)));
  const { data: goals } = useQuery({
    queryKey: ["tech-goals", appUser?.uid, activeUnidadeId],
    queryFn: () => configService.getTechGoals(activeUnidadeId),
    enabled: !!appUser?.uid,
    staleTime: 5 * 60 * 1000,
  });

  const orders = useMemo(() => teamOrders.filter(os => os.technicianId === technicianId), [teamOrders, technicianId]);

  const { cleanings, approved, budgetVisits } = useMemo(() => {
    const budgetVisits = orders.filter(os => os.serviceType === "visita_orcamento_samsung");
    return {
      cleanings: orders.filter(os => os.cleaningPerformed),
      approved: budgetVisits.filter(os => os.samsungBudgetApproved),
      budgetVisits,
    };
  }, [orders]);

  // Contagem por técnico (limpezas e orçamentos aprovados) -> posição no ranking da unidade.
  const countsByTech = (list: ServiceOrder[]) => {
    const map = new Map<string, { cleanings: number; approved: number }>();
    list.forEach(os => {
      if (!os.technicianId) return;
      const c = map.get(os.technicianId) || { cleanings: 0, approved: 0 };
      if (os.cleaningPerformed) c.cleanings++;
      if (os.serviceType === "visita_orcamento_samsung" && os.samsungBudgetApproved) c.approved++;
      map.set(os.technicianId, c);
    });
    return map;
  };
  const teamCounts = useMemo(() => countsByTech(teamOrders), [teamOrders]);
  const prevCounts = useMemo(() => countsByTech(prevTeamOrders), [prevTeamOrders]);
  const rankOf = (metric: "cleanings" | "approved") => {
    const mine = teamCounts.get(technicianId)?.[metric] ?? 0;
    const values = Array.from(teamCounts.values()).map(c => c[metric]);
    return { position: values.filter(v => v > mine).length + 1, total: values.length, mine };
  };
  const rankCleanings = rankOf("cleanings");
  const rankApproved = rankOf("approved");
  const prevMine = prevCounts.get(technicianId) || { cleanings: 0, approved: 0 };

  const approvedTotal = approved.reduce((sum, os) => sum + (os.samsungBudgetValue || 0), 0);
  const conversion = budgetVisits.length > 0 ? (approved.length / budgetVisits.length) * 100 : 0;
  const isCurrentMonth = startOfMonth(new Date()).getTime() === month.getTime();

  return (
    <div className="w-full animate-in fade-in ease-out duration-300 space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Minha Produção</h2>

      {!isTechnician && (
        <Select value={pickedTechId} onValueChange={setPickedTechId}>
          <SelectTrigger className="max-w-xs"><SelectValue placeholder="Escolha um técnico" /></SelectTrigger>
          <SelectContent>
            {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center justify-between rounded-lg border p-2">
        <Button variant="ghost" size="icon" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold">{format(month, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth(m => addMonths(m, 1))} disabled={isCurrentMonth} aria-label="Próximo mês">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {!technicianId ? (
        <EmptyState text="Escolha um técnico para ver a produção." />
      ) : isError ? (
        <div className="flex flex-col items-center p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar. Verifique a conexão e tente de novo.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3 text-center">
                <Sparkles className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-2xl font-bold">{cleanings.length}</p>
                <p className="text-[11px] text-muted-foreground">Limpezas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <BadgeCheck className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-2xl font-bold">{approved.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  Orçamentos aprovados{budgetVisits.length > 0 ? ` (${conversion.toFixed(0)}%)` : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Wallet className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-lg font-bold leading-8">{brl(approvedTotal)}</p>
                <p className="text-[11px] text-muted-foreground">Valor aprovado</p>
              </CardContent>
            </Card>
          </div>

          {/* Metas, ranking e evolução */}
          {(() => {
            const monthEnd = endOfMonth(month);
            const daysLeft = isCurrentMonth ? Math.max(0, differenceInCalendarDays(monthEnd, new Date())) : 0;
            const rows = [
              { key: "cleanings", label: "Limpezas", value: cleanings.length, goal: goals?.cleaningsPerMonth || 0, prev: prevMine.cleanings, rank: rankCleanings },
              { key: "approved", label: "Orçamentos aprovados", value: approved.length, goal: goals?.approvedBudgetsPerMonth || 0, prev: prevMine.approved, rank: rankApproved },
            ];
            return (
              <div className="space-y-2">
                {rows.map(r => {
                  const diff = r.value - r.prev;
                  const pct = r.goal > 0 ? Math.min(100, (r.value / r.goal) * 100) : 0;
                  const missing = Math.max(0, r.goal - r.value);
                  return (
                    <Card key={r.key}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{r.label}</p>
                          <div className="flex items-center gap-3 text-xs">
                            {r.rank.total > 0 && (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold" title="Posição entre os técnicos da unidade neste mês">
                                <Medal className="h-3.5 w-3.5" /> {r.rank.position}º de {r.rank.total}
                              </span>
                            )}
                            <span
                              className={cn(
                                "flex items-center gap-1 font-semibold",
                                diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                              )}
                              title={`Mês anterior fechou com ${r.prev}`}
                            >
                              {diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : diff < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                              {diff > 0 ? `+${diff}` : diff} vs mês anterior ({r.prev})
                            </span>
                          </div>
                        </div>
                        {r.goal > 0 && (
                          <div className="space-y-1">
                            <Progress value={pct} className="h-2" />
                            <p className="text-[11px] text-muted-foreground">
                              {r.value} de {r.goal} da meta ({pct.toFixed(0)}%)
                              {missing === 0
                                ? " — meta batida! 🎉"
                                : isCurrentMonth && daysLeft > 0
                                  ? ` — faltam ${missing}, cerca de ${(missing / daysLeft).toFixed(1).replace(".", ",")} por dia nos ${daysLeft} dia(s) que restam`
                                  : ` — faltaram ${missing}`}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}

          <Tabs defaultValue="limpezas">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="limpezas">Limpezas ({cleanings.length})</TabsTrigger>
              <TabsTrigger value="orcamentos">Orçamentos aprovados ({approved.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="limpezas" className="space-y-2 mt-3">
              {cleanings.length === 0
                ? <EmptyState text="Nenhuma limpeza registrada neste mês." />
                : cleanings.map(os => <OrderCard key={os.id} os={os} />)}
            </TabsContent>
            <TabsContent value="orcamentos" className="space-y-2 mt-3">
              {approved.length === 0
                ? <EmptyState text="Nenhum orçamento aprovado neste mês." />
                : approved.map(os => <OrderCard key={os.id} os={os} showValue />)}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
