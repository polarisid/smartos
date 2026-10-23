import type { Route } from "./data";

// Código único de cada rota, curto e fácil de ditar/buscar. Sai do próprio identificador da rota (que já é único e
// nunca muda), então todas as rotas - antigas e novas - têm código sem precisar de migração no banco.
// Exemplo: id 3f9a2c1b-... -> "RT-3F9A-2C1B".
// Rota de Entrega (rota de controle) usa o prefixo ET; as demais rotas, RT.
export function routeCode(route?: string | { id?: string | null; kind?: string | null } | null): string {
    const id = typeof route === "string" ? route : route?.id;
    const prefix = typeof route === "object" && route?.kind === "delivery" ? "ET" : "RT";
    const hex = (id || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (hex.length < 8) return hex ? prefix + "-" + hex : "";
    return prefix + "-" + hex.slice(0, 4) + "-" + hex.slice(4, 8);
}

const clean = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A busca bate com o código da rota (com ou sem "RT-" e hífen, parcial a partir de 3 caracteres)? */
export function matchesRouteCode(term: string, route: Pick<Route, "id" | "kind">): boolean {
    const raw = clean(term);
    // Só números (ex.: parte de um número de OS) não é código de rota: evita rota aparecendo à toa numa busca de OS.
    if (/^[0-9]+$/.test(raw)) return false;
    const t = raw.replace(/^(RT|ET)/, "");
    if (t.length < 3) return false;
    return clean(routeCode(route)).replace(/^(RT|ET)/, "").includes(t);
}

/** Código ou nome da rota (para os campos de busca de rotas). */
export function matchesRouteQuery(term: string, route: Pick<Route, "id" | "name" | "kind">): boolean {
    const q = term.trim();
    if (!q) return true;
    if (matchesRouteCode(q, route)) return true;
    return (route.name || "").toLowerCase().includes(q.toLowerCase());
}
