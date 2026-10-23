import type { Route } from "./data";

// Código único de cada rota, curto e fácil de ditar/buscar. Sai do próprio identificador da rota (que já é único e
// nunca muda), então todas as rotas - antigas e novas - têm código sem precisar de migração no banco.
// Exemplo: id 3f9a2c1b-... -> "RT-3F9A-2C1B".
export function routeCode(id?: string | null): string {
    const hex = (id || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (hex.length < 8) return hex ? "RT-" + hex : "";
    return "RT-" + hex.slice(0, 4) + "-" + hex.slice(4, 8);
}

const clean = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A busca bate com o código da rota (com ou sem "RT-" e hífen, parcial a partir de 3 caracteres)? */
export function matchesRouteCode(term: string, route: Pick<Route, "id">): boolean {
    const raw = clean(term);
    // Só números (ex.: parte de um número de OS) não é código de rota: evita rota aparecendo à toa numa busca de OS.
    if (/^[0-9]+$/.test(raw)) return false;
    const t = raw.replace(/^RT/, "");
    if (t.length < 3) return false;
    return clean(routeCode(route.id)).replace(/^RT/, "").includes(t);
}

/** Código ou nome da rota (para os campos de busca de rotas). */
export function matchesRouteQuery(term: string, route: Pick<Route, "id" | "name">): boolean {
    const q = term.trim();
    if (!q) return true;
    if (matchesRouteCode(q, route)) return true;
    return (route.name || "").toLowerCase().includes(q.toLowerCase());
}
