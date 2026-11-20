// Funil de orçamentos: de tudo que foi orçado, quanto foi aprovado, reprovado, ainda espera resposta e quanto já virou dinheiro.
// O período olha a data em que o orçamento foi CRIADO (coorte): "orçamentos de outubro" e o que aconteceu com eles até hoje.

import { paidOf, roundMoney, type QuotePayment, type QuoteStatus } from "./quotes";

export type FunnelQuote = {
    status: QuoteStatus;
    totalAmount: number;
    createdAt: Date;
    decidedAt?: Date;
    payments: QuotePayment[];
};

export type FunnelBucket = { count: number; value: number };

export type FunnelStats = {
    total: FunnelBucket;
    pendente: FunnelBucket;
    aprovado: FunnelBucket;
    reprovado: FunnelBucket;
    /** Aprovados já totalmente pagos. */
    quitado: FunnelBucket;
    /** Dinheiro já recebido dos aprovados. */
    received: number;
    /** Falta receber dos aprovados. */
    toReceive: number;
    /** Aprovados ÷ (aprovados + reprovados), em %. Nulo se ninguém respondeu ainda. */
    approvalRate: number | null;
    /** Aprovados ÷ todos os orçados, em % (pendentes contam como "não fechou ainda"). */
    conversionRate: number | null;
    /** Valor médio de um orçamento aprovado. */
    avgTicket: number;
    /** Dias, em média, entre criar e aprovar/reprovar. Nulo se não há dado. */
    avgDecisionDays: number | null;
};

const bucket = (): FunnelBucket => ({ count: 0, value: 0 });
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export function funnelStats(quotes: FunnelQuote[]): FunnelStats {
    const s: FunnelStats = {
        total: bucket(), pendente: bucket(), aprovado: bucket(), reprovado: bucket(), quitado: bucket(),
        received: 0, toReceive: 0, approvalRate: null, conversionRate: null, avgTicket: 0, avgDecisionDays: null,
    };
    let decisionMs = 0;
    let decisionN = 0;
    for (const q of quotes) {
        const value = roundMoney(q.totalAmount);
        s.total.count++; s.total.value += value;
        const b = s[q.status];
        b.count++; b.value += value;
        if (q.status === "aprovado") {
            const paid = Math.min(paidOf(q.payments), value);
            s.received += paid;
            s.toReceive += Math.max(0, value - paid);
            if (value > 0 && paid >= value) { s.quitado.count++; s.quitado.value += value; }
        }
        if (q.status !== "pendente" && q.decidedAt && q.decidedAt.getTime() >= q.createdAt.getTime()) {
            decisionMs += q.decidedAt.getTime() - q.createdAt.getTime();
            decisionN++;
        }
    }
    (["total", "pendente", "aprovado", "reprovado", "quitado"] as const).forEach(k => { s[k].value = roundMoney(s[k].value); });
    s.received = roundMoney(s.received);
    s.toReceive = roundMoney(s.toReceive);
    s.approvalRate = pct(s.aprovado.count, s.aprovado.count + s.reprovado.count);
    s.conversionRate = pct(s.aprovado.count, s.total.count);
    s.avgTicket = s.aprovado.count > 0 ? roundMoney(s.aprovado.value / s.aprovado.count) : 0;
    s.avgDecisionDays = decisionN > 0 ? Math.round((decisionMs / decisionN / 86400000) * 10) / 10 : null;
    return s;
}

// ---------- Período ----------

export type PeriodKey = "mes" | "mes_passado" | "3meses" | "ano" | "tudo";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
    { key: "mes", label: "Este mês" },
    { key: "mes_passado", label: "Mês passado" },
    { key: "3meses", label: "Últimos 3 meses" },
    { key: "ano", label: "Este ano" },
    { key: "tudo", label: "Tudo" },
];

/** Intervalo [from, to) do período. `null` em uma ponta = sem limite. */
export function periodRange(key: PeriodKey, now: Date): { from: Date | null; to: Date | null } {
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (key) {
        case "mes": return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
        case "mes_passado": return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
        case "3meses": return { from: new Date(y, m - 2, 1), to: new Date(y, m + 1, 1) };
        case "ano": return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
        default: return { from: null, to: null };
    }
}

export function quotesInPeriod<T extends { createdAt: Date }>(quotes: T[], key: PeriodKey, now: Date): T[] {
    const { from, to } = periodRange(key, now);
    return quotes.filter(q => (!from || q.createdAt >= from) && (!to || q.createdAt < to));
}

// ---------- Mês a mês ----------

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type MonthlyFunnel = { key: string; label: string; stats: FunnelStats };

/** Os últimos `months` meses (do mais antigo ao atual), mesmo os sem orçamento, para o gráfico não ter buracos. */
export function monthlyFunnel(quotes: FunnelQuote[], months: number, now: Date): MonthlyFunnel[] {
    const out: MonthlyFunnel[] = [];
    for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const inMonth = quotes.filter(q => q.createdAt >= start && q.createdAt < end);
        out.push({
            key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
            label: `${MONTH_ABBR[start.getMonth()]}/${String(start.getFullYear()).slice(2)}`,
            stats: funnelStats(inMonth),
        });
    }
    return out;
}
