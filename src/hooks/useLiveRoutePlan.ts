"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { configService } from "@/services/supabase/configService";
import { fetchLegDistancesAndDurations, geocodeStop } from "@/lib/routeLegs";
import type { Route, RoutePoint, RouteStop, ServiceOrder } from "@/lib/data";
import {
    DEFAULT_PLANNING_PARAMS,
    formatClock,
    simulateRoutePlan,
    timeToMinutes,
    type RoutePlan,
} from "@/lib/routePlanning";

export type Attended = { at: Date; finalized: boolean };

const stopsKey = (list: RouteStop[]) => list.map(s => `${s.serviceOrder}:${s.city}:${s.neighborhood}:${s.zipCode}:${s.avoidFerryToNext ? "F" : ""}`).join(";");
const dayDiff = (a: Date, b: Date) =>
    Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / 86400000);

/**
 * Estado "ao vivo" do planejamento de uma rota: o que já foi atendido (hora real do
 * lançamento da OS), a previsão original (rota inteira) e a previsão atual do
 * restante, recalculada da última parada atendida e da hora de agora.
 */
export function useLiveRoutePlan(
    route: Route,
    serviceOrders: ServiceOrder[],
    opts: { refreshOrders?: boolean } = {}
) {
    const { appUser, activeUnidadeId } = useAuth();
    const queryClient = useQueryClient();

    const { data: params = DEFAULT_PLANNING_PARAMS } = useQuery({
        queryKey: ["planning-params", appUser?.uid, activeUnidadeId],
        queryFn: () => configService.getPlanningParams(activeUnidadeId),
        enabled: !!appUser?.uid,
        staleTime: 5 * 60 * 1000,
    });

    // Relógio a cada minuto (e, se pedido, recarrega as OS) - a previsão acompanha o técnico sozinha.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => {
            setNow(new Date());
            if (opts.refreshOrders) queryClient.invalidateQueries({ queryKey: ["service-orders"] });
        }, 60 * 1000);
        return () => clearInterval(id);
    }, [queryClient, opts.refreshOrders]);

    const createdAt = route.createdAt instanceof Date ? route.createdAt : new Date(route.createdAt as any);
    const activeStops = useMemo(() => (route.stops || []).filter(s => !s.isReallocated), [route.stops]);

    // Atendida = existe OS lançada depois da criação da rota (mesmo critério do progresso da rota).
    const attendedBy = useMemo(() => {
        const map = new Map<string, Attended>();
        activeStops.forEach(stop => {
            const related = serviceOrders.filter(os => os.serviceOrderNumber === stop.serviceOrder && os.date.getTime() >= createdAt.getTime());
            if (related.length === 0) return;
            const last = related.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a));
            map.set(stop.serviceOrder, { at: last.date, finalized: last.isFinalized !== false });
        });
        return map;
    }, [activeStops, serviceOrders, createdAt]);

    const doneStops = useMemo(
        () => activeStops.filter(s => attendedBy.has(s.serviceOrder)).sort((a, b) => attendedBy.get(a.serviceOrder)!.at.getTime() - attendedBy.get(b.serviceOrder)!.at.getTime()),
        [activeStops, attendedBy]
    );
    const remainingStops = useMemo(() => activeStops.filter(s => !attendedBy.has(s.serviceOrder)), [activeStops, attendedBy]);
    const lastDone = doneStops.length > 0 ? doneStops[doneStops.length - 1] : null;

    const endpoints = useMemo(() => ({ start: route.startPoint || null, end: route.endPoint || null }), [route.startPoint, route.endPoint]);

    const { data: originalLegs } = useQuery({
        queryKey: ["live-plan-legs", route.id, stopsKey(activeStops), endpoints.start?.lat, endpoints.end?.lat],
        queryFn: () => fetchLegDistancesAndDurations(activeStops, "Aracaju", activeUnidadeId, endpoints),
        enabled: activeStops.length > 0,
        staleTime: 30 * 60 * 1000,
    });

    const { data: remainingLegs, isFetching: loadingRemaining } = useQuery({
        queryKey: ["live-plan-remaining", route.id, stopsKey(remainingStops), lastDone?.serviceOrder, endpoints.end?.lat],
        queryFn: async () => {
            const coord = await geocodeStop(lastDone as RouteStop);
            const start: RoutePoint | null = coord ? { address: lastDone!.city, lat: coord[0], lng: coord[1] } : endpoints.start;
            return fetchLegDistancesAndDurations(remainingStops, "Aracaju", activeUnidadeId, { start, end: endpoints.end });
        },
        enabled: !!lastDone && remainingStops.length > 0,
        staleTime: 30 * 60 * 1000,
    });

    const departureDate = route.departureDate ? new Date(route.departureDate) : createdAt;

    const originalPlan: RoutePlan | null = useMemo(() => {
        if (!originalLegs || activeStops.length === 0) return null;
        return simulateRoutePlan(activeStops, originalLegs.durationMin, params, departureDate, route.departureTime || "");
    }, [originalLegs, activeStops, params, departureDate, route.departureTime]);

    const livePlan: RoutePlan | null = useMemo(() => {
        if (!lastDone) return originalPlan;
        if (remainingStops.length === 0) return null;
        if (!remainingLegs) return null;
        const dayStart = timeToMinutes(params.dayStart, 8 * 60);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        return simulateRoutePlan(remainingStops, remainingLegs.durationMin, params, now, formatClock(Math.max(nowMin, dayStart)));
    }, [lastDone, originalPlan, remainingStops, remainingLegs, params, now]);

    // Diferença (min; + = atrasado) entre o horário previsto agora e o da previsão original.
    const deltaFor = (stop: RouteStop, startMin: number, date: Date): number | null => {
        if (!originalPlan) return null;
        const idx = activeStops.findIndex(s => s.serviceOrder === stop.serviceOrder);
        const orig = originalPlan.stops[idx];
        if (!orig) return null;
        return dayDiff(date, orig.date) * 1440 + (startMin - orig.startMin);
    };

    // Atraso atual da rota em minutos (null = não está em andamento / sem dados).
    const delayMin: number | null = useMemo(() => {
        if (remainingStops.length === 0 || !originalPlan) return null;
        const nowTotal = now.getHours() * 60 + now.getMinutes();
        const first = remainingStops[0];
        const idx = activeStops.findIndex(s => s.serviceOrder === first.serviceOrder);
        const orig = originalPlan.stops[idx];
        if (!orig) return null;
        // Rota que só começa em outro dia (ou muito antiga) não conta como atraso.
        const daysSinceStart = dayDiff(now, orig.date);
        if (daysSinceStart < 0 || daysSinceStart > 5) return null;
        if (lastDone && livePlan && livePlan.stops[0]) {
            const live = livePlan.stops[0];
            return dayDiff(live.date, orig.date) * 1440 + (live.startMin - orig.startMin);
        }
        // Nada atendido ainda: a 1ª parada já deveria ter começado.
        return daysSinceStart * 1440 + (nowTotal - orig.startMin);
    }, [remainingStops, originalPlan, activeStops, lastDone, livePlan, now]);

    return {
        params, now, createdAt, activeStops, attendedBy, doneStops, remainingStops, lastDone,
        originalLegs, remainingLegs, loadingRemaining, originalPlan, livePlan, deltaFor, delayMin,
    };
}
