import type { RoutePoint } from "./data";

// Pontos de saída/chegada usados recentemente (neste navegador): atalho para não digitar o mesmo
// endereço toda vez que monta uma rota.
const KEY = "smartos_recent_route_points";
const MAX = 8;

export function loadRecentPoints(): RoutePoint[] {
    try {
        const raw = localStorage.getItem(KEY);
        const list = raw ? (JSON.parse(raw) as RoutePoint[]) : [];
        return Array.isArray(list) ? list.filter(p => p && typeof p.lat === "number" && typeof p.lng === "number" && p.address) : [];
    } catch {
        return [];
    }
}

/** Guarda o ponto no topo da lista (sem repetir o mesmo local). */
export function rememberPoint(point: RoutePoint): RoutePoint[] {
    const same = (a: RoutePoint, b: RoutePoint) => Math.abs(a.lat - b.lat) < 0.0005 && Math.abs(a.lng - b.lng) < 0.0005;
    const next = [point, ...loadRecentPoints().filter(p => !same(p, point))].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sem localStorage: só não lembra */ }
    return next;
}

export function forgetPoint(point: RoutePoint): RoutePoint[] {
    const next = loadRecentPoints().filter(p => !(p.lat === point.lat && p.lng === point.lng));
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ok */ }
    return next;
}
