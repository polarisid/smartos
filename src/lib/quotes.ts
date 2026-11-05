// Orçamentos salvos no SmartOS: situação (pendente/aprovado/reprovado) e controle do que já foi pago e do que falta pagar.
// Valores sempre em centavos exatos (arredondados a cada conta) para o saldo nunca ficar com 0,0000001 sobrando.

export type QuoteStatus = "pendente" | "aprovado" | "reprovado";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
    pendente: "Pendente",
    aprovado: "Aprovado",
    reprovado: "Reprovado",
};

export const PAYMENT_METHODS = ["Dinheiro", "PIX", "Cartão de Débito", "Cartão de Crédito", "Transferência", "Outro"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type QuotePayment = {
    id: string;
    amount: number;
    method: string;
    /** yyyy-MM-dd */
    date: string;
    note?: string;
    byName?: string;
};

/** Situação do pagamento de um orçamento aprovado. */
export type QuotePaymentState = "sem_pagamento" | "parcial" | "quitado";

export const PAYMENT_STATE_LABEL: Record<QuotePaymentState, string> = {
    sem_pagamento: "Sem pagamento",
    parcial: "Parcial",
    quitado: "Quitado",
};

export const roundMoney = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export const paidOf = (payments: QuotePayment[] | undefined): number =>
    roundMoney((payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0));

/** Quanto falta pagar (nunca negativo). */
export const balanceOf = (total: number, payments: QuotePayment[] | undefined): number =>
    Math.max(0, roundMoney(roundMoney(total) - paidOf(payments)));

export function paymentStateOf(total: number, payments: QuotePayment[] | undefined): QuotePaymentState {
    const paid = paidOf(payments);
    if (paid <= 0) return "sem_pagamento";
    return balanceOf(total, payments) <= 0 ? "quitado" : "parcial";
}

/** Percentual pago (0 a 100) para a barra de progresso. */
export function paidPercent(total: number, payments: QuotePayment[] | undefined): number {
    const t = roundMoney(total);
    if (t <= 0) return 0;
    return Math.min(100, Math.round((paidOf(payments) / t) * 100));
}

/**
 * Registra um pagamento. Recusa valor zerado/negativo e valor maior que o saldo
 * (erro de digitação com cara de "pagou a mais" some no controle).
 */
export function addPayment(
    total: number,
    payments: QuotePayment[] | undefined,
    input: { amount: number; method: string; date: string; note?: string; byName?: string; id?: string },
): { ok: true; payments: QuotePayment[] } | { ok: false; error: string } {
    const amount = roundMoney(input.amount);
    if (!(amount > 0)) return { ok: false, error: "Informe um valor maior que zero." };
    const balance = balanceOf(total, payments);
    if (amount > balance) {
        return { ok: false, error: balance <= 0 ? "Este orçamento já está quitado." : `O valor passa do que falta pagar (${balance.toFixed(2).replace(".", ",")}).` };
    }
    const next: QuotePayment = {
        id: input.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())),
        amount,
        method: input.method || "Outro",
        date: input.date,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        ...(input.byName ? { byName: input.byName } : {}),
    };
    return { ok: true, payments: [...(payments || []), next] };
}

export const removePayment = (payments: QuotePayment[] | undefined, id: string): QuotePayment[] =>
    (payments || []).filter(p => p.id !== id);

/** Texto do valor digitado ("1.234,50", "50,5", "50.5") em número. */
export function parseMoney(text: string): number {
    const clean = (text || "").replace(/[^\d.,]/g, "");
    if (!clean) return 0;
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");
    let normalized: string;
    if (lastComma >= 0 && lastDot >= 0) {
        // o último separador é o decimal; o outro é milhar
        normalized = lastComma > lastDot ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
    } else if (lastComma >= 0) {
        normalized = clean.replace(",", ".");
    } else {
        normalized = clean;
    }
    return roundMoney(parseFloat(normalized) || 0);
}

/**
 * Um orçamento só aceita pagamento quando aprovado. Ao reprovar/voltar a pendente com pagamento já lançado,
 * o app pede para o admin tratar os pagamentos antes (não some dinheiro registrado sem aviso).
 */
export const canReceivePayment = (status: QuoteStatus): boolean => status === "aprovado";
export const canChangeStatusTo = (current: QuoteStatus, next: QuoteStatus, payments: QuotePayment[] | undefined): { ok: true } | { ok: false; error: string } => {
    if (next !== "aprovado" && paidOf(payments) > 0) {
        return { ok: false, error: "Este orçamento já tem pagamento lançado. Remova os pagamentos antes de reprovar ou voltar para pendente." };
    }
    return { ok: true };
};

/** Texto de uma linha: tira espaços/tabs/espaços invisíveis do começo e do fim e junta repetidos no meio. */
export function cleanText(value?: string | null): string {
    return String(value ?? "").replace(/[\u00a0\u200b\ufeff\t]/g, " ").replace(/\s+/g, " ").trim();
}

/** Texto com várias linhas (observações etc.): limpa cada linha e tira as linhas vazias das pontas. */
export function cleanLines(value?: string | null): string {
    return String(value ?? "").replace(/[\u00a0\u200b\ufeff\t]/g, " ").split(/\r?\n/).map(l => l.replace(/ {2,}/g, " ").trim()).join("\n").trim();
}
