import type { RoutePart, RouteStop, ServiceOrder } from "./data";
import { lentFromOrder, partUsageInStop } from "./partUsage";

// ── Realocar peça entre OS da rota de entrega ───────────────────────────────────────────────────────────────────
// Peça que não foi usada na OS para a qual foi enviada pode ser dada a outra OS da mesma rota. A linha da peça
// continua na OS de origem, marcada com `reallocatedTo` (para o histórico e para não contar como "nova"), e a OS de
// destino recebe a peça (com o mesmo rastreio) com `receivedFrom` dizendo de onde veio.

const same = (a?: string, b?: string) => (a || "").trim().toUpperCase() === (b || "").trim().toUpperCase();

/** Marca a peça da OS de origem como realocada para a OS `toOrder`. */
export function markReallocated(parts: RoutePart[], code: string, toOrder: string): RoutePart[] {
    return parts.map(p => (same(p.code, code) ? { ...p, reallocatedTo: toOrder } : p));
}

/** Desfaz a marca na OS de origem. */
export function unmarkReallocated(parts: RoutePart[], code: string): RoutePart[] {
    return parts.map(p => {
        if (!same(p.code, code)) return p;
        const { reallocatedTo: _drop, ...rest } = p;
        return rest;
    });
}

/**
 * OS de destino recebe a peça. Se ela já tem uma peça com o mesmo código soma a quantidade (e fica com o rastreio
 * que já tinha, ou com o da peça recebida se não tinha); senão ganha uma linha nova.
 */
export function receivePart(parts: RoutePart[], moved: RoutePart, fromOrder: string): RoutePart[] {
    const qty = Math.max(1, Number(moved.quantity) || 1);
    const entry = { order: fromOrder, quantity: qty };
    const idx = parts.findIndex(p => same(p.code, moved.code));
    if (idx >= 0) {
        const cur = parts[idx];
        const next: RoutePart = {
            ...cur,
            quantity: Math.max(1, Number(cur.quantity) || 1) + qty,
            trackingCode: (cur.trackingCode || "").trim() ? cur.trackingCode : moved.trackingCode,
            receivedFrom: [...(cur.receivedFrom || []), entry],
        };
        if (!next.trackingCode) delete next.trackingCode;
        return parts.map((p, i) => (i === idx ? next : p));
    }
    const created: RoutePart = { code: moved.code, description: moved.description, quantity: qty, receivedFrom: [entry] };
    if ((moved.trackingCode || "").trim()) created.trackingCode = moved.trackingCode;
    return [...parts, created];
}

/** Desfaz o recebimento vindo da OS `fromOrder`: tira a quantidade; se a linha ficou vazia, remove. */
export function undoReceive(parts: RoutePart[], code: string, fromOrder: string): RoutePart[] {
    const out: RoutePart[] = [];
    for (const p of parts) {
        const entry = same(p.code, code) ? (p.receivedFrom || []).find(r => r.order === fromOrder) : undefined;
        if (!entry) { out.push(p); continue; }
        const left = (p.receivedFrom || []).filter(r => r !== entry);
        const qty = (Number(p.quantity) || 1) - entry.quantity;
        if (qty <= 0) continue;
        const next: RoutePart = { ...p, quantity: qty };
        if (left.length > 0) next.receivedFrom = left; else delete next.receivedFrom;
        out.push(next);
    }
    return out;
}

// ── Situação de cada peça depois da rota criada ─────────────────────────────────────────────────────────────────

export type PartReturn = "usada" | "cedida" | "defeito" | "nova" | "aguardando" | "realocada";

export const PART_RETURN_LABEL: Record<PartReturn, string> = {
    usada: "Usada",
    cedida: "Usada em outra OS",
    defeito: "Nova com defeito",
    nova: "Nova (não usada)",
    aguardando: "Sem lançamento",
    realocada: "Realocada",
};

/**
 * Para onde vai a peça: usada (consta em "peça trocada" de uma OS lançada), usada em outra OS (cedida), nova com defeito
 * (pendência), nova (não usada, volta ao estoque), realocada para outra OS ou sem lançamento (a OS ainda não foi
 * atendida depois da rota criada).
 */
export function partReturnOf(
    stop: Pick<RouteStop, "serviceOrder">,
    part: RoutePart,
    serviceOrders: ServiceOrder[],
    routeCreated: Date
): { kind: PartReturn; lentTo: string } {
    const lentTo = [...new Set(lentFromOrder(stop.serviceOrder, part.code, serviceOrders, routeCreated).map(l => l.toOrder))].join(", ");
    if (part.reallocatedTo) return { kind: "realocada", lentTo };
    const attended = serviceOrders.some(os => os.serviceOrderNumber === stop.serviceOrder && !os.ignoreInRoute && os.date.getTime() > routeCreated.getTime());
    if (!attended) return { kind: "aguardando", lentTo };
    const u = partUsageInStop(stop.serviceOrder, part.code, serviceOrders, routeCreated);
    if (u.defective) return { kind: "defeito", lentTo };
    if (u.used) return { kind: "usada", lentTo };
    return { kind: lentTo ? "cedida" : "nova", lentTo };
}
