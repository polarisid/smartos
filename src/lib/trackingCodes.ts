import type { Route } from "./data";

// Mapa { OS: { peça: código } } dos códigos de rastreio digitados/bipados na tela.
export type TrackingCodeMap = Record<string, Record<string, string>>;

/** Lê os códigos que já estão gravados na rota. */
export function codesFromRoute(route: Route): TrackingCodeMap {
    const out: TrackingCodeMap = {};
    (route.stops || []).forEach(stop => {
        out[stop.serviceOrder] = {};
        (stop.parts || []).forEach(part => { out[stop.serviceOrder][part.code] = part.trackingCode || ""; });
    });
    return out;
}

/**
 * Traz para a tela o que OUTRAS pessoas já biparam, sem apagar o que esta pessoa digitou/bipou
 * e ainda não salvou: campo preenchido aqui vence; campo vazio aqui recebe o valor do banco.
 */
export function mergeServerCodes(local: TrackingCodeMap, route: Route): TrackingCodeMap {
    const server = codesFromRoute(route);
    const out: TrackingCodeMap = {};
    Object.keys(server).forEach(so => {
        out[so] = {};
        Object.keys(server[so]).forEach(code => {
            const mine = local[so]?.[code];
            out[so][code] = mine ? mine : server[so][code];
        });
    });
    return out;
}

/** Entradas para routeService.patchPartTracking a partir do que está na tela. */
export function entriesFromCodes(codes: TrackingCodeMap, onlyServiceOrder?: string, onlyPart?: string) {
    const entries: Array<{ serviceOrder: string; partCode: string; trackingCode: string }> = [];
    Object.entries(codes).forEach(([serviceOrder, parts]) => {
        if (onlyServiceOrder && serviceOrder !== onlyServiceOrder) return;
        Object.entries(parts).forEach(([partCode, trackingCode]) => {
            if (onlyPart && partCode !== onlyPart) return;
            if (trackingCode && trackingCode.trim()) entries.push({ serviceOrder, partCode, trackingCode });
        });
    });
    return entries;
}
