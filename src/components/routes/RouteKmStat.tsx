"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Route as RouteLine } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchLegDistancesAndDurations } from "@/lib/routeLegs";
import { stopsKey } from "@/hooks/useLiveRoutePlan";
import { Progress } from "@/components/ui/progress";
import type { Route, ServiceOrder } from "@/lib/data";

/**
 * Km da rota: total estimado (saída → paradas → chegada, pelas estradas) e quanto já foi percorrido, contando os
 * trechos até a última parada atendida (OS lançada depois da criação da rota); a volta à base entra com todas atendidas ou depois da data de chegada. Usa a mesma consulta da Previsão
 * (mesma chave de cache): o cálculo é feito uma vez e a Previsão reaproveita.
 */
export function useRouteKm(route: Route, serviceOrders: ServiceOrder[]) {
    const { activeUnidadeId } = useAuth();
    const activeStops = useMemo(() => (route.stops || []).filter(s => !s.isReallocated), [route.stops]);
    const endpoints = useMemo(() => ({ start: route.startPoint || null, end: route.endPoint || null }), [route.startPoint, route.endPoint]);

    const { data, isLoading } = useQuery({
        queryKey: ["live-plan-legs", route.id, stopsKey(activeStops), endpoints.start?.lat, endpoints.end?.lat],
        queryFn: () => fetchLegDistancesAndDurations(activeStops, "Aracaju", activeUnidadeId, endpoints),
        enabled: activeStops.length > 0,
        staleTime: 30 * 60 * 1000,
    });

    return useMemo(() => {
        if (!data || data.km.length === 0) return { totalKm: null as number | null, traveledKm: 0, isLoading };
        const totalKm = data.km.reduce((a, b) => a + (b || 0), 0);
        const created = (route.createdAt instanceof Date ? route.createdAt : new Date(route.createdAt as any)).getTime();
        let lastAttended = -1;
        let attendedCount = 0;
        activeStops.forEach((stop, i) => {
            const attended = serviceOrders.some(os => os.serviceOrderNumber === stop.serviceOrder && !os.ignoreInRoute && os.date.getTime() >= created);
            if (attended) { lastAttended = i; attendedCount++; }
        });
        // km[i] = trecho que chega à parada i (o 0 sai da base); o último trecho é a volta à base/chegada.
        // Conta os trechos até a última parada atendida (parada pulada no meio não tira km: o técnico seguiu viagem).
        let traveledKm = lastAttended < 0 ? 0 : data.km.slice(0, lastAttended + 1).reduce((a, b) => a + (b || 0), 0);
        // A volta entra quando a rota acabou: todas atendidas, ou a data de chegada já passou (mesmo com parada sem atendimento).
        const allAttended = activeStops.length > 0 && attendedCount === activeStops.length;
        const arrival = route.arrivalDate ? new Date(route.arrivalDate) : null;
        const ended = !!arrival && !isNaN(arrival.getTime()) && new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate() + 1).getTime() <= Date.now();
        if (lastAttended >= 0 && (allAttended || ended)) traveledKm += data.km[data.km.length - 1] || 0;
        traveledKm = Math.min(traveledKm, totalKm);
        return { totalKm, traveledKm, isLoading };
    }, [data, isLoading, activeStops, serviceOrders, route.createdAt, route.arrivalDate]);
}

const fmtKm = (km: number) => Math.round(km).toLocaleString("pt-BR");

export function RouteKmStat({ route, serviceOrders }: { route: Route; serviceOrders: ServiceOrder[] }) {
    const { totalKm, isLoading } = useRouteKm(route, serviceOrders);
    return (
        <div className="flex items-center gap-2">
            <RouteLine className="h-4 w-4 text-muted-foreground" />
            <div>
                <p className="text-xs text-muted-foreground">Distância</p>
                <p className="font-semibold" title="Km total estimado: saída, paradas e chegada">
                    {totalKm !== null && totalKm > 0 ? `${fmtKm(totalKm)} km` : isLoading ? "Calculando…" : "—"}
                </p>
            </div>
        </div>
    );
}

export function RouteKmProgress({ route, serviceOrders }: { route: Route; serviceOrders: ServiceOrder[] }) {
    const { totalKm, traveledKm } = useRouteKm(route, serviceOrders);
    if (totalKm === null || totalKm <= 0) return null;
    const pct = Math.min(100, (traveledKm / totalKm) * 100);
    return (
        <div className="space-y-2 pt-1">
            <Progress value={pct} className="h-2 [&>div]:bg-sky-500" />
            <p className="text-xs text-muted-foreground text-right">{fmtKm(traveledKm)} de {fmtKm(totalKm)} km percorridos</p>
        </div>
    );
}
