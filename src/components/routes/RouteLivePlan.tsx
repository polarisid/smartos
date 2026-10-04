"use client";

import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Moon, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveRoutePlan } from "@/hooks/useLiveRoutePlan";
import { formatLegTempo } from "@/lib/emailExport";
import type { Route, RouteStop, ServiceOrder } from "@/lib/data";
import { formatClock, formatDuration } from "@/lib/routePlanning";

// Planejamento "ao vivo": o que já foi atendido entra com o horário real (hora em que a
// OS foi lançada) e o restante é recalculado a partir da última parada atendida e da
// hora atual, comparando com a previsão original da rota.
export function RouteLivePlan({ route, serviceOrders }: { route: Route; serviceOrders: ServiceOrder[] }) {
    const {
        attendedBy, activeStops, doneStops, remainingStops, lastDone,
        originalLegs, remainingLegs, loadingRemaining, originalPlan, livePlan, deltaFor, now,
    } = useLiveRoutePlan(route, serviceOrders, { refreshOrders: true });

    const dayLabel = (d: Date) => format(d, "EEEE dd/MM", { locale: ptBR });
    const dayDiff = (a: Date, b: Date) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000);

    const DeltaChip = ({ delta }: { delta: number | null }) => {
        if (delta === null) return null;
        if (Math.abs(delta) < 5) return <span className="text-[10px] text-emerald-600 dark:text-emerald-400">no horário</span>;
        const late = delta > 0;
        return (
            <span className={cn("text-[10px] font-semibold", late ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                {late ? "+" : "−"}{formatDuration(Math.abs(delta))} {late ? "atrasado" : "adiantado"}
            </span>
        );
    };

    const location = (s: RouteStop) => [s.city, s.neighborhood].filter(Boolean).join(" · ");
    const total = activeStops.length;

    if (total === 0) {
        return <p className="text-sm text-muted-foreground p-4">Esta rota não tem paradas ativas.</p>;
    }

    const lastRemainingEnd = livePlan && livePlan.stops.length > 0 ? livePlan.stops[livePlan.stops.length - 1] : null;
    const finishDate = lastRemainingEnd ? lastRemainingEnd.date : null;
    const nights = livePlan ? Math.max(0, livePlan.days.length - 1) : 0;

    return (
        <div className="space-y-3 p-1">
            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: "Atendidas", value: `${doneStops.length} de ${total}` },
                    { label: "Restam", value: String(remainingStops.length) },
                    {
                        label: "Término previsto",
                        value: remainingStops.length === 0
                            ? "Concluída"
                            : livePlan && lastRemainingEnd && finishDate
                                ? `${format(finishDate, "dd/MM")} ${formatClock(lastRemainingEnd.endMin)}`
                                : "…",
                    },
                    { label: "Dormidas restantes", value: remainingStops.length === 0 ? "—" : livePlan ? String(nights) : "…" },
                ].map(c => (
                    <div key={c.label} className="rounded-lg border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{c.label}</p>
                        <p className="text-base font-semibold">{c.value}</p>
                    </div>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Atualiza sozinho a cada minuto: o que já foi atendido mostra a hora real do lançamento da OS e o restante é recalculado a partir da última parada atendida e da hora de agora.
            </p>

            {/* Já atendidas */}
            {doneStops.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-3 py-2 border-b text-sm font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Já atendidas ({doneStops.length})
                    </div>
                    <div className="divide-y">
                        {doneStops.map(stop => {
                            const att = attendedBy.get(stop.serviceOrder)!;
                            const idx = activeStops.findIndex(s => s.serviceOrder === stop.serviceOrder);
                            const orig = originalPlan?.stops[idx];
                            const delta = orig ? dayDiff(att.at, orig.date) * 1440 + (att.at.getHours() * 60 + att.at.getMinutes() - orig.endMin) : null;
                            return (
                                <div key={stop.serviceOrder} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm border-l-[3px]", att.finalized ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10" : "border-l-red-500 bg-red-50/40 dark:bg-red-950/10")}>
                                    <span className="font-semibold tabular-nums w-[88px]">{format(att.at, "dd/MM HH:mm")}</span>
                                    <span className="font-mono text-[13px]">{stop.serviceOrder}</span>
                                    <span className="text-xs text-muted-foreground flex-1 min-w-[140px] truncate">{location(stop)}</span>
                                    <span className={cn("text-[10px] font-bold uppercase", att.finalized ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                                        {att.finalized ? "Finalizada" : "Pendência"}
                                    </span>
                                    {orig && (
                                        <span className="text-[10px] text-muted-foreground">previsto até {formatClock(orig.endMin)} <DeltaChip delta={delta} /></span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Restante */}
            {remainingStops.length > 0 && (
                !livePlan ? (
                    <div className="border rounded-lg p-4 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {loadingRemaining || !originalLegs ? "Calculando deslocamentos…" : "Sem previsão disponível."}
                    </div>
                ) : (
                    livePlan.days.map((day, di) => (
                        <div key={day.dayIndex} className="border rounded-lg overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2 border-b">
                                <p className="text-sm font-semibold capitalize">{dayLabel(day.date)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {day.stopIndexes.length} OS · {formatClock(livePlan.stops[day.stopIndexes[0]].startMin)}–{formatClock(day.endMin)}
                                </p>
                            </div>
                            <div className="p-1.5 space-y-1">
                                {day.stopIndexes.map((si, k) => {
                                    const stop = remainingStops[si];
                                    const p = livePlan.stops[si];
                                    const delta = lastDone ? deltaFor(stop, p.startMin, p.date) : null;
                                    const km = lastDone ? remainingLegs?.km[si] : originalLegs?.km[si];
                                    const dur = lastDone ? remainingLegs?.durationMin[si] : originalLegs?.durationMin[si];
                                    return (
                                        <React.Fragment key={stop.serviceOrder}>
                                            {(k > 0 || p.travelMin > 0) && (
                                                <div className="flex items-center gap-1.5 pl-3 text-[10px]">
                                                    <Truck className="h-3 w-3 text-muted-foreground/60" />
                                                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                                        {km !== undefined && dur !== undefined ? (formatLegTempo(km, dur) || `${km.toFixed(1)} km`) : formatDuration(p.travelMin)}
                                                    </span>
                                                    {k === 0 && lastDone && day.dayIndex === 0 && <span className="text-muted-foreground">desde {lastDone.city}</span>}
                                                    {p.droveTonight && <span className="text-indigo-600 dark:text-indigo-400">viaja na noite anterior</span>}
                                                </div>
                                            )}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border border-l-[3px] border-l-blue-500 rounded-r-lg bg-card">
                                                <span className="font-semibold tabular-nums w-[104px] flex items-center gap-1">
                                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {formatClock(p.startMin)}–{formatClock(p.endMin)}
                                                </span>
                                                <span className="font-mono text-[13px]">{stop.serviceOrder}</span>
                                                <span className="text-xs text-muted-foreground flex-1 min-w-[140px] truncate">{location(stop)} · {stop.productType || "—"}</span>
                                                <span className="text-[10px] font-semibold text-muted-foreground">{p.turn}</span>
                                                <DeltaChip delta={delta} />
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            {day.sleepCity && (
                                <div className="flex items-center gap-2 px-3 py-2 border-t bg-indigo-50/60 dark:bg-indigo-950/20 text-xs text-indigo-800 dark:text-indigo-300">
                                    <Moon className="h-4 w-4 shrink-0" />
                                    <span><strong>Dorme em {day.sleepCity}</strong>{day.sleepNote ? ` — ${day.sleepNote}` : ""}</span>
                                </div>
                            )}
                            {di === livePlan.days.length - 1 && (
                                <div className={cn("flex items-center gap-2 px-3 py-2 border-t text-xs", livePlan.returnAfterHours ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300" : "bg-muted/30 text-muted-foreground")}>
                                    {livePlan.returnAfterHours ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Truck className="h-4 w-4 shrink-0" />}
                                    <span>
                                        Retorno {route.endPoint ? "ao ponto de chegada" : "à base"}: {formatDuration(livePlan.returnTravelMin)} — chega por volta das <strong>{formatClock(livePlan.returnArriveMin)}</strong>
                                    </span>
                                </div>
                            )}
                        </div>
                    ))
                )
            )}

            {remainingStops.length === 0 && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Todas as paradas desta rota foram atendidas.
                </p>
            )}
        </div>
    );
}
