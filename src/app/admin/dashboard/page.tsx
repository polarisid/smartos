"use client";

import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
    Wrench, Tv, WashingMachine, ShieldCheck, ListTree, ClipboardCheck, History, Trophy, FileMinus, DollarSign, Target,
    Route as RouteIcon, CheckCircle, CalendarClock, TrendingUp, TrendingDown, AlertTriangle, Clock, Minus,
} from "lucide-react";
import { type ServiceOrder, type Technician, type Return, type Chargeback, type Route } from "@/lib/data";
import { startOfWeek, startOfMonth, isAfter, startOfYear, isToday, eachWeekOfInterval, endOfWeek, subWeeks, subMonths, subYears, subDays, format, startOfDay, endOfDay, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTechnicians, useServiceOrders, useReturns, useChargebacks, useActiveRoutes, useDraftRoutes, useAllRoutes } from "@/hooks/queries";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import React from "react";

// Selo de variação vs. o período equivalente anterior (ex: essa semana x semana
// passada). `goodDirection` diz se subir é bom (OS, faturamento) ou ruim
// (retornos, estornos) pra colorir certo.
function DeltaPill({ pct, goodDirection = 'up' }: { pct: number | null; goodDirection?: 'up' | 'down' }) {
    if (pct === null) return null;
    const isFlat = Math.abs(pct) < 0.5;
    const isUp = pct > 0;
    const isGood = goodDirection === 'up' ? isUp : !isUp;
    const colorClass = isFlat
        ? "bg-muted text-muted-foreground"
        : isGood
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
    const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
    return (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${colorClass}`}>
            <Icon className="h-3 w-3" />
            {isUp && !isFlat ? "+" : ""}{pct.toFixed(0)}%
        </span>
    );
}

// Ícone com fundo colorido (tom suave) - reforça a identidade de cada métrica
// de relance, em vez do ícone cinza neutro repetido em todo card.
function StatIconBadge({ icon: Icon, colorClass }: { icon: React.ElementType; colorClass: string }) {
    return (
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
            <Icon className="h-4 w-4" />
        </div>
    );
}


function GeneralDashboard({
    technicians,
    serviceOrders,
    returns,
    chargebacks,
    activeRoutes,
    draftRoutes,
    allRoutes,
    filterPeriod,
    setFilterPeriod,
}: {
    technicians: Technician[],
    serviceOrders: ServiceOrder[],
    returns: Return[],
    chargebacks: Chargeback[],
    activeRoutes: Route[],
    draftRoutes: Route[],
    allRoutes: Route[],
    filterPeriod: 'today' | 'this_week' | 'this_month' | 'this_year' | 'all_time',
    setFilterPeriod: (period: 'today' | 'this_week' | 'this_month' | 'this_year' | 'all_time') => void,
}) {
    const now = new Date();
    const [isTodayDetailOpen, setIsTodayDetailOpen] = useState(false);

    const filterLabels: Record<typeof filterPeriod, string> = {
        today: "Hoje",
        this_week: "Semana",
        this_month: "Mês",
        this_year: "Ano",
        all_time: "Total"
    };

    const filterByDate = (date: Date) => {
        if (filterPeriod === 'all_time') return true;
        if (filterPeriod === 'today') return isToday(date);
        if (filterPeriod === 'this_week') return isAfter(date, startOfWeek(now, { weekStartsOn: 1 }));
        if (filterPeriod === 'this_month') return isAfter(date, startOfMonth(now));
        if (filterPeriod === 'this_year') return isAfter(date, startOfYear(now));
        return true;
    }

    const filteredServiceOrders = serviceOrders.filter(os => filterByDate(os.date));
    const filteredReturns = returns.filter(r => r.returnDate && filterByDate(r.returnDate));
    const filteredChargebacks = chargebacks.filter(c => filterByDate(c.date));
    
    const totalOsFiltered = filteredServiceOrders.length;
    const totalReturnsFiltered = filteredReturns.length;
    
    const totalRevenueFiltered = filteredServiceOrders.reduce((total, os) => {
        if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
            return total + os.samsungBudgetValue;
        }
        return total;
    }, 0);


    const totalChargebacksFiltered = filteredChargebacks.reduce((total, c) => total + c.value, 0);

    const netRevenueFiltered = totalRevenueFiltered - totalChargebacksFiltered;

    const netBonusFiltered = netRevenueFiltered.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // ── Comparação com o período equivalente anterior (ex: essa semana x semana
    // passada) - "all_time" não tem um "anterior" que faça sentido, então fica sem selo.
    const previousPeriodRange = (): [Date, Date] | null => {
        if (filterPeriod === 'today') {
            const y = subDays(now, 1);
            return [startOfDay(y), endOfDay(y)];
        }
        if (filterPeriod === 'this_week') {
            const curStart = startOfWeek(now, { weekStartsOn: 1 });
            return [subWeeks(curStart, 1), curStart];
        }
        if (filterPeriod === 'this_month') {
            const curStart = startOfMonth(now);
            return [subMonths(curStart, 1), curStart];
        }
        if (filterPeriod === 'this_year') {
            const curStart = startOfYear(now);
            return [subYears(curStart, 1), curStart];
        }
        return null;
    };
    const prevRange = previousPeriodRange();
    const filterByPrevRange = (date: Date) => !!prevRange && isAfter(date, prevRange[0]) && isBefore(date, prevRange[1]);

    const prevServiceOrders = prevRange ? serviceOrders.filter(os => filterByPrevRange(os.date)) : [];
    const prevReturns = prevRange ? returns.filter(r => r.returnDate && filterByPrevRange(r.returnDate)) : [];
    const prevChargebacks = prevRange ? chargebacks.filter(c => filterByPrevRange(c.date)) : [];
    const prevTotalOs = prevServiceOrders.length;
    const prevTotalReturns = prevReturns.length;
    const prevRevenue = prevServiceOrders.reduce((total, os) => {
        if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
            return total + os.samsungBudgetValue;
        }
        return total;
    }, 0);
    const prevChargebacksTotal = prevChargebacks.reduce((total, c) => total + c.value, 0);
    const prevNetRevenue = prevRevenue - prevChargebacksTotal;

    // pctChange null = sem período anterior pra comparar (all_time, ou anterior zerado)
    const pctChange = (current: number, previous: number): number | null => {
        if (!prevRange) return null;
        if (previous === 0) return current > 0 ? 100 : null;
        return ((current - previous) / previous) * 100;
    };
    const osChangePct = pctChange(totalOsFiltered, prevTotalOs);
    const revenueChangePct = pctChange(netRevenueFiltered, prevNetRevenue);
    const returnsChangePct = pctChange(totalReturnsFiltered, prevTotalReturns);
    const chargebacksChangePct = pctChange(totalChargebacksFiltered, prevChargebacksTotal);

    // ── Rotas: retrato rápido de agora, sem repetir o detalhe por rota do Command Center ──
    // Só conta paradas agendadas pra hoje (firstVisitDate) - uma rota ativa de interior pode
    // ter paradas de vários dias, e não queremos somar os dias futuros aqui. Mesma regra de
    // status (completed/pending/todo) usada no Command Center, pra bater com o resto do painel.
    const todayStr = format(now, 'dd/MM/yyyy');
    const todayStopsDetailed: { serviceOrder: string; city: string; routeName: string; status: 'completed' | 'pending' | 'todo' }[] = [];
    activeRoutes.forEach(route => {
        (route.stops || []).forEach(stop => {
            if ((stop.firstVisitDate || '').trim() !== todayStr) return;
            const matchedOs = serviceOrders
                .filter(os => os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt))
                .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
            const status: 'completed' | 'pending' | 'todo' = matchedOs
                ? (matchedOs.isFinalized === false ? 'pending' : 'completed')
                : 'todo';
            todayStopsDetailed.push({ serviceOrder: stop.serviceOrder, city: stop.city || '', routeName: route.name, status });
        });
    });
    const stopsCompletedToday = todayStopsDetailed.filter(s => s.status === 'completed').length;
    const stopsPendingToday = todayStopsDetailed.filter(s => s.status === 'pending').length;
    const stopsTodoToday = todayStopsDetailed.filter(s => s.status === 'todo').length;
    const stopsPlannedToday = todayStopsDetailed.length;

    // ── Taxa de Efetividade: MÉDIA do % de conclusão de cada rota do último mês (não
    // só as ativas hoje - amostra pequena demais) - uma rota 50% concluída e outra 100%
    // dão média de 75%, não um número ponderado pela quantidade de paradas de cada uma.
    // Desconsidera rascunhos (nunca foram a campo) e rotas canceladas.
    const oneMonthAgo = subMonths(now, 1);
    const routesLastMonth = allRoutes.filter(route => {
        if (route.isDraft || route.isCanceled) return false;
        const routeDate = route.departureDate || route.plannedDate || route.createdAt;
        return routeDate && isAfter(routeDate, oneMonthAgo);
    });
    const routeCompletionPercents = routesLastMonth.map(route => {
        const stops = route.stops || [];
        if (stops.length === 0) return null;
        const completed = stops.filter(stop => {
            const relatedOs = serviceOrders.filter(os =>
                os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt)
            );
            if (relatedOs.length === 0) return false;
            const mostRecent = [...relatedOs].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
            return mostRecent.isFinalized !== false;
        }).length;
        return (completed / stops.length) * 100;
    }).filter((p): p is number => p !== null);
    const routeEffectivenessPct = routeCompletionPercents.length > 0
        ? routeCompletionPercents.reduce((a, b) => a + b, 0) / routeCompletionPercents.length
        : null;

    // ── Agenda: rascunhos com data planejada nos próximos dias - o que precisa de preparo ──
    const today = startOfDay(now);
    const upcomingDraftRoutes = draftRoutes
        .filter(r => r.plannedDate && !isBefore(startOfDay(new Date(r.plannedDate)), today))
        .sort((a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime())
        .slice(0, 6);

    // ── Evoluções: OS e faturamento líquido por semana (últimas 8 semanas) ──
    const weekStarts = eachWeekOfInterval(
        { start: subWeeks(startOfWeek(now, { weekStartsOn: 1 }), 7), end: now },
        { weekStartsOn: 1 }
    );
    const weeklyTrend = weekStarts.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        const weekOs = serviceOrders.filter(os => isAfter(os.date, weekStart) && !isAfter(os.date, weekEnd));
        const weekChargebacks = chargebacks.filter(c => isAfter(c.date, weekStart) && !isAfter(c.date, weekEnd));
        const grossRevenue = weekOs.reduce((total, os) => {
            if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
                return total + os.samsungBudgetValue;
            }
            return total;
        }, 0);
        const chargebacksTotal = weekChargebacks.reduce((total, c) => total + c.value, 0);
        return {
            label: format(weekStart, "dd/MM"),
            osCount: weekOs.length,
            revenue: grossRevenue - chargebacksTotal,
        };
    });

    const performanceData = technicians.map(tech => {
        const techOrders = filteredServiceOrders.filter(os => os.technicianId === tech.id);
        const techChargebacks = filteredChargebacks.filter(c => c.technicianId === tech.id);

        const grossRevenue = techOrders.reduce((total, os) => {
            if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
                return total + os.samsungBudgetValue;
            }
            return total;
        }, 0);


        const totalChargebacks = techChargebacks.reduce((total, c) => total + c.value, 0);
        const netRevenue = grossRevenue - totalChargebacks;

        const goal = tech.goal || 0;
        const progress = goal > 0 ? Math.min((netRevenue / goal) * 100, 100) : 0;
        const cleaningsCount = techOrders.filter(os => os.cleaningPerformed).length;
        
        return {
          technician: tech,
          osCount: techOrders.length,
          revenue: netRevenue,
          goal,
          progress,
          cleaningsCount,
        };
    }).sort((a, b) => b.revenue - a.revenue);

    const osByEquipmentType = filteredServiceOrders.reduce((acc, os) => {
        if (!acc[os.equipmentType]) {
        acc[os.equipmentType] = 0;
        }
        acc[os.equipmentType]++;
        return acc;
    }, {} as Record<ServiceOrder['equipmentType'], number>);

    const osByServiceType = filteredServiceOrders.reduce((acc, os) => {
        if (!acc[os.serviceType]) {
        acc[os.serviceType] = 0;
        }
        acc[os.serviceType]++;
        return acc;
    }, {} as Record<ServiceOrder['serviceType'], number>);

    const serviceTypeConfig: Record<ServiceOrder['serviceType'], { label: string; icon: React.ElementType }> = {
        reparo_samsung: { label: "Reparo Samsung", icon: Wrench },
        visita_orcamento_samsung: { label: "Visita Orçamento Samsung", icon: ClipboardCheck },
        visita_assurant: { label: "Visita Assurant", icon: ShieldCheck },
        coleta_eco_rma: { label: "Coleta Eco /RMA", icon: Wrench },
        instalacao_inicial: { label: "Instalação Inicial", icon: Wrench },
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <Tabs defaultValue="this_month" onValueChange={(value) => setFilterPeriod(value as any)} className="w-full sm:w-auto">
                    <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
                        <TabsTrigger value="today">Hoje</TabsTrigger>
                        <TabsTrigger value="this_week">Semana</TabsTrigger>
                        <TabsTrigger value="this_month">Mês</TabsTrigger>
                        <TabsTrigger value="this_year">Ano</TabsTrigger>
                        <TabsTrigger value="all_time">Total</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <RouteIcon className="h-4 w-4 text-blue-500" /> Rotas agora
                        </CardTitle>
                        <CardDescription>Retrato rápido de hoje - detalhe por rota fica no Command Center.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 text-center">
                            <p className="text-2xl font-bold">{activeRoutes.length}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Ativas hoje</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsTodayDetailOpen(true)}
                            className="rounded-lg border p-3 text-center hover:bg-accent/50 hover:border-primary/40 transition-colors cursor-pointer"
                        >
                            <p className="text-2xl font-bold">{stopsCompletedToday}<span className="text-muted-foreground/50">/{stopsPlannedToday}</span></p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1"><CheckCircle className="h-3 w-3" /> Atendimentos hoje</p>
                            {stopsPendingToday > 0 && (
                                <p className="text-[11px] text-amber-600 mt-1 flex items-center justify-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> {stopsPendingToday} pendente{stopsPendingToday !== 1 ? "s" : ""}
                                </p>
                            )}
                        </button>
                        <div className="rounded-lg border p-3 text-center" title="Média do % de conclusão de cada rota do último mês, excluindo rascunhos e canceladas (não o total de paradas somado)">
                            <p className="text-2xl font-bold">{routeEffectivenessPct !== null ? `${routeEffectivenessPct.toFixed(0)}%` : "—"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" /> Efetividade de rotas</p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <CalendarClock className="h-4 w-4 text-amber-500" /> Agenda - próximos dias
                        </CardTitle>
                        <CardDescription>Rascunhos com data planejada que ainda precisam de preparo.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {upcomingDraftRoutes.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">Nenhum rascunho com data planejada por vir.</p>
                        ) : (
                            <div className="space-y-2">
                                {upcomingDraftRoutes.map(route => {
                                    const missingCrew = !route.technicianId || !route.licensePlate;
                                    return (
                                        <div key={route.id} className="flex items-center justify-between gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{route.name}</p>
                                                <p className="text-xs text-muted-foreground">{format(new Date(route.plannedDate!), "EEEE, dd/MM", { locale: ptBR })}</p>
                                            </div>
                                            {missingCrew ? (
                                                <Badge variant="outline" className="shrink-0 gap-1 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
                                                    <AlertTriangle className="h-3 w-3" /> Sem técnico/veículo
                                                </Badge>
                                            ) : (
                                                <span className="shrink-0 text-xs text-muted-foreground">{route.technicianName}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isTodayDetailOpen} onOpenChange={setIsTodayDetailOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Atendimentos de hoje</DialogTitle>
                        <DialogDescription>
                            {format(now, "EEEE, dd/MM/yyyy", { locale: ptBR })} · {stopsPlannedToday} parada{stopsPlannedToday !== 1 ? "s" : ""} planejada{stopsPlannedToday !== 1 ? "s" : ""}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {stopsPlannedToday === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma parada agendada pra hoje.</p>
                        ) : (
                            ([
                                { key: 'pending' as const, label: 'Pendentes', count: stopsPendingToday, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', Icon: AlertTriangle },
                                { key: 'todo' as const, label: 'Ainda faltando', count: stopsTodoToday, color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/40', Icon: Clock },
                                { key: 'completed' as const, label: 'Concluídas', count: stopsCompletedToday, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', Icon: CheckCircle },
                            ]).map(({ key, label, count, color, bg, Icon }) => {
                                if (count === 0) return null;
                                const items = todayStopsDetailed.filter(s => s.status === key);
                                return (
                                    <div key={key}>
                                        <div className={`flex items-center gap-1.5 text-sm font-semibold mb-2 ${color}`}>
                                            <Icon className="h-4 w-4" /> {label} ({count})
                                        </div>
                                        <div className="space-y-1">
                                            {items.map((item, i) => (
                                                <div key={`${item.serviceOrder}-${i}`} className={`flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5 ${bg}`}>
                                                    <div className="min-w-0 truncate">
                                                        <span className="font-mono font-bold">{item.serviceOrder}</span>
                                                        {item.city && <span className="text-muted-foreground"> · {item.city}</span>}
                                                    </div>
                                                    <span className="text-muted-foreground shrink-0 truncate max-w-[130px]">{item.routeName}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <TrendingUp className="h-4 w-4 text-blue-500" /> OS por semana
                        </CardTitle>
                        <CardDescription>Últimas 8 semanas.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                    formatter={(value: number) => [value, "OS"]}
                                />
                                <Bar dataKey="osCount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <DollarSign className="h-4 w-4 text-emerald-500" /> Faturamento líquido por semana
                        </CardTitle>
                        <CardDescription>Últimas 8 semanas.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={weeklyTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                                <Tooltip
                                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                                    formatter={(value: number) => [value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), "Líquido"]}
                                />
                                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Resumo do período selecionado</h2>
             <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ordens de Serviço ({filterLabels[filterPeriod]})</CardTitle>
                    <StatIconBadge icon={Wrench} colorClass="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold">{totalOsFiltered}</div>
                        <DeltaPill pct={osChangePct} goodDirection="up" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Total de OS no período selecionado</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Faturamento Líquido ({filterLabels[filterPeriod]})</CardTitle>
                    <StatIconBadge icon={DollarSign} colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-2xl font-bold">{netBonusFiltered}</div>
                        <DeltaPill pct={revenueChangePct} goodDirection="up" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Valor líquido (com estornos) no período</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Retornos ({filterLabels[filterPeriod]})</CardTitle>
                    <StatIconBadge icon={History} colorClass="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2">
                        <div className="text-2xl font-bold">{totalReturnsFiltered}</div>
                        <DeltaPill pct={returnsChangePct} goodDirection="down" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Retornos no período selecionado</p>
                </CardContent>
                </Card>
                <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Estornos ({filterLabels[filterPeriod]})</CardTitle>
                    <StatIconBadge icon={FileMinus} colorClass="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-2xl font-bold text-destructive">-{totalChargebacksFiltered.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <DeltaPill pct={chargebacksChangePct} goodDirection="down" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Estornos (chargebacks) no período</p>
                </CardContent>
                </Card>
            </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Desempenho por Técnico</CardTitle>
                    <CardDescription>Contagem de OS e acompanhamento de metas no período.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>Técnico</TableHead>
                        <TableHead className="text-center">OS no Período</TableHead>
                        <TableHead className="text-center">Limpezas</TableHead>
                        <TableHead className="text-right">Faturamento Líquido</TableHead>
                        <TableHead className="w-[250px] text-right">Progresso da Meta</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {performanceData.map((data) => (
                        <TableRow key={data.technician.id}>
                            <TableCell className="font-medium">{data.technician.name}</TableCell>
                            <TableCell className="text-center">{data.osCount}</TableCell>
                            <TableCell className="text-center">{data.cleaningsCount}</TableCell>
                            <TableCell className="text-right">{data.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            <TableCell className="text-right">
                                <div className="flex flex-col items-end gap-1">
                                    <Progress value={data.progress} />
                                    <span className="text-xs text-muted-foreground">
                                        Meta: {data.goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                </div>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </CardContent>
                </Card>

                <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                            <ListTree className="h-5 w-5" />
                            <span>OS por Equipamento</span>
                            </CardTitle>
                            <CardDescription>Distribuição das ordens de serviço no período.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Tv className="h-4 w-4" />
                                    <span>TV/AV</span>
                                </div>
                                <span className="font-bold">{osByEquipmentType['TV/AV'] || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <WashingMachine className="h-4 w-4" />
                                    <span>Linha Branca (DA)</span>
                                </div>
                                <span className="font-bold">{osByEquipmentType['DA'] || 0}</span>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ListTree className="h-5 w-5" />
                                <span>OS por Atendimento</span>
                            </CardTitle>
                            <CardDescription>Distribuição das ordens de serviço no período.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            {Object.entries(serviceTypeConfig).map(([type, config]) => {
                                const Icon = config.icon;
                                const count = osByServiceType[type as keyof typeof osByServiceType] || 0;
                                return (
                                    <div key={type} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Icon className="h-4 w-4" />
                                            <span>{config.label}</span>
                                        </div>
                                        <span className="font-bold">{count}</span>
                                    </div>
                                )
                            })}
                        </CardContent>
                    </Card>
                </div>
        </div>
    );
}

function ReturnsRanking({ technicians, returns }: { technicians: Technician[], returns: Return[] }) {
    const now = new Date();
    const startOfCurrentYear = startOfYear(now);
    
    const returnsThisYear = returns.filter(r => r.returnDate && isAfter(r.returnDate, startOfCurrentYear));

    const returnsByTechnician = technicians.map(tech => {
        const techReturns = returnsThisYear.filter(r => r.technicianId === tech.id);
        const returnCount = techReturns.length;
        const totalDaysToReturn = techReturns.reduce((acc, r) => acc + r.daysToReturn, 0);
        const averageDaysToReturn = returnCount > 0 ? totalDaysToReturn / returnCount : 0;
        
        return {
            ...tech,
            returnCount,
            averageDaysToReturn
        };
    }).sort((a, b) => {
        if (a.returnCount !== b.returnCount) {
            return a.returnCount - b.returnCount;
        }
        return b.averageDaysToReturn - a.averageDaysToReturn;
    });

    const getTrophyColor = (rank: number) => {
        if (rank === 0) return "text-yellow-500";
        if (rank === 1) return "text-gray-400";
        if (rank === 2) return "text-yellow-800";
        return "text-muted-foreground";
    };

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold">Ranking de Retornos</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Ranking Anual de Retornos</CardTitle>
                    <CardDescription>Técnicos com a menor quantidade de retornos no ano corrente.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Posição</TableHead>
                                <TableHead>Técnico</TableHead>
                                <TableHead className="text-center">Total de Retornos (Ano)</TableHead>
                                <TableHead className="text-right">Média de Dias p/ Retorno</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {returnsByTechnician.map((tech, index) => (
                                <TableRow key={tech.id}>
                                    <TableCell className="font-bold text-lg flex items-center gap-2">
                                        <Trophy className={`h-5 w-5 ${getTrophyColor(index)}`} />
                                        <span>#{index + 1}</span>
                                    </TableCell>
                                    <TableCell className="font-medium">{tech.name}</TableCell>
                                    <TableCell className="text-center font-mono font-semibold">{tech.returnCount}</TableCell>
                                    <TableCell className="text-right font-mono font-semibold">{Math.round(tech.averageDaysToReturn)} dias</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


export default function DashboardPage() {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'this_week' | 'this_month' | 'this_year' | 'all_time'>('this_month');
    
    const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
    const { data: serviceOrders = [], isLoading: loadingSo } = useServiceOrders();
    const { data: returns = [], isLoading: loadingRet } = useReturns();
    const { data: chargebacks = [], isLoading: loadingChar } = useChargebacks();
    const { data: activeRoutes = [], isLoading: loadingActiveRoutes } = useActiveRoutes();
    const { data: draftRoutes = [], isLoading: loadingDraftRoutes } = useDraftRoutes();
    const { data: allRoutes = [], isLoading: loadingAllRoutes } = useAllRoutes();

    const isLoading = loadingTech || loadingSo || loadingRet || loadingChar || loadingActiveRoutes || loadingDraftRoutes || loadingAllRoutes;

    if (isLoading) {
        return (
            <div className="p-4 sm:p-6 space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
                </div>
                <Skeleton className="h-64 w-full rounded-xl" />
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
            </div>
        );
    }

  return (
    <div className="p-4 sm:p-6">
        <Tabs defaultValue="general">
            <TabsList className="mb-6 grid w-full grid-cols-2">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="returns">Ranking de Retornos</TabsTrigger>
            </TabsList>
            <TabsContent value="general">
                <GeneralDashboard
                    technicians={technicians}
                    serviceOrders={serviceOrders}
                    returns={returns}
                    chargebacks={chargebacks}
                    activeRoutes={activeRoutes}
                    draftRoutes={draftRoutes}
                    allRoutes={allRoutes}
                    filterPeriod={filterPeriod}
                    setFilterPeriod={setFilterPeriod}
                />
            </TabsContent>
            <TabsContent value="returns">
                <ReturnsRanking technicians={technicians} returns={returns} />
            </TabsContent>
        </Tabs>
    </div>
  );
}
