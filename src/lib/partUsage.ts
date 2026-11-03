import type { ServiceOrder } from "./data";

const norm = (s?: string) => (s || "").trim().toUpperCase();

// "DC93-00350B (x1), DC96-01574B" -> ["DC93-00350B", "DC96-01574B"]
function codesIn(replacedPart?: string): string[] {
    return (replacedPart || "")
        .split(",")
        .filter(raw => !borrowedFromOrder(raw)) // peça que veio de outra OS não é a peça desta parada
        .map(raw => raw.trim().match(/^([a-zA-Z0-9/-]+)/)?.[0])
        .filter((c): c is string => !!c)
        .map(norm);
}

// ── Peça usada de OUTRA OS ──────────────────────────────────────────────────────────────────────────────────────
// O técnico pode usar, numa OS, uma peça que foi enviada para outra OS da rota dele (ex.: peça compatível). O
// lançamento grava isso no próprio "peça trocada", sem coluna nova: "DC93-00350B (x2) [da OS 4176757974]".
// A OS de origem descobre que cedeu a peça procurando essa marca nos lançamentos das outras OS.

/** Peça que o técnico usou numa OS e que veio de outra OS. */
export type BorrowedPart = { fromOrder: string; code: string; description?: string; quantity: number };

const BORROWED_TAG = /\[\s*da\s+OS\s+([a-zA-Z0-9-]+)\s*\]/i;

/** "DC93-00350B (x2) [da OS 123]" -- texto gravado em "peça trocada" para uma peça cedida por outra OS. */
export function formatBorrowedPart(b: BorrowedPart): string {
    return `${b.code}${b.quantity > 1 ? ` (x${b.quantity})` : ""} [da OS ${b.fromOrder}]`;
}

/** Número da OS de origem de um item de "peça trocada" ("... [da OS 123]"), ou null quando a peça é da própria OS. */
export function borrowedFromOrder(rawItem: string): string | null {
    return rawItem.match(BORROWED_TAG)?.[1] ?? null;
}

/**
 * Linha das peças no texto gerado para o técnico. Sem peça de outra OS continua "Peça Trocada: X"; com ela vira
 * "Peças usadas: X, BN96-55108A (usada da OS: 46656565)", deixando explícito de onde a peça saiu.
 */
export function replacedPartTextLine(replacedPart?: string): string {
    const raw = (replacedPart || "").trim();
    if (!raw) return "";
    const items = raw.split(",").map(i => i.trim()).filter(Boolean);
    if (!items.some(i => borrowedFromOrder(i))) return `- **Peça Trocada:** ${raw}`;
    const shown = items.map(i => {
        const from = borrowedFromOrder(i);
        return from ? i.replace(BORROWED_TAG, "").trim() + ` (usada da OS: ${from})` : i;
    });
    return `- **Peças usadas:** ${shown.join(", ")}`;
}

export type LentPart = { toOrder: string; quantity: number; date: Date };

/** "cedida para a OS 222 (x1), OS 333 (x2)" -- aviso na OS de origem; vazio quando a peça não foi cedida. */
export function lentNotice(lent: LentPart[]): string {
    if (lent.length === 0) return "";
    return "cedida para a " + lent.map(l => `OS ${l.toOrder}${l.quantity > 1 ? ` (x${l.quantity})` : ""}`).join(", ");
}

/**
 * Quanto da peça `partCode` da OS `sourceOrder` já foi cedido para outras OS (lançamentos finalizados depois da rota
 * criada, cujo "peça trocada" traz "[da OS sourceOrder]").
 */
export function lentFromOrder(
    sourceOrder: string,
    partCode: string,
    serviceOrders: ServiceOrder[],
    routeCreatedAt: Date
): LentPart[] {
    const code = norm(partCode);
    const source = norm(sourceOrder);
    const out: LentPart[] = [];
    for (const os of serviceOrders) {
        if (os.serviceOrderNumber === sourceOrder || os.ignoreInRoute || os.isFinalized === false || !os.replacedPart) continue;
        if (!(os.date.getTime() > routeCreatedAt.getTime())) continue;
        for (const raw of os.replacedPart.split(",")) {
            const item = raw.trim();
            const from = borrowedFromOrder(item);
            if (!from || norm(from) !== source) continue;
            if (norm(item.match(/^([a-zA-Z0-9/-]+)/)?.[0]) !== code) continue;
            const qty = item.match(/\(\s*x\s*(\d+)\s*\)/i)?.[1];
            out.push({ toOrder: os.serviceOrderNumber, quantity: qty ? Math.max(1, Number(qty)) : 1, date: os.date });
        }
    }
    return out;
}

/**
 * Situação de UMA peça de UMA OS depois que a rota foi criada: usada (consta em "peça trocada" de
 * alguma OS lançada) e/ou defeito de peça nova (pendência). Considera TODAS as OS lançadas para o
 * número daquela parada - não só a mais recente, que pode ser uma visita sem peça (pendência/retorno)
 * e fazia o extrato mostrar "Nova" quando a tela de resumo mostrava "Usada".
 */
export function partUsageInStop(
    serviceOrderNumber: string,
    partCode: string,
    serviceOrders: ServiceOrder[],
    routeCreatedAt: Date
): { used: boolean; defective: boolean } {
    const code = norm(partCode);
    let used = false;
    let defective = false;
    for (const os of serviceOrders) {
        if (os.serviceOrderNumber !== serviceOrderNumber || os.ignoreInRoute) continue;
        if (!(os.date.getTime() > routeCreatedAt.getTime())) continue;
        if (codesIn(os.replacedPart).includes(code)) used = true;
        if (os.pendingReason?.includes("Peça nova com defeito") && norm(os.pendingReason).includes(code)) defective = true;
    }
    return { used, defective };
}
