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
    sent: Array<{ code: string; description: string; quantity: number; trackingCode: string }>;
    /** Quantidade de peças da OS naquela rota ainda sem rastreio. */
    unsentCount: number;
};

/**
 * Situação de uma peça comparando o que já foi com o que está entrando agora:
 * - repetida: a peça já foi enviada (tem rastreio) e vem de novo;
 * - nova: a peça nunca foi enviada nem estava em rota anterior;
 * - sem-rastreio: já estava numa rota anterior, mas sem rastreio (talvez nunca tenha saído);
 * - so-antes: foi enviada antes e NÃO vem nesta lista.
 */
export type PartSituation = "repetida" | "nova" | "sem-rastreio" | "so-antes";

export type PartDiff = {
    code: string;
    description: string;
    situation: PartSituation;
    /** Quantidade que vem agora (null = a peça não está nesta lista). */
    newQty: number | null;
    /** Envio anterior com rastreio (a mais recente). */
    before: { routeName: string; routeDate: Date; trackingCode: string; quantity: number } | null;
    /** Rota anterior em que estava sem rastreio (só quando não houve envio). */
    unsentIn: { routeName: string; routeDate: Date } | null;
};

/** Resumo da OS: o que decidir sobre ela. */
export type OrderVerdict = "todas-enviadas" | "parcial" | "pecas-novas" | "sem-pecas";

export type OrderHistory = {
    serviceOrder: string;
    shipments: PreviousShipment[];
    /** Códigos de peça que a OS nova traz e que já foram enviados antes (comparação por código da peça). */
    repeatedParts: Array<{ code: string; description: string; trackingCode: string; routeName: string }>;
    /** A OS nova traz peças e TODAS já foram enviadas antes: enviar de novo seria repetir a remessa. */
    allPartsSent: boolean;
    /** Comparação peça a peça: o que vem agora x o que já foi enviado. */
    diff: PartDiff[];
    verdict: OrderVerdict;
};

const norm = (s: string | undefined | null) => (s || "").trim().toUpperCase();

/** Para cada OS de `stops` que já apareceu em outra rota de entrega, o que foi enviado antes. Rotas sem a OS não entram. */
export function buildOrderHistory(stops: RouteStop[], deliveryRoutes: Route[], excludeRouteId?: string): Map<string, OrderHistory> {
    const bySO = new Map<string, PreviousShipment[]>();
    // peças sem rastreio por OS (rota anterior em que estavam), para distinguir "nova" de "estava planejada e não saiu"
    const unsentBySO = new Map<string, Array<{ code: string; routeName: string; routeDate: Date }>>();
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
                sent: sentParts.map(p => ({ code: p.code, description: p.description || "", quantity: p.quantity || 1, trackingCode: (p.trackingCode || "").trim() })),
                unsentCount: parts.length - sentParts.length,
            };
            if (!bySO.has(so)) bySO.set(so, []);
            bySO.get(so)!.push(ship);
            parts.filter(p => norm(p.trackingCode) === "").forEach(p => {
                if (!unsentBySO.has(so)) unsentBySO.set(so, []);
                unsentBySO.get(so)!.push({ code: p.code, routeName: r.name, routeDate: ship.routeDate });
            });
        }
    }

    const out = new Map<string, OrderHistory>();
    for (const st of stops) {
        const so = norm(st.serviceOrder);
        const shipments = bySO.get(so);
        if (!so || !shipments || out.has(so)) continue;
        shipments.sort((a, b) => b.routeDate.getTime() - a.routeDate.getTime());

        // envio mais recente de cada código de peça
        const sentByCode = new Map<string, { code: string; description: string; quantity: number; trackingCode: string; routeName: string; routeDate: Date }>();
        for (const sh of shipments) for (const p of sh.sent) {
            const k = norm(p.code);
            if (k && !sentByCode.has(k)) sentByCode.set(k, { ...p, routeName: sh.routeName, routeDate: sh.routeDate });
        }
        const unsentByCode = new Map<string, { routeName: string; routeDate: Date }>();
        (unsentBySO.get(so) || []).sort((a, b) => b.routeDate.getTime() - a.routeDate.getTime()).forEach(u => {
            const k = norm(u.code);
            if (k && !unsentByCode.has(k)) unsentByCode.set(k, u);
        });

        const newParts = (st.parts || []).filter(p => norm(p.code) !== "");
        const repeatedParts = newParts.map(p => sentByCode.get(norm(p.code))).filter((x): x is NonNullable<typeof x> => !!x);

        const diff: PartDiff[] = [];
        const seen = new Set<string>();
        for (const p of newParts) {
            const k = norm(p.code);
            if (seen.has(k)) continue;
            seen.add(k);
            const sent = sentByCode.get(k);
            const unsent = unsentByCode.get(k);
            diff.push({
                code: p.code,
                description: p.description || sent?.description || "",
                situation: sent ? "repetida" : unsent ? "sem-rastreio" : "nova",
                newQty: p.quantity || 1,
                before: sent ? { routeName: sent.routeName, routeDate: sent.routeDate, trackingCode: sent.trackingCode, quantity: sent.quantity } : null,
                unsentIn: !sent && unsent ? { routeName: unsent.routeName, routeDate: unsent.routeDate } : null,
            });
        }
        // enviadas antes que não vêm agora
        sentByCode.forEach((sent, k) => {
            if (seen.has(k)) return;
            diff.push({
                code: sent.code,
                description: sent.description,
                situation: "so-antes",
                newQty: null,
                before: { routeName: sent.routeName, routeDate: sent.routeDate, trackingCode: sent.trackingCode, quantity: sent.quantity },
                unsentIn: null,
            });
        });

        const allPartsSent = newParts.length > 0 && repeatedParts.length === newParts.length;
        out.set(so, {
            serviceOrder: st.serviceOrder,
            shipments,
            repeatedParts,
            allPartsSent,
            diff,
            verdict: newParts.length === 0 ? "sem-pecas" : allPartsSent ? "todas-enviadas" : repeatedParts.length > 0 ? "parcial" : "pecas-novas",
        });
    }
    return out;
}
