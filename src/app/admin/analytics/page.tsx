"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Route, type ServiceOrder } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    TrendingUp, TrendingDown, Minus, Clock, Route as RouteIcon,
    CheckCircle2, AlertTriangle, Zap, BarChart2, Target, Timer
} from "lucide-react";
import {
    format, isToday, isYesterday, isAfter, startOfDay, subDays, parse, isValid
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAppData } from "@/context/AppDataContext";

// ─── helpers ────────────────────────────────────────────────────────────────
const WORK_START = 8;   // 8 AM
const WORK_END   = 18;  // 6 PM
const WORK_HOURS = WORK_END - WORK_START;

function expectedPct(): number {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    const elapsed = Math.max(0, Math.min(h - WORK_START, WORK_HOURS));
    return Math.round((elapsed / WORK_HOURS) * 100);
}

function formatHour(h: number): string {
    return `${String(h).padStart(2, "0")}h`;
}

// ─── types ───────────────────────────────────────────────────────────────────
interface RouteStats {
    id: string;
    name: string;
    technicianName: string;
    total: number;
    completed: number;
    actualPct: number;
    expectedPct: number;
    gap: number; // actualPct - expectedPct
    estimatedEnd: Date | null;
    status: "ahead" | "on-track" | "behind" | "critical";
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
    const { technicians } = useAppData();
    const [routes, setRoutes] = useState<Route[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);        // wide window — for route completion
    const [comparisonOrders, setComparisonOrders] = useState<ServiceOrder[]>([]); // 2-day window — for the chart
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        // ── Listener 1: Active routes ──────────────────────────────────────
        const routesQ = query(collection(db, "routes"), where("isActive", "==", true));
        let unsubRouteSOs: (() => void) | null = null;

        const unsubRoutes = onSnapshot(routesQ, snap => {
            const loadedRoutes = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id, ...d,
                    createdAt: (d.createdAt as Timestamp)?.toDate(),
                    departureDate: (d.departureDate as Timestamp)?.toDate(),
                } as Route;
            });
            setRoutes(loadedRoutes);

            // Determine the earliest createdAt among all active routes
            const fallback = subDays(new Date(), 30);
            const oldestRouteDate = loadedRoutes.reduce<Date>((oldest, r) => {
                const d = r.createdAt as Date | undefined;
                if (d && d < oldest) return d;
                return oldest;
            }, fallback);

            // Tear down previous route-SO listener before creating a new one
            if (unsubRouteSOs) unsubRouteSOs();

            // Wide window: needed to count completions for route tracking
            const routeSoQ = query(collection(db, "serviceOrders"), where("date", ">=", oldestRouteDate));
            unsubRouteSOs = onSnapshot(routeSoQ, snap => {
                setServiceOrders(snap.docs.map(doc => {
                    const d = doc.data();
                    return { id: doc.id, ...d, date: (d.date as Timestamp).toDate() } as ServiceOrder;
                }));
            });
        });

        // ── Listener 2: Comparison OS (always just 2 days, for the chart) ──
        const twoDaysAgo = subDays(new Date(), 2);
        const compSoQ = query(collection(db, "serviceOrders"), where("date", ">=", twoDaysAgo));
        const unsubCompSOs = onSnapshot(compSoQ, snap => {
            setComparisonOrders(snap.docs.map(doc => {
                const d = doc.data();
                return { id: doc.id, ...d, date: (d.date as Timestamp).toDate() } as ServiceOrder;
            }));
        });

        return () => { unsubRoutes(); if (unsubRouteSOs) unsubRouteSOs(); unsubCompSOs(); };
    }, []);

    // ── Yesterday vs Today hourly ──────────────────────────────────────────
    const comparison = useMemo(() => {
        const todayByHour: number[] = Array(24).fill(0);
        const yesterdayByHour: number[] = Array(24).fill(0);

        // Use the narrow 2-day window and only count explicitly finalized orders
        comparisonOrders.forEach(os => {
            if (os.isFinalized !== true) return; // strict: must be explicitly finalized
            const h = os.date.getHours();
            if (isToday(os.date)) todayByHour[h]++;
            else if (isYesterday(os.date)) yesterdayByHour[h]++;
        });

        const curHour = currentTime.getHours();
        let todayTotal = 0, yesterdayTotal = 0;
        for (let h = 0; h <= curHour; h++) {
            todayTotal   += todayByHour[h];
            yesterdayTotal += yesterdayByHour[h];
        }

        const hours = Array.from({ length: 13 }, (_, i) => i + WORK_START).map(h => ({
            h, label: formatHour(h),
            today: todayByHour[h],
            yesterday: yesterdayByHour[h],
        }));

        const maxVal = Math.max(...hours.map(d => Math.max(d.today, d.yesterday)), 1);

        return { hours, maxVal, todayTotal, yesterdayTotal, trend: todayTotal - yesterdayTotal, curHour };
    }, [serviceOrders, currentTime]);

    // ── Route completion rate & projection ───────────────────────────────
    const routeStats = useMemo((): RouteStats[] => {
        const xPct = expectedPct();
        const todayStart = startOfDay(new Date()).getTime();

        return routes.map(route => {
            const stops = route.stops || [];
            const total = stops.length;
            if (total === 0) return null;

            const createdAt = route.createdAt as Date;
            const completedStops = stops.filter(stop =>
                serviceOrders.some(os =>
                    os.serviceOrderNumber === stop.serviceOrder &&
                    createdAt && isAfter(os.date, createdAt) &&
                    os.isFinalized !== false
                )
            );
            const completed = completedStops.length;
            const actualPct = Math.round((completed / total) * 100);
            
            // Se a rota foi criada antes de hoje, a expectativa é 100% (pois o dia já passou)
            const routeIsPast = createdAt && createdAt.getTime() < todayStart;
            const routeXPct = routeIsPast ? 100 : xPct;
            
            const gap = actualPct - routeXPct;

            // Projection: rate = completions per ms worked today
            const msWorked = Math.max(Date.now() - todayStart - WORK_START * 3600_000, 1000);
            const ratePerMs = completed / msWorked;
            const remaining = total - completed;
            let estimatedEnd: Date | null = null;
            if (ratePerMs > 0 && remaining > 0) {
                const msLeft = remaining / ratePerMs;
                estimatedEnd = new Date(Date.now() + msLeft);
            } else if (remaining === 0) {
                estimatedEnd = new Date(); // already done
            }

            let status: RouteStats["status"] = "on-track";
            if (gap > 10) status = "ahead";
            else if (gap < -20) status = "critical";
            else if (gap < -8) status = "behind";

            return {
                id: route.id,
                name: route.name,
                technicianName: route.technicianName || "N/A",
                total,
                completed,
                actualPct,
                expectedPct: routeXPct,
                gap,
                estimatedEnd,
                status,
            };
        }).filter(Boolean) as RouteStats[];
    }, [routes, serviceOrders, currentTime]);

    // ─────────────────────────────────────────────────────────────────────
    const statusColor: Record<string, string> = {
        ahead    : "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
        "on-track": "text-blue-400 border-blue-500/30 bg-blue-500/5",
        behind   : "text-yellow-400 border-yellow-500/30 bg-yellow-500/5",
        critical : "text-red-400 border-red-500/30 bg-red-500/5",
    };
    const statusLabel: Record<string, string> = {
        ahead    : "Adiantada",
        "on-track": "Em dia",
        behind   : "Atrasada",
        critical : "Crítica",
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 space-y-8">
            {/* Header */}
            <header className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 flex items-center gap-3">
                        <BarChart2 className="h-8 w-8 text-blue-400" />
                        Análise de Produtividade
                    </h1>
                    <p className="text-slate-400 mt-1">Comparativos, ritmo de rotas e projeções do dia</p>
                </div>
                <div className="text-right hidden sm:block">
                    <div className="text-3xl font-bold text-white tracking-wider">
                        {format(currentTime, "HH:mm")}
                    </div>
                    <div className="text-slate-400 text-sm mt-0.5 capitalize">
                        {format(currentTime, "EEEE, d 'de' MMMM", { locale: ptBR })}
                    </div>
                </div>
            </header>

            {/* ── 1. Comparativo Ontem × Hoje ─────────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-400" /> Comparativo Ontem × Hoje
                </h2>

                {/* Summary pills */}
                <div className="grid grid-cols-3 gap-4">
                    <Card className="border border-slate-800 bg-slate-900/40">
                        <CardContent className="p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hoje (até agora)</span>
                            <span className="text-4xl font-black text-white">{comparison.todayTotal}</span>
                            <span className="text-xs text-slate-500">atendimentos</span>
                        </CardContent>
                    </Card>
                    <Card className="border border-slate-800 bg-slate-900/40">
                        <CardContent className="p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ontem (mesmo horário)</span>
                            <span className="text-4xl font-black text-slate-400">{comparison.yesterdayTotal}</span>
                            <span className="text-xs text-slate-500">atendimentos</span>
                        </CardContent>
                    </Card>
                    <Card className={`border backdrop-blur-md ${comparison.trend > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : comparison.trend < 0 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/20'}`}>
                        <CardContent className="p-4 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tendência</span>
                            <div className="flex items-center gap-2">
                                {comparison.trend > 0
                                    ? <TrendingUp className="h-6 w-6 text-emerald-400" />
                                    : comparison.trend < 0
                                        ? <TrendingDown className="h-6 w-6 text-red-400" />
                                        : <Minus className="h-6 w-6 text-slate-400" />}
                                <span className={`text-4xl font-black ${comparison.trend > 0 ? 'text-emerald-300' : comparison.trend < 0 ? 'text-red-300' : 'text-slate-400'}`}>
                                    {comparison.trend > 0 ? "+" : ""}{comparison.trend}
                                </span>
                            </div>
                            <span className="text-xs text-slate-500">vs. ontem neste horário</span>
                        </CardContent>
                    </Card>
                </div>

                {/* Dual bar chart */}
                <Card className="border border-slate-800 bg-slate-900/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-4">
                            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500 inline-block" /> Hoje</span>
                            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-600 inline-block" /> Ontem</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-6">
                        <div className="flex items-end gap-1 h-48">
                            {comparison.hours.map(d => {
                                const isPast = d.h <= comparison.curHour;
                                const todayH = (d.today / comparison.maxVal) * 160;
                                const yestH  = (d.yesterday / comparison.maxVal) * 160;
                                return (
                                    <div key={d.h} className="flex-1 flex flex-col items-center gap-0.5">
                                        <div className="flex items-end gap-0.5 w-full">
                                            {/* Yesterday bar */}
                                            <div className="flex-1 rounded-t transition-all duration-700 bg-slate-700/60"
                                                style={{ height: `${Math.max(yestH, d.yesterday > 0 ? 3 : 0)}px` }} />
                                            {/* Today bar */}
                                            <div
                                                className={`flex-1 rounded-t transition-all duration-700 ${isPast ? 'bg-gradient-to-t from-blue-600 to-cyan-400' : 'bg-slate-800/40'}`}
                                                style={{ height: `${Math.max(todayH, d.today > 0 ? 3 : 0)}px` }}
                                            />
                                        </div>
                                        <span className={`text-[8px] font-mono ${d.h === comparison.curHour ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>{d.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* ── 2. Taxa de Conclusão por Rota ───────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <Target className="h-5 w-5 text-blue-400" /> Taxa de Conclusão por Rota
                    <span className="ml-auto text-xs text-slate-500 font-mono font-normal">
                        Esperado a esta hora: <span className="text-blue-400 font-bold">{expectedPct()}%</span>
                    </span>
                </h2>

                {routeStats.length === 0 ? (
                    <Card className="border border-slate-800 bg-slate-900/40">
                        <CardContent className="p-8 text-center text-slate-500">Nenhuma rota ativa com paradas definidas.</CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {routeStats
                            .slice()
                            .sort((a, b) => a.gap - b.gap) // most behind first
                            .map(r => (
                                <Card key={r.id} className={`border backdrop-blur-md ${statusColor[r.status]}`}>
                                    <CardContent className="p-5">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="font-bold text-white text-sm">{r.name}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">👤 {r.technicianName}</p>
                                            </div>
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusColor[r.status]}`}>
                                                {statusLabel[r.status]}
                                            </span>
                                        </div>

                                        {/* Progress bar with expected marker */}
                                        <div className="relative h-3 bg-slate-800 rounded-full overflow-visible mb-2">
                                            {/* Expected pct marker */}
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-slate-400/60 z-10"
                                                style={{ left: `${Math.min(r.expectedPct, 99)}%` }}
                                                title={`Esperado: ${r.expectedPct}%`}
                                            />
                                            {/* Actual bar */}
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${
                                                    r.status === 'critical' ? 'bg-gradient-to-r from-red-600 to-red-400' :
                                                    r.status === 'behind'   ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                                                    r.status === 'ahead'    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' :
                                                                              'bg-gradient-to-r from-blue-600 to-cyan-400'
                                                }`}
                                                style={{ width: `${r.actualPct}%` }}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>{r.completed}/{r.total} paradas</span>
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-500">Esperado: {r.expectedPct}%</span>
                                                <span className="font-bold text-white">{r.actualPct}%</span>
                                                <span className={r.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                    {r.gap >= 0 ? "+" : ""}{r.gap}%
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                    </div>
                )}
            </section>

            {/* ── 3. Projeção de Encerramento ─────────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                    <Timer className="h-5 w-5 text-blue-400" /> Projeção de Encerramento
                </h2>

                {routeStats.length === 0 ? (
                    <Card className="border border-slate-800 bg-slate-900/40">
                        <CardContent className="p-8 text-center text-slate-500">Nenhuma rota ativa.</CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {routeStats
                            .slice()
                            .sort((a, b) => {
                                const aTime = a.estimatedEnd?.getTime() ?? Infinity;
                                const bTime = b.estimatedEnd?.getTime() ?? Infinity;
                                return aTime - bTime;
                            })
                            .map(r => {
                                const isDone = r.completed >= r.total && r.total > 0;
                                const late = r.estimatedEnd && r.estimatedEnd.getHours() >= WORK_END;

                                return (
                                    <Card key={r.id} className={`border backdrop-blur-md ${
                                        isDone ? 'border-emerald-500/30 bg-emerald-500/5' :
                                        late   ? 'border-red-500/30 bg-red-500/5' :
                                                 'border-slate-800 bg-slate-900/40'
                                    }`}>
                                        <CardContent className="p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                {isDone
                                                    ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                                    : late
                                                        ? <AlertTriangle className="h-5 w-5 text-red-400" />
                                                        : <Clock className="h-5 w-5 text-blue-400" />}
                                                <div>
                                                    <p className="font-bold text-white text-sm leading-tight">{r.name}</p>
                                                    <p className="text-[10px] text-slate-500">{r.technicianName}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-end justify-between">
                                                <div>
                                                    {isDone ? (
                                                        <p className="text-2xl font-black text-emerald-300">Concluída ✓</p>
                                                    ) : r.estimatedEnd ? (
                                                        <>
                                                            <p className={`text-3xl font-black ${late ? 'text-red-300' : 'text-white'}`}>
                                                                {format(r.estimatedEnd, "HH:mm")}
                                                            </p>
                                                            <p className="text-xs text-slate-500 mt-0.5">
                                                                {late ? '⚠️ Previsto fora do horário' : 'Previsão de encerramento'}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-lg font-bold text-slate-500">Sem dados</p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-black text-slate-400">{r.completed}/{r.total}</p>
                                                    <p className="text-[10px] text-slate-600">paradas</p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                    </div>
                )}
            </section>
        </div>
    );
}
