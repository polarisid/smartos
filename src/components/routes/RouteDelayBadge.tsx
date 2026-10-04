"use client";

import { useEffect } from "react";
import { AlarmClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLiveRoutePlan } from "@/hooks/useLiveRoutePlan";
import { formatDuration } from "@/lib/routePlanning";
import type { Route, ServiceOrder } from "@/lib/data";

// Selo "Atrasada +1h05" de uma rota em andamento. Também avisa o pai (onReport) pra montar o
// alerta geral no topo da tela. Só renderizar para rotas ativas.
export function RouteDelayBadge({ route, serviceOrders, onReport }: {
    route: Route;
    serviceOrders: ServiceOrder[];
    onReport?: (routeId: string, delayMin: number | null) => void;
}) {
    const { delayMin, params } = useLiveRoutePlan(route, serviceOrders);
    const late = delayMin !== null && delayMin >= params.delayAlertMin;
    const reported = late ? delayMin : null;

    useEffect(() => {
        onReport?.(route.id, reported);
    }, [route.id, reported, onReport]);
    useEffect(() => () => onReport?.(route.id, null), [route.id, onReport]);

    if (!late || delayMin === null) return null;
    return (
        <Badge
            variant="outline"
            className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400 text-[10px] px-1.5 py-0 w-fit"
            title="Atraso estimado em relação à previsão original (ver aba Planejamento nos detalhes da rota)"
        >
            <AlarmClock className="h-3 w-3" /> Atrasada +{formatDuration(delayMin)}
        </Badge>
    );
}
