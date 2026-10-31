import type { Route, RouteStop } from "@/lib/data";

/**
 * Histórico de entregas: ao montar uma rota de entrega, quais OS já estiveram em rotas de entrega anteriores e
 * quais peças dessas OS já foram enviadas (têm rastreio). Serve para não mandar a mesma peça duas vezes.
 */

export type PreviousShipment = {
    routeId: string;
    routeName: string;
    routeDate: Date;
    /** Peças da OS naquela rota que já têm rastreio (foram enviadas). */
    sent: Array<{ code: string; description: string; trackingCode: string }>;
    /** Quantidade de peças da OS naquela rota ainda sem rastreio. */
    unsentCount: number;
};

export type OrderHistory = {
    serviceOrder: string;
    shipments: PreviousShipment[];
    /** Códigos de peça que a OS nova traz e que já foram enviados antes (comparação por código da peça). */
    repeatedParts: Array<{ code: string; description: string; trackingCode: string; routeName: string }>;
    /** A OS nova traz peças e TODAS já foram enviadas antes: enviar de novo seria repetir a remessa. */
    allPartsSent: boolean;
};

const norm = (s: string | undefined | null) => (s || "").trim().toUpperCase();

/** Para cada OS de `stops` que já apareceu em outra rota de entrega, o que foi enviado antes. Rotas sem a OS não entram. */
export function buildOrderHistory(stops: RouteStop[], deliveryRoutes: Route[], excludeRouteId?: string): Map<string, OrderHistory> {
    const bySO = new Map<string, PreviousShipment[]>();
    for (const r of deliveryRoutes) {
        if (r.id === excludeRouteId || r.kind !== "delivery") continue;
        for (const st of r.stops || []) {
            if (st.isReallocated) continue;
            const so = norm(st.serviceOrder);
            if (!so) continue;
            const parts = st.parts || [];
            const sentParts = parts.filter(p => norm(p.trackingCode) !== "");
            const ship: PreviousShipment = {
                routeId: r.id,
                routeName: r.name,
                routeDate: new Date(r.createdAt),
                sent: sentParts.map(p => ({ code: p.code, description: p.description || "", trackingCode: (p.trackingCode || "").trim() })),
                unsentCount: parts.length - sentParts.length,
            };
            if (!bySO.has(so)) bySO.set(so, []);
            bySO.get(so)!.push(ship);
        }
    }

    const out = new Map<string, OrderHistory>();
    for (const st of stops) {
        const so = norm(st.serviceOrder);
        const shipments = bySO.get(so);
        if (!so || !shipments || out.has(so)) continue;
        shipments.sort((a, b) => b.routeDate.getTime() - a.routeDate.getTime());
        const sentByCode = new Map<string, { code: string; description: string; trackingCode: string; routeName: string }>();
        for (const sh of shipments) for (const p of sh.sent) {
            const k = norm(p.code);
            if (k && !sentByCode.has(k)) sentByCode.set(k, { ...p, routeName: sh.routeName });
        }
        const newParts = (st.parts || []).filter(p => norm(p.code) !== "");
        const repeatedParts = newParts.map(p => sentByCode.get(norm(p.code))).filter((x): x is NonNullable<typeof x> => !!x);
        out.set(so, {
            serviceOrder: st.serviceOrder,
            shipments,
            repeatedParts,
            allPartsSent: newParts.length > 0 && repeatedParts.length === newParts.length,
        });
    }
    return out;
}
