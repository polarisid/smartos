// Lembretes de OS críticas (ex.: a Samsung pediu para coletar um produto até 27/11): o lembrete guarda a OS e o prazo,
// e a tela mostra sozinha se a OS já entrou em rota e se já foi atendida.

export type RouteReminder = {
    id: string;
    createdAt: Date;
    createdByName?: string;
    title: string;
    /** Categoria livre (ex.: Troca RMA, Coleta). Vazia = sem categoria. */
    category?: string;
    osNumber?: string;
    clientName?: string;
    city?: string;
    notes?: string;
    /** Prazo, "yyyy-MM-dd". */
    dueDate?: string;
    doneAt?: Date;
    doneByName?: string;
};

export type ReminderStateKey = "concluido" | "atendida" | "visitada" | "em_rota" | "em_entrega" | "sem_rota" | "sem_os";

export type ReminderState = { key: ReminderStateKey; routeName?: string; attendedAt?: Date };

/** Categorias sugeridas no cadastro (o campo aceita qualquer texto). */
export const SUGGESTED_REMINDER_CATEGORIES = ["Troca RMA", "Coleta", "Entrega", "Reparo", "Outros"];

export const NO_CATEGORY = "Sem categoria";

/** Limpa a categoria digitada: espaços repetidos e limite de tamanho. */
export const cleanCategory = (c?: string | null): string => (c || "").replace(/\s+/g, " ").trim().slice(0, 40);

/** Categorias em uso, com a quantidade de lembretes de cada (sem diferenciar maiúscula; vale a grafia mais usada/primeira). Ordem alfabética, "Sem categoria" por último. */
export function categoryCounts(list: Pick<RouteReminder, "category">[]): { category: string; count: number }[] {
    const map = new Map<string, { category: string; count: number }>();
    list.forEach(r => {
        const name = cleanCategory(r.category) || NO_CATEGORY;
        const key = name.toLowerCase();
        const cur = map.get(key);
        if (cur) cur.count++; else map.set(key, { category: name, count: 1 });
    });
    return [...map.values()].sort((a, b) => (a.category === NO_CATEGORY ? 1 : 0) - (b.category === NO_CATEGORY ? 1 : 0) || a.category.localeCompare(b.category, "pt-BR"));
}

export const sameCategory = (a?: string | null, b?: string | null): boolean =>
    (cleanCategory(a) || NO_CATEGORY).toLowerCase() === (cleanCategory(b) || NO_CATEGORY).toLowerCase();

export const normalizeOs = (os?: string | null): string => (os || "").replace(/\s/g, "").toUpperCase();

type RouteLike = { name: string; kind?: string; isCanceled?: boolean; stops?: { serviceOrder?: string; isReallocated?: boolean }[] };

/** Em qual rota cada OS está: a rota de entrega só vale quando a OS ainda não está em rota rascunho/ativa. */
export function buildRoutesByOs(routes: RouteLike[], deliveryRoutes: RouteLike[]): Map<string, { name: string; kind: "rota" | "entrega" }> {
    const out = new Map<string, { name: string; kind: "rota" | "entrega" }>();
    const add = (list: RouteLike[], kind: "rota" | "entrega") => {
        list.forEach(rt => {
            if (rt.isCanceled || (kind === "rota" && rt.kind === "delivery")) return;
            (rt.stops || []).forEach(st => {
                const key = normalizeOs(st.serviceOrder);
                if (key && !st.isReallocated && !out.has(key)) out.set(key, { name: rt.name, kind });
            });
        });
    };
    add(routes, "rota");
    add(deliveryRoutes, "entrega");
    return out;
}

type OrderLike = { serviceOrderNumber: string; date: Date; isFinalized?: boolean; ignoreInRoute?: boolean };

export function buildOrdersByOs(orders: OrderLike[]): Map<string, OrderLike[]> {
    const out = new Map<string, OrderLike[]>();
    orders.forEach(os => {
        if (os.ignoreInRoute) return;
        const key = normalizeOs(os.serviceOrderNumber);
        if (!key) return;
        const list = out.get(key);
        if (list) list.push(os); else out.set(key, [os]);
    });
    return out;
}

/** Situação do lembrete: concluído à mão, atendida/visitada (lançamento depois do cadastro do lembrete), em rota ou ainda sem rota. */
export function reminderState(
    r: Pick<RouteReminder, "osNumber" | "createdAt" | "doneAt">,
    routesByOs: Map<string, { name: string; kind: "rota" | "entrega" }>,
    ordersByOs: Map<string, OrderLike[]>,
): ReminderState {
    if (r.doneAt) return { key: "concluido" };
    const os = normalizeOs(r.osNumber);
    if (!os) return { key: "sem_os" };
    const since = r.createdAt.getTime();
    const launched = (ordersByOs.get(os) || []).filter(o => o.date.getTime() >= since);
    if (launched.length > 0) {
        const last = launched.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a));
        return { key: last.isFinalized === false ? "visitada" : "atendida", attendedAt: last.date };
    }
    const route = routesByOs.get(os);
    if (route) return { key: route.kind === "entrega" ? "em_entrega" : "em_rota", routeName: route.name };
    return { key: "sem_rota" };
}

export type DueLevel = "nenhum" | "vencido" | "hoje" | "breve" | "ok";

/** Quanto falta para o prazo (dias de calendário). "breve" = até 3 dias. */
export function dueInfo(dueDate: string | undefined, today: Date): { days: number | null; level: DueLevel; label: string } {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate || "");
    if (!m) return { days: null, level: "nenhum", label: "Sem prazo" };
    const due = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((due - now) / 86400000);
    if (days < 0) return { days, level: "vencido", label: days === -1 ? "venceu ontem" : `venceu há ${-days} dias` };
    if (days === 0) return { days, level: "hoje", label: "vence hoje" };
    if (days === 1) return { days, level: "breve", label: "vence amanhã" };
    return { days, level: days <= 3 ? "breve" : "ok", label: `vence em ${days} dias` };
}

/** Abertos primeiro (prazo mais próximo no topo, sem prazo por último); concluídos no fim, do mais recente. */
export function sortReminders<T extends Pick<RouteReminder, "dueDate" | "createdAt" | "doneAt">>(list: T[]): T[] {
    return [...list].sort((a, b) => {
        const aDone = a.doneAt ? 1 : 0, bDone = b.doneAt ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        if (aDone) return b.doneAt!.getTime() - a.doneAt!.getTime();
        const ad = a.dueDate || "9999-99-99", bd = b.dueDate || "9999-99-99";
        return ad < bd ? -1 : ad > bd ? 1 : a.createdAt.getTime() - b.createdAt.getTime();
    });
}
