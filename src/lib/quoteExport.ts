// Planilha de orçamentos: lista completa (uma linha por orçamento), resumo do funil e evolução mês a mês.
// Valores em número (a planilha soma/filtra), datas como dd/MM/aaaa.

import type { SheetDef, SheetRow, SheetTone } from "./spreadsheetXml";
import { balanceOf, paidOf, paymentStateOf, PAYMENT_STATE_LABEL, QUOTE_STATUS_LABEL, roundMoney, type QuotePayment, type QuoteStatus } from "./quotes";
import { funnelStats, type MonthlyFunnel } from "./quoteFunnel";

export type ExportQuote = {
    createdAt: Date;
    clientName: string;
    clientCpf?: string;
    clientNumber?: string;
    osNumber?: string;
    createdByName?: string;
    status: QuoteStatus;
    decidedAt?: Date;
    decidedByName?: string;
    rejectReason?: string;
    totalAmount: number;
    payments: QuotePayment[];
    snapshot: { items: { code?: string; description: string; quantity?: number }[]; observations?: string };
};

const dmy = (d?: Date) =>
    d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "";

const TONE: Record<QuoteStatus, SheetTone> = { aprovado: "green", reprovado: "red", pendente: "amber" };

export function quotesSheet(quotes: ExportQuote[]): SheetDef {
    const rows: SheetRow[] = [...quotes]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(q => {
            const approved = q.status === "aprovado";
            const methods = [...new Set(q.payments.map(p => p.method).filter(Boolean))].join(", ");
            return {
                tone: approved && balanceOf(q.totalAmount, q.payments) > 0 ? ("blue" as SheetTone) : TONE[q.status],
                values: [
                    dmy(q.createdAt),
                    q.clientName,
                    q.clientCpf || "",
                    q.clientNumber || "",
                    q.osNumber || "",
                    QUOTE_STATUS_LABEL[q.status],
                    roundMoney(q.totalAmount),
                    approved ? paidOf(q.payments) : 0,
                    approved ? balanceOf(q.totalAmount, q.payments) : 0,
                    approved ? PAYMENT_STATE_LABEL[paymentStateOf(q.totalAmount, q.payments)] : "",
                    methods,
                    dmy(q.decidedAt),
                    q.decidedByName || "",
                    q.rejectReason || "",
                    q.createdByName || "",
                    q.snapshot.items.map(i => `${i.quantity && i.quantity > 1 ? i.quantity + "x " : ""}${i.code ? i.code + " " : ""}${i.description}`.trim()).join("; "),
                    q.snapshot.observations || "",
                ],
            };
        });
    return {
        name: "Orçamentos",
        headers: ["Criado em", "Cliente", "CPF", "Telefone", "OS", "Situação", "Total (R$)", "Pago (R$)", "Saldo (R$)", "Pagamento", "Forma de pagamento", "Decidido em", "Decidido por", "Motivo da reprovação", "Lançado por", "Itens", "Observações"],
        widths: [11, 30, 15, 15, 14, 11, 12, 12, 12, 13, 20, 11, 18, 28, 18, 50, 36],
        rows,
    };
}

export function summarySheet(quotes: ExportQuote[], label: string): SheetDef {
    const s = funnelStats(quotes);
    const n = (v: number | null) => (v === null ? "" : v);
    const rows: SheetRow[] = [
        { values: ["Recorte", label] },
        { values: ["Orçamentos criados", s.total.count] },
        { values: ["Valor orçado (R$)", s.total.value] },
        { tone: "green", values: ["Aprovados", s.aprovado.count] },
        { tone: "green", values: ["Valor aprovado (R$)", s.aprovado.value] },
        { tone: "red", values: ["Reprovados", s.reprovado.count] },
        { tone: "red", values: ["Valor reprovado (R$)", s.reprovado.value] },
        { tone: "amber", values: ["Aguardando resposta", s.pendente.count] },
        { tone: "amber", values: ["Valor aguardando (R$)", s.pendente.value] },
        { values: ["Taxa de aprovação (%)", n(s.approvalRate)] },
        { values: ["Conversão (%)", n(s.conversionRate)] },
        { values: ["Ticket médio dos aprovados (R$)", s.avgTicket] },
        { values: ["Tempo médio de resposta (dias)", n(s.avgDecisionDays)] },
        { tone: "green", values: ["Quitados (recebidos por inteiro)", s.quitado.count] },
        { tone: "green", values: ["Já recebido (R$)", s.received] },
        { tone: "blue", values: ["Falta receber (R$)", s.toReceive] },
    ];
    return { name: "Resumo", headers: ["Indicador", "Valor"], widths: [38, 24], rows };
}

export function monthlySheet(months: MonthlyFunnel[]): SheetDef {
    return {
        name: "Mês a mês",
        headers: ["Mês", "Orçados", "Valor orçado (R$)", "Aprovados", "Valor aprovado (R$)", "Reprovados", "Valor reprovado (R$)", "Pendentes", "Valor pendente (R$)", "Taxa de aprovação (%)", "Recebido (R$)", "A receber (R$)"],
        widths: [10, 10, 16, 11, 17, 11, 17, 11, 16, 15, 14, 14],
        rows: months.map(m => ({
            values: [
                m.label, m.stats.total.count, m.stats.total.value, m.stats.aprovado.count, m.stats.aprovado.value,
                m.stats.reprovado.count, m.stats.reprovado.value, m.stats.pendente.count, m.stats.pendente.value,
                m.stats.approvalRate ?? "", m.stats.received, m.stats.toReceive,
            ],
        })),
    };
}

/** Todas as abas da planilha: resumo do recorte, mês a mês (se informado) e a lista dos orçamentos. */
export function buildQuoteSheets(input: { quotes: ExportQuote[]; label: string; months?: MonthlyFunnel[] }): SheetDef[] {
    return [
        summarySheet(input.quotes, input.label),
        ...(input.months ? [monthlySheet(input.months)] : []),
        quotesSheet(input.quotes),
    ];
}
