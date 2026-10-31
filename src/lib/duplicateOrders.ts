import type { Route, RouteStop } from "@/lib/data";

/**
 * OS duplicada ao montar uma rota: a mesma ordem de serviço repetida na própria planilha colada, ou já presente em
 * outra rota ainda aberta (ativa ou rascunho). Rota cancelada e parada realocada para outra rota não contam.
 */

export type OrderLocation = {
    routeId: string;
    routeName: string;
    status: "ativa" | "rascunho";
    date: Date | null;
    technicianName?: string;
};

export type DuplicateReport = {
    /** OS que aparece mais de uma vez no texto colado. */
    repeatedInPaste: Array<{ serviceOrder: string; count: number; consumerName: string }>;
    /** OS do texto colado que já estão em outra rota aberta. */
    inOtherRoutes: Array<{ serviceOrder: string; consumerName: string; locations: OrderLocation[] }>;
};

const norm = (s: string | undefined | null) => (s || "").trim().toUpperCase();

export function buildOpenRouteIndex(routes: Route[]): Map<string, OrderLocation[]> {
    const index = new Map<string, OrderLocation[]>();
    for (const r of routes) {
        if (r.isCanceled || r.kind === "delivery") continue;
        const status: OrderLocation["status"] | null = r.isActive ? "ativa" : r.isDraft ? "rascunho" : null;
        if (!status) continue;
        const dateRaw = r.plannedDate || r.departureDate || null;
        const loc: OrderLocation = { routeId: r.id, routeName: r.name, status, date: dateRaw ? new Date(dateRaw) : null, technicianName: r.technicianName || undefined };
        const seen = new Set<string>();
        for (const st of r.stops || []) {
            if (st.isReallocated) continue;
            const so = norm(st.serviceOrder);
            if (!so || seen.has(so)) continue;
            seen.add(so);
            if (!index.has(so)) index.set(so, []);
            index.get(so)!.push(loc);
        }
    }
    return index;
}

/** `excludeRouteId`: a própria rota em edição não conta como "outra rota". */
export function findDuplicateOrders(stops: RouteStop[], index: Map<string, OrderLocation[]>, excludeRouteId?: string): DuplicateReport {
    const count = new Map<string, { count: number; consumerName: string; serviceOrder: string }>();
    for (const st of stops) {
        const so = norm(st.serviceOrder);
        if (!so) continue;
        const cur = count.get(so);
        if (cur) cur.count++;
        else count.set(so, { count: 1, consumerName: st.consumerName || "", serviceOrder: st.serviceOrder.trim() });
    }
    const repeatedInPaste = Array.from(count.values()).filter(c => c.count > 1);
    const inOtherRoutes: DuplicateReport["inOtherRoutes"] = [];
    count.forEach((c, so) => {
        const locations = (index.get(so) || []).filter(l => l.routeId !== excludeRouteId);
        if (locations.length > 0) inOtherRoutes.push({ serviceOrder: c.serviceOrder, consumerName: c.consumerName, locations });
    });
    return { repeatedInPaste, inOtherRoutes };
}

export const hasDuplicates = (r: DuplicateReport) => r.repeatedInPaste.length > 0 || r.inOtherRoutes.length > 0;
