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

// ---------- Edição dos itens de um orçamento já salvo ----------

export type EditableQuoteItem = { code?: string; description: string; value: number; quantity: number; kind: "peca" | "servico" };

/** Registro de uma alteração de itens: quem mexeu, quando e de quanto para quanto. */
export type QuoteEditLog = { at: string; byName?: string; previousTotal: number; newTotal: number; status: QuoteStatus };

export const MAX_QUOTE_EDIT_LOG = 20;

/** Soma peças + serviços (valor x quantidade) menos o desconto, sempre em centavos exatos. */
export function itemsTotal(items: Pick<EditableQuoteItem, "value" | "quantity">[], discount = 0): number {
    const sum = items.reduce((s, i) => s + roundMoney(i.value) * (Number(i.quantity) || 1), 0);
    return roundMoney(sum - roundMoney(discount));
}

/** Limpa os textos dos itens (espaços sobrando, invisíveis) e arredonda os valores. */
export function cleanEditedItems(items: EditableQuoteItem[]): EditableQuoteItem[] {
    return items.map(i => {
        const code = cleanText(i.code);
        return {
            ...(code ? { code } : {}),
            description: cleanText(i.description),
            value: roundMoney(i.value),
            quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
            kind: i.kind,
        };
    });
}

export type QuoteEditCheck =
    | { ok: true; total: number; changed: boolean; needsConfirm: boolean; warnings: string[] }
    | { ok: false; error: string };

/**
 * Regras para salvar a edição dos itens:
 * - pelo menos 1 item, todos com descrição e valor válido; total não pode ficar negativo;
 * - o novo total não pode ficar abaixo do que já foi pago (o admin acerta os pagamentos antes);
 * - orçamento aprovado (com ou sem pagamento) pede confirmação, porque o cliente já aceitou o valor anterior.
 */
export function checkQuoteEdit(input: {
    items: EditableQuoteItem[];
    discount: number;
    previousTotal: number;
    status: QuoteStatus;
    payments: QuotePayment[] | undefined;
}): QuoteEditCheck {
    const items = cleanEditedItems(input.items);
    if (items.length === 0) return { ok: false, error: "O orçamento precisa ter pelo menos 1 item." };
    if (items.some(i => !i.description)) return { ok: false, error: "Todo item precisa de descrição." };
    if (items.some(i => !(i.value >= 0))) return { ok: false, error: "O valor de um item não pode ser negativo." };
    const discount = roundMoney(input.discount);
    if (discount < 0) return { ok: false, error: "O desconto não pode ser negativo." };
    const total = itemsTotal(items, discount);
    if (total < 0) return { ok: false, error: "O desconto é maior que a soma dos itens." };
    const paid = paidOf(input.payments);
    if (paid > total) {
        return { ok: false, error: `O novo total fica ${(paid - total).toFixed(2).replace(".", ",")} abaixo do que já foi pago (${paid.toFixed(2).replace(".", ",")}). Ajuste os pagamentos antes de reduzir o valor.` };
    }
    const changed = total !== roundMoney(input.previousTotal);
    const warnings: string[] = [];
    if (input.status === "aprovado") {
        warnings.push("Este orçamento já foi aprovado: o cliente aceitou o valor anterior.");
        if (paid > 0 && changed) warnings.push("Já tem pagamento lançado; o saldo a receber será recalculado.");
    }
    return { ok: true, total, changed, needsConfirm: input.status === "aprovado", warnings };
}

/** Acrescenta uma alteração ao histórico, guardando só as últimas. */
export const appendEditLog = (log: QuoteEditLog[] | undefined, entry: QuoteEditLog): QuoteEditLog[] =>
    [...(log || []), entry].slice(-MAX_QUOTE_EDIT_LOG);
