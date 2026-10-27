import type { RouteStop } from "@/lib/data";

/**
 * Paradas que ainda valem na rota. A OS realocada para outra rota continua gravada na rota de origem (histórico e
 * "Realocada" na edição), mas lá não é mais atendida nem conferida: quem lista OS/peças para conferir deve ignorá-la.
 */
export function activeStops<T extends { isReallocated?: boolean }>(stops: T[] | null | undefined): T[] {
    return (stops || []).filter(s => !s.isReallocated);
}

/** A rota sem as paradas realocadas (cópia: a rota original não é alterada). */
export function withoutReallocated<R extends { stops: RouteStop[] }>(route: R): R {
    return { ...route, stops: activeStops(route.stops) };
}
