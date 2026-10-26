import { format } from "date-fns";
import type { CodeItem, Route, RoutePart, RouteStop, ServiceOrder } from "@/lib/data";

// Encerramento de ordens: junta, para cada OS lançada, as peças (com o rastreio da rota) e o texto do técnico.

const norm = (s?: string) => (s || "").trim().toUpperCase();

/** "DC93-00350B (x2), DC96-01574B" -> [{ code: "DC93-00350B", quantity: 2 }, { code: "DC96-01574B", quantity: 1 }] */
export function parseReplacedParts(replacedPart?: string): Array<{ code: string; quantity: number }> {
    return (replacedPart || "")
        .split(",")
        .map(raw => raw.trim())
        .map(raw => {
            const code = raw.match(/^([a-zA-Z0-9-]+)/)?.[0];
            if (!code) return null;
            const qty = raw.match(/\(\s*x\s*(\d+)\s*\)/i)?.[1];
            return { code: norm(code), quantity: qty ? Math.max(1, Number(qty)) : 1 };
        })
        .filter((p): p is { code: string; quantity: number } => !!p);
}

export type ClosingPartStatus = "usada" | "nao_usada";

export type ClosingPart = {
    code: string;
    description: string;
    quantity: number;
    status: ClosingPartStatus;
    /** Código de rastreio informado na rota (vazio = ainda não bipado). */
    trackingCode?: string;
    /** false = peça lançada pelo técnico que não consta nas peças da rota (ex.: do estoque). */
    fromRoute: boolean;
    /** Peça nova com defeito (pendência lançada pelo técnico). */
    defective: boolean;
};

export type RouteStopRef = { route: Route; stop: RouteStop };

/** Índice nº da OS -> paradas (de qualquer rota, inclusive de entrega) que a contêm. */
export function indexStopsBySO(routes: Route[]): Map<string, RouteStopRef[]> {
    const map = new Map<string, RouteStopRef[]>();
    for (const route of routes) {
        for (const stop of route.stops || []) {
            if (stop.isReallocated || !stop.serviceOrder) continue;
            const list = map.get(stop.serviceOrder) || [];
            list.push({ route, stop });
            map.set(stop.serviceOrder, list);
        }
    }
    return map;
}

const routeTime = (r: Route) => new Date(r.createdAt).getTime();

/**
 * Peças da OS para o encerramento: as da parada na rota (descrição e rastreio) marcadas como usadas ou não
 * conforme o "peça trocada" lançado pelo técnico, mais as usadas que não constam na rota.
 * Entre as rotas que contêm a OS vale a mais recente criada antes do lançamento; o rastreio vem da primeira
 * (da mais nova para a mais antiga) que tiver código para aquela peça - a rota de entrega e a do dia se sincronizam.
 */
export function closingPartsForOrder(order: ServiceOrder, stopsBySO: Map<string, RouteStopRef[]>): ClosingPart[] {
    const orderMs = order.date.getTime();
    const candidates = (stopsBySO.get(order.serviceOrderNumber) || [])
        .filter(c => routeTime(c.route) <= orderMs)
        .sort((a, b) => routeTime(b.route) - routeTime(a.route));

    const used = new Map(parseReplacedParts(order.replacedPart).map(p => [p.code, p.quantity]));
    const defectiveText = norm(order.pendingReason).includes("PEÇA NOVA COM DEFEITO") ? norm(order.pendingReason) : "";

    const tracking = new Map<string, string>();
    for (const c of candidates) {
        for (const p of c.stop.parts || []) {
            const t = (p.trackingCode || "").trim();
            if (t && !tracking.has(norm(p.code))) tracking.set(norm(p.code), t);
        }
    }

    const routeParts: RoutePart[] = candidates[0]?.stop.parts || [];
    const out: ClosingPart[] = routeParts.map(p => {
        const code = norm(p.code);
        return {
            code: p.code,
            description: p.description,
            quantity: used.get(code) ?? p.quantity,
            status: used.has(code) ? "usada" : "nao_usada",
            trackingCode: tracking.get(code),
            fromRoute: true,
            defective: !!defectiveText && defectiveText.includes(code),
        };
    });

    const inRoute = new Set(routeParts.map(p => norm(p.code)));
    used.forEach((quantity, code) => {
        if (inRoute.has(code)) return;
        out.push({ code, description: "", quantity, status: "usada", trackingCode: tracking.get(code), fromRoute: false, defective: false });
    });

    // Usadas primeiro, depois as não usadas.
    return out.sort((a, b) => Number(b.status === "usada") - Number(a.status === "usada"));
}

export type OrderTextContext = {
    technicianName: string;
    symptoms?: CodeItem[];
    repairs?: CodeItem[];
};

const SERVICE_TYPES_WITHOUT_CODES = ["visita_assurant", "coleta_eco_rma", "instalacao_inicial"];

// A pesquisa LP é gravada em observações como "[Pesquisa LP realizada: Sim | Nota: 9/10]" - volta para a linha própria do texto.
const LP_NOTE = /\n?\[Pesquisa LP realizada:\s*(Sim|Não)([^\]]*)\]\s*$/;

/** Separa a pesquisa LP (gravada junto das observações) do texto livre do técnico. */
export function splitLpSurvey(observations?: string): { observations: string; lpLine: string } {
    const raw = observations || "";
    const m = raw.match(LP_NOTE);
    if (!m) return { observations: raw.trim(), lpLine: "" };
    const done = m[1] === "Sim";
    const rating = m[2].match(/Nota(?: possível)?:\s*(\d+)\/10/)?.[1];
    const reason = m[2].match(/Motivo:\s*([^|\]]*)/)?.[1]?.trim();
    const lpLine = done
        ? `- **Pesquisa de Satisfação LP:** Realizada${rating !== undefined ? ` (Nota: ${rating}/10)` : ""}`
        : `- **Pesquisa de Satisfação LP:** Não realizada${reason ? ` — ${reason}` : ""}${rating !== undefined ? ` (Nota possível do cliente: ${rating}/10)` : ""}`;
    return { observations: raw.replace(LP_NOTE, "").trim(), lpLine };
}

/** Pendência gravada como "Peça nova com defeito (X)" é mostrada no texto como "... (Peça: X)". */
function pendingLabel(pendingReason?: string): string {
    const r = (pendingReason || "").trim();
    const m = r.match(/^(Peça nova com defeito|Repedido) \((.+)\)$/);
    return m ? `${m[1]} (Peça: ${m[2]})` : r;
}

/**
 * Reconstrói o "Texto Gerado" da tela de lançamento a partir da OS salva. A tela monta esse texto no aparelho do
 * técnico e não o grava, então esta função segue a mesma montagem (src/app/(main)/page.tsx, `previewText`) - se
 * aquele texto mudar, ajuste aqui também. Diferenças: a data é a do lançamento e o nome do auxiliar, quando o
 * técnico informou um, não é gravado e por isso não aparece.
 */
export function buildServiceOrderText(order: ServiceOrder, ctx: OrderTextContext): string {
    const isPending = order.isFinalized === false;
    const collectionLabel = order.collectionType ? order.collectionType.charAt(0).toUpperCase() + order.collectionType.slice(1) : "";
    const serviceTypeLabels: Record<string, string> = {
        reparo_samsung: `Reparo Samsung - ${order.samsungRepairType || ""}`,
        visita_orcamento_samsung: `Visita orçamento Samsung - Aprovado: ${order.samsungBudgetApproved ? "Sim" : "Não"}${order.samsungBudgetApproved && order.samsungBudgetValue ? `, Valor: R$ ${order.samsungBudgetValue}` : ""}`,
        visita_assurant: "Visita Assurant",
        coleta_eco_rma: `Coleta - ${collectionLabel}`,
        instalacao_inicial: "Instalação Inicial",
    };
    const serviceDetails = order.serviceType ? (serviceTypeLabels[order.serviceType] || order.serviceType) : "";

    const base = [
        `**Data: ${format(order.date, "dd/MM/yyyy")} - ${order.equipmentType}**`,
        `**Ordem de Serviço: ${order.serviceOrderNumber}**`,
        `- **Técnico:** ${ctx.technicianName}`,
        isPending ? `⚠️ **ATENDIMENTO NÃO FINALIZADO:** ${pendingLabel(order.pendingReason)} ⚠️` : "",
        !isPending && serviceDetails ? `- **Atendimento:** ${serviceDetails}` : "",
    ];

    const specific: string[] = [];
    const needsCodes = order.serviceType ? !SERVICE_TYPES_WITHOUT_CODES.includes(order.serviceType) : false;
    if (order.serviceType === "visita_assurant") {
        if (order.defectFound) specific.push(`- **Defeito Constatado:** ${order.defectFound}`);
        if (order.partsRequested) specific.push(`- **Peças Solicitadas:** ${order.partsRequested}`);
    } else if (needsCodes) {
        const sym = order.symptomCode ? ctx.symptoms?.find(s => s.code === order.symptomCode) : undefined;
        if (order.symptomCode && sym) specific.push(`- **Sintoma:** ${order.symptomCode} - ${sym.description}`);
        const rep = order.repairCode ? ctx.repairs?.find(r => r.code === order.repairCode) : undefined;
        if (order.repairCode && rep) specific.push(`- **Reparo:** ${order.repairCode} - ${rep.description}`);
    } else if (order.productCollectedOrInstalled) {
        specific.push(`- **Produto Coletado/Instalado:** ${order.productCollectedOrInstalled}`);
    }

    const lp = splitLpSurvey(order.observations);
    const optional = [
        order.replacedPart ? `- **Peça Trocada:** ${order.replacedPart}` : "",
        lp.lpLine,
        lp.observations ? `- **Observações:** ${lp.observations}` : "",
    ].filter(Boolean);

    return [...base, ...specific, ...optional].filter(Boolean).join("\n");
}

/** Texto único para colar no encerramento: texto do técnico + peças usadas com o rastreio. */
export function buildClosingSummary(text: string, parts: ClosingPart[]): string {
    const used = parts.filter(p => p.status === "usada");
    if (used.length === 0) return text;
    const lines = used.map(p => `- ${p.code}${p.description ? ` - ${p.description}` : ""} (x${p.quantity}) — rastreio: ${p.trackingCode || "não informado"}`);
    return `${text}\n\n**Peças usadas e rastreio:**\n${lines.join("\n")}`;
}

// ── Lançamentos duplicados ────────────────────────────────────────────────────────────────────────────────────

/** Janela em que dois lançamentos da mesma OS, com o mesmo status, contam como possível duplicidade. */
export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DuplicateLaunch = {
    order: ServiceOrder;
    /** Campos que mudam entre este lançamento e o outro (ex.: "observações"). Vazio = textos idênticos. */
    differences: string[];
};

const normText = (v?: string | number | boolean | null) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

const COMPARED_FIELDS: Array<[label: string, get: (o: ServiceOrder) => string]> = [
    ["tipo de atendimento", o => normText(o.serviceType)],
    ["tipo de reparo", o => normText(o.samsungRepairType)],
    ["sintoma", o => normText(o.symptomCode)],
    ["reparo", o => normText(o.repairCode)],
    ["peça trocada", o => parseReplacedParts(o.replacedPart).map(p => `${p.code}x${p.quantity}`).sort().join(",")],
    ["situação", o => (o.isFinalized === false ? `PENDENTE ${normText(o.pendingReason)}` : "FINALIZADO")],
    ["defeito constatado", o => normText(o.defectFound)],
    ["peças solicitadas", o => normText(o.partsRequested)],
    ["produto coletado/instalado", o => normText(o.productCollectedOrInstalled)],
    ["orçamento", o => `${o.samsungBudgetApproved ? "SIM" : "NAO"} ${o.samsungBudgetValue || 0}`],
    ["observações", o => normText(o.observations)],
];

export function launchDifferences(a: ServiceOrder, b: ServiceOrder): string[] {
    return COMPARED_FIELDS.filter(([, get]) => get(a) !== get(b)).map(([label]) => label);
}

/**
 * Lançamentos recentes repetidos: a mesma OS lançada mais de uma vez com o mesmo status (finalizada ou pendente) em até
 * `windowMs`. Pendência seguida da finalização NÃO conta: é o fluxo normal (o técnico volta e conclui). Devolve, por id
 * de lançamento, os outros lançamentos do grupo com o que mudou entre eles.
 */
export function findRecentDuplicates(orders: ServiceOrder[], windowMs: number = DUPLICATE_WINDOW_MS): Map<string, DuplicateLaunch[]> {
    const byNumber = new Map<string, ServiceOrder[]>();
    for (const o of orders) {
        if (!o.serviceOrderNumber) continue;
        const list = byNumber.get(o.serviceOrderNumber) || [];
        list.push(o);
        byNumber.set(o.serviceOrderNumber, list);
    }

    const result = new Map<string, DuplicateLaunch[]>();
    const add = (to: ServiceOrder, other: ServiceOrder) => {
        const list = result.get(to.id) || [];
        list.push({ order: other, differences: launchDifferences(to, other) });
        result.set(to.id, list);
    };

    for (const group of byNumber.values()) {
        if (group.length < 2) continue;
        const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[j].date.getTime() - sorted[i].date.getTime() > windowMs) break;
                if ((sorted[i].isFinalized === false) !== (sorted[j].isFinalized === false)) continue;
                add(sorted[i], sorted[j]);
                add(sorted[j], sorted[i]);
            }
        }
    }
    return result;
}
