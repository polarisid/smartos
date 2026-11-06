import type { Route } from "@/lib/data";

/**
 * Lista de "Rotas Cadastradas": situação, dia, filtros, ordenação e agrupamento (situação > dia).
 * Funções puras, sem tela, para poderem ser testadas.
 */

export type RouteGroup = "rascunho" | "ativa" | "finalizada" | "cancelada";

export const ROUTE_GROUP_ORDER: RouteGroup[] = ["rascunho", "ativa", "finalizada", "cancelada"];
export const ROUTE_GROUP_LABEL: Record<RouteGroup, string> = {
    rascunho: "Rascunhos",
    ativa: "Ativas",
    finalizada: "Finalizadas",
    cancelada: "Canceladas",
};

export function routeGroupOf(route: Pick<Route, "isDraft" | "isActive" | "isCanceled">): RouteGroup {
    if (route.isDraft && !route.isActive) return "rascunho";
    if (route.isActive) return "ativa";
    if (route.isCanceled) return "cancelada";
    return "finalizada";
}

const asDate = (value: unknown): Date | null => {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value as any);
    return Number.isNaN(d.getTime()) ? null : d;
};

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Dia da rota: saída; no rascunho, o dia planejado; sem nenhum dos dois, o dia em que foi criada. */
export function routeDayOf(route: Pick<Route, "departureDate" | "plannedDate" | "createdAt">): Date | null {
    return asDate(route.departureDate) || asDate(route.plannedDate) || asDate(route.createdAt);
}

/** yyyy-mm-dd do dia da rota ("" quando não há data). */
export function routeDayKey(route: Pick<Route, "departureDate" | "plannedDate" | "createdAt">): string {
    const d = routeDayOf(route);
    return d ? keyOf(d) : "";
}

export type RouteSortKey = "data" | "nome" | "tecnico" | "motorista" | "paradas" | "progresso";
export type RouteSort = { key: RouteSortKey; dir: "asc" | "desc" };

export type RouteListFilters = {
    technician: string; // "" = todos
    driver: string; // "" = todos
    /** Situações marcadas; vazio = todas. "atrasada" é um filtro a parte (rota ativa com atraso). */
    groups: RouteGroup[];
    lateOnly: boolean;
};

export const EMPTY_ROUTE_FILTERS: RouteListFilters = { technician: "", driver: "", groups: [], lateOnly: false };

export const NO_TECHNICIAN = "__sem_tecnico__";
export const NO_DRIVER = "__sem_motorista__";

export function filterRoutes(routes: Route[], filters: RouteListFilters, delays: Record<string, number | undefined> = {}): Route[] {
    return routes.filter(r => {
        if (filters.groups.length > 0 && !filters.groups.includes(routeGroupOf(r))) return false;
        if (filters.technician) {
            const t = (r.technicianName || "").trim();
            if (filters.technician === NO_TECHNICIAN ? t !== "" : t !== filters.technician) return false;
        }
        if (filters.driver) {
            const d = (r.driverName || "").trim();
            if (filters.driver === NO_DRIVER ? d !== "" : d !== filters.driver) return false;
        }
        if (filters.lateOnly && delays[r.id] === undefined) return false;
        return true;
    });
}

export const hasActiveRouteFilters = (f: RouteListFilters) => !!(f.technician || f.driver || f.groups.length || f.lateOnly);

const text = (s?: string | null) => (s || "").trim().toLocaleLowerCase("pt-BR");

/** Ordena sem alterar a lista recebida. Empate: pelo nome, para a ordem não "pular" entre cliques. */
export function sortRoutes(routes: Route[], sort: RouteSort, progressOf: (r: Route) => number): Route[] {
    const sign = sort.dir === "asc" ? 1 : -1;
    const valueOf = (r: Route): number | string => {
        switch (sort.key) {
            case "data": return routeDayOf(r)?.getTime() ?? 0;
            case "nome": return text(r.name);
            case "tecnico": return text(r.technicianName);
            case "motorista": return text(r.driverName);
            case "paradas": return (r.stops || []).filter(s => !s.isReallocated).length;
            case "progresso": return progressOf(r);
        }
    };
    return [...routes].sort((a, b) => {
        const va = valueOf(a), vb = valueOf(b);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
        return sign * cmp || text(a.name).localeCompare(text(b.name), "pt-BR");
    });
}

export type RouteDayBlock = { dayKey: string; routes: Route[] };
export type RouteGroupBlock = { group: RouteGroup; label: string; count: number; days: RouteDayBlock[] };

/**
 * Agrupa por situação (rascunhos, ativas, finalizadas, canceladas) e, dentro dela, por dia. Mantém a ordem recebida
 * dentro de cada dia; os dias saem do mais próximo de hoje para o mais distante (futuro/hoje primeiro nas abertas,
 * mais recente primeiro nas finalizadas). Grupos sem rota não aparecem.
 */
export function groupRoutes(routes: Route[], todayKey: string): RouteGroupBlock[] {
    const out: RouteGroupBlock[] = [];
    for (const group of ROUTE_GROUP_ORDER) {
        const inGroup = routes.filter(r => routeGroupOf(r) === group);
        if (inGroup.length === 0) continue;
        const byDay = new Map<string, Route[]>();
        for (const r of inGroup) {
            const k = routeDayKey(r);
            const list = byDay.get(k);
            if (list) list.push(r); else byDay.set(k, [r]);
        }
        const open = group === "rascunho" || group === "ativa";
        const keys = [...byDay.keys()].sort((a, b) => {
            if (a === "") return 1; // sem data, por último
            if (b === "") return -1;
            if (open) {
                // abertas: de hoje em diante primeiro (crescente), depois os dias que já passaram (do mais recente)
                const aPast = a < todayKey, bPast = b < todayKey;
                if (aPast !== bPast) return aPast ? 1 : -1;
                return aPast ? b.localeCompare(a) : a.localeCompare(b);
            }
            return b.localeCompare(a);
        });
        out.push({ group, label: ROUTE_GROUP_LABEL[group], count: inGroup.length, days: keys.map(k => ({ dayKey: k, routes: byDay.get(k)! })) });
    }
    return out;
}

/** Nomes distintos (sem vazio), em ordem alfabética, para os filtros de técnico e motorista. */
export function distinctNames(values: Array<string | undefined | null>): string[] {
    return [...new Set(values.map(v => (v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
