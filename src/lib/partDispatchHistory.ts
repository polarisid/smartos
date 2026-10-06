import type { Route, ServiceOrder } from "./data";

// Peça que já saiu para a MESMA OS em outra rota (outro dia). Serve pra a separação não
// pegar de novo uma peça que já está separada/levada.
export type PriorDispatch = {
    routeName: string;
    date: Date;          // saída da rota (ou criação)
    quantity: number;
    canceled: boolean;
    used: boolean;       // há OS lançada depois dessa rota com a peça trocada
};

const norm = (s?: string) => (s || "").trim().toUpperCase();
const key = (serviceOrder: string, partCode: string) => `${norm(serviceOrder)}|${norm(partCode)}`;
const asDate = (d: Date | string | undefined) => (d ? (d instanceof Date ? d : new Date(d)) : null);

/**
 * Monta o índice com todas as rotas já publicadas (rascunho nunca saiu) e devolve uma função
 * que, para uma rota/OS/peça, lista as saídas ANTERIORES (rota criada antes desta).
 */
export function buildPriorDispatchLookup(allRoutes: Route[], serviceOrders: ServiceOrder[]) {
    const index = new Map<string, Array<{ route: Route; quantity: number }>>();
    allRoutes.forEach(route => {
        if (route.isDraft) return;
        (route.stops || []).forEach(stop => {
            (stop.parts || []).forEach(part => {
                const k = key(stop.serviceOrder, part.code);
                const list = index.get(k) || [];
                list.push({ route, quantity: part.quantity || 1 });
                index.set(k, list);
            });
        });
    });

    const ordersByNumber = new Map<string, ServiceOrder[]>();
    serviceOrders.forEach(os => {
        const list = ordersByNumber.get(os.serviceOrderNumber) || [];
        list.push(os);
        ordersByNumber.set(os.serviceOrderNumber, list);
    });

    return (current: Route, serviceOrder: string, partCode: string): PriorDispatch[] => {
        const currentCreated = asDate(current.createdAt)?.getTime() ?? Infinity;
        const entries = (index.get(key(serviceOrder, partCode)) || []).filter(e => {
            if (e.route.id === current.id) return false;
            const created = asDate(e.route.createdAt)?.getTime();
            return created !== undefined && created < currentCreated;
        });

        return entries
            .map(e => {
                const created = asDate(e.route.createdAt)!;
                const used = (ordersByNumber.get(serviceOrder) || []).some(os =>
                    os.date.getTime() >= created.getTime() &&
                    os.date.getTime() < currentCreated &&
                    !!os.replacedPart &&
                    norm(os.replacedPart).includes(norm(partCode))
                );
                return {
                    routeName: e.route.name,
                    date: asDate(e.route.departureDate) || created,
                    quantity: e.quantity,
                    canceled: !!e.route.isCanceled,
                    used,
                };
            })
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    };
}

const fmtDay = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// Texto pra tela (text) e versão enxuta pra célula do PDF (short), ex.:
//   text:  "JÁ SAIU x1 em W38 - ROTA A (28/09) — sem uso registrado"
//   short: "JÁ SAIU 28/09"
export function describePriorDispatches(list: PriorDispatch[]): { text: string; short: string; allUsed: boolean } | null {
    if (list.length === 0) return null;
    const first = list[0];
    const allUsed = list.every(p => p.used);
    const extra = list.length > 1 ? ` +${list.length - 1} saída(s)` : "";
    const where = `${first.routeName} (${fmtDay(first.date)})${first.canceled ? " rota cancelada" : ""}`;
    const text = allUsed
        ? `Saiu x${first.quantity} em ${where}${extra} — já usada`
        : `JÁ SAIU x${first.quantity} em ${where}${extra} — sem uso registrado`;

    // Versão curta: só o essencial (a data da saída) pra caber na célula do PDF.
    const qty = first.quantity > 1 ? ` x${first.quantity}` : "";
    const more = list.length > 1 ? ` +${list.length - 1}` : "";
    const short = `${allUsed ? "Saiu" : "JÁ SAIU"}${qty} ${fmtDay(first.date)}${more}${allUsed ? " · usada" : ""}`;
    return { text, short, allUsed };
}
