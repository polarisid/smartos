// Gastos de rota (alimentação, hospedagem, outros): categorias configuráveis, totais e filtros.
// Só lógica pura (sem rede), para ser testada à parte.

import { cleanText, roundMoney } from "./quotes";

export const DEFAULT_EXPENSE_CATEGORIES = ["Alimentação", "Hospedagem", "Outros"];
export const MAX_EXPENSE_CATEGORIES = 20;

export type RouteExpense = {
    id: string;
    routeId: string;
    routeName?: string;
    category: string;
    amount: number;
    /** Dia do gasto, "yyyy-MM-dd". */
    date: string;
    description?: string;
    /** Fotos/PDFs do comprovante (o primeiro é o principal). Gastos antigos têm só um. */
    receiptPaths: string[];
    createdBy?: string;
    createdByName?: string;
    createdAt: Date;
};

/** Lista de categorias vinda da configuração: limpa espaços, tira vazias e repetidas (sem diferenciar maiúscula) e limita o tamanho. Vazia = padrão. */
export function normalizeExpenseCategories(raw: unknown): string[] {
    const list = Array.isArray(raw) ? raw : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const name = cleanText(typeof item === "string" ? item : "").slice(0, 40);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
        if (out.length >= MAX_EXPENSE_CATEGORIES) break;
    }
    return out.length > 0 ? out : [...DEFAULT_EXPENSE_CATEGORIES];
}

export function totalOf(expenses: Pick<RouteExpense, "amount">[]): number {
    return roundMoney(expenses.reduce((n, e) => n + e.amount, 0));
}

/** Total por categoria, do maior para o menor. Categoria apagada da configuração continua aparecendo (o gasto guarda o nome). */
export function totalsByCategory(expenses: Pick<RouteExpense, "amount" | "category">[]): { category: string; total: number; count: number }[] {
    const map = new Map<string, { category: string; total: number; count: number }>();
    for (const e of expenses) {
        const row = map.get(e.category) || { category: e.category, total: 0, count: 0 };
        row.total = roundMoney(row.total + e.amount);
        row.count += 1;
        map.set(e.category, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "pt-BR"));
}

export type RouteExpenseGroup = { routeId: string; routeName: string; total: number; count: number; byCategory: { category: string; total: number; count: number }[]; lastDate: string };

/** Agrupa por rota (mais recente primeiro) com o total e o total por categoria de cada uma. */
export function groupByRoute(expenses: RouteExpense[]): RouteExpenseGroup[] {
    const map = new Map<string, RouteExpense[]>();
    for (const e of expenses) map.set(e.routeId, [...(map.get(e.routeId) || []), e]);
    return [...map.entries()]
        .map(([routeId, list]) => ({
            routeId,
            routeName: list.find(e => e.routeName)?.routeName || "Rota sem nome",
            total: totalOf(list),
            count: list.length,
            byCategory: totalsByCategory(list),
            lastDate: list.reduce((d, e) => (e.date > d ? e.date : d), ""),
        }))
        .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.routeName.localeCompare(b.routeName, "pt-BR"));
}

export type ExpenseFilter = { from?: string; to?: string; category?: string; technician?: string; routeId?: string; search?: string };

export function filterExpenses(expenses: RouteExpense[], f: ExpenseFilter): RouteExpense[] {
    const term = cleanText(f.search).toLowerCase();
    return expenses.filter(e => {
        if (f.from && e.date < f.from) return false;
        if (f.to && e.date > f.to) return false;
        if (f.category && e.category !== f.category) return false;
        if (f.technician && (e.createdByName || "") !== f.technician) return false;
        if (f.routeId && e.routeId !== f.routeId) return false;
        if (!term) return true;
        return [e.routeName, e.category, e.description, e.createdByName].some(v => (v || "").toLowerCase().includes(term));
    });
}

/** Máximo de arquivos de comprovante por gasto. */
export const MAX_EXPENSE_RECEIPTS = 5;

/** Lista de comprovantes de um gasto: usa a coluna nova (lista) e, se vazia, cai no caminho único dos gastos antigos. */
export function receiptPathsOf(list: unknown, first: unknown): string[] {
    const fromList = Array.isArray(list) ? list.filter((p): p is string => typeof p === "string" && p.length > 0) : [];
    if (fromList.length > 0) return fromList;
    return typeof first === "string" && first ? [first] : [];
}
