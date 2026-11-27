// Manutenção de veículos: histórico de serviços (preventivos e corretivos), plano de manutenção preventiva
// (a cada X km e/ou Y meses) e custos (manutenção + combustível, por veículo e por mês). Lógica pura, sem banco.

import type { SheetDef, SheetRow } from "./spreadsheetXml";
import { periodRange, type PeriodKey } from "./quoteFunnel";
import { roundMoney } from "./quotes";

export type MaintenanceKind = "preventiva" | "corretiva";

export const MAINTENANCE_KIND_LABEL: Record<MaintenanceKind, string> = { preventiva: "Preventiva", corretiva: "Corretiva" };

/** Categorias sugeridas no cadastro (o campo aceita qualquer texto). */
export const MAINTENANCE_CATEGORIES = [
    "Troca de óleo e filtros", "Pneus", "Freios", "Revisão geral", "Suspensão", "Elétrica / bateria",
    "Ar-condicionado", "Funilaria e pintura", "Lavagem", "Documentação / IPVA", "Outros",
];

/** Modelos de plano preventivo para criar com um clique (intervalos comuns; ajuste conforme o manual do veículo). */
export const PLAN_PRESETS: { name: string; intervalKm?: number; intervalMonths?: number }[] = [
    { name: "Troca de óleo e filtros", intervalKm: 10000, intervalMonths: 6 },
    { name: "Rodízio e calibragem de pneus", intervalKm: 10000 },
    { name: "Revisão geral", intervalKm: 10000, intervalMonths: 12 },
    { name: "Pastilhas e discos de freio", intervalKm: 30000 },
    { name: "Correia dentada / acessórios", intervalKm: 60000 },
];

export type MaintenanceRecord = {
    id: string;
    vehicleId: string;
    planId?: string;
    kind: MaintenanceKind;
    category?: string;
    description: string;
    /** yyyy-MM-dd */
    serviceDate: string;
    odometerKm?: number;
    partsCost: number;
    laborCost: number;
    supplier?: string;
    invoiceNumber?: string;
    notes?: string;
    createdByName?: string;
};

export type MaintenancePlan = {
    id: string;
    vehicleId: string;
    name: string;
    intervalKm?: number;
    intervalMonths?: number;
    /** Última vez feita antes de usar o sistema (ponto de partida do prazo). */
    baselineOdometerKm?: number;
    baselineDate?: string;
    notes?: string;
    isActive: boolean;
};

export const totalCost = (r: Pick<MaintenanceRecord, "partsCost" | "laborCost">): number => roundMoney((r.partsCost || 0) + (r.laborCost || 0));

const dayMs = 86400000;
const parseDay = (s?: string): { y: number; m: number; d: number } | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};
const toDay = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Soma meses a uma data yyyy-MM-dd (31/08 + 6 meses = 28/02, não 03/03). */
export function addMonths(dateStr: string, months: number): string {
    const p = parseDay(dateStr);
    if (!p) return dateStr;
    const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return toDay(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p.d, last));
}

const daysBetween = (fromStr: string, today: Date): number | null => {
    const p = parseDay(fromStr);
    if (!p) return null;
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / dayMs);
};

// ---------- Plano preventivo ----------

export type PlanState = "vencida" | "breve" | "ok" | "sem_base";

export const KM_SOON = 1000;
export const DAYS_SOON = 30;

export type PlanStatus = {
    state: PlanState;
    nextKm?: number;
    nextDate?: string;
    kmLeft?: number;
    daysLeft?: number;
    /** Última execução considerada (do histórico ou o ponto de partida do plano). */
    lastDate?: string;
    lastKm?: number;
    label: string;
};

const kmText = (n: number) => n.toLocaleString("pt-BR");

/**
 * Situação de um item do plano. A base é a última execução registrada ligada ao plano; sem nenhuma, vale o
 * ponto de partida (baseline). Vence quando passa do km OU da data (o que vier primeiro).
 */
export function planStatus(plan: MaintenancePlan, records: MaintenanceRecord[], currentOdometerKm: number | undefined, today: Date): PlanStatus {
    const own = records.filter(r => r.planId === plan.id);
    const last = own.length ? own.reduce((a, b) => (b.serviceDate > a.serviceDate || (b.serviceDate === a.serviceDate && (b.odometerKm ?? 0) > (a.odometerKm ?? 0)) ? b : a)) : undefined;
    const lastDate = last ? last.serviceDate : plan.baselineDate;
    const lastKm = last ? last.odometerKm : plan.baselineOdometerKm;

    const nextKm = plan.intervalKm && lastKm !== undefined ? lastKm + plan.intervalKm : undefined;
    const nextDate = plan.intervalMonths && lastDate ? addMonths(lastDate, plan.intervalMonths) : undefined;
    const kmLeft = nextKm !== undefined && currentOdometerKm !== undefined ? nextKm - currentOdometerKm : undefined;
    const daysLeft = nextDate ? daysBetween(nextDate, today) ?? undefined : undefined;

    if (kmLeft === undefined && daysLeft === undefined) {
        return { state: "sem_base", nextKm, nextDate, lastDate, lastKm, label: "Sem ponto de partida (informe o último km/data)" };
    }
    const overdue = (kmLeft !== undefined && kmLeft <= 0) || (daysLeft !== undefined && daysLeft < 0) || (daysLeft === 0 && kmLeft === undefined);
    const soon = (kmLeft !== undefined && kmLeft <= KM_SOON) || (daysLeft !== undefined && daysLeft <= DAYS_SOON);
    const parts: string[] = [];
    if (kmLeft !== undefined) parts.push(kmLeft <= 0 ? `vencida há ${kmText(-kmLeft)} km` : `faltam ${kmText(kmLeft)} km`);
    if (daysLeft !== undefined) parts.push(daysLeft < 0 ? `vencida há ${-daysLeft} dia(s)` : daysLeft === 0 ? "vence hoje" : `faltam ${daysLeft} dia(s)`);
    return { state: overdue ? "vencida" : soon ? "breve" : "ok", nextKm, nextDate, kmLeft, daysLeft, lastDate, lastKm, label: parts.join(" · ") };
}

const STATE_ORDER: Record<PlanState, number> = { vencida: 0, breve: 1, sem_base: 2, ok: 3 };

/** Itens do plano (ativos) com a situação, os mais urgentes primeiro. */
export function planAlerts(
    plans: MaintenancePlan[], records: MaintenanceRecord[], odometerOf: (vehicleId: string) => number | undefined, today: Date,
): { plan: MaintenancePlan; status: PlanStatus }[] {
    return plans
        .filter(p => p.isActive)
        .map(plan => ({ plan, status: planStatus(plan, records, odometerOf(plan.vehicleId), today) }))
        .sort((a, b) => STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state] || (a.status.kmLeft ?? 1e9) - (b.status.kmLeft ?? 1e9));
}

// ---------- Custos ----------

const at = (s: string) => new Date(`${s}T12:00:00`);

/** A data (yyyy-MM-dd) cai no período? */
export function dateInPeriod(dateStr: string, key: PeriodKey, now: Date): boolean {
    const { from, to } = periodRange(key, now);
    const d = at(dateStr);
    return (!from || d >= from) && (!to || d < to);
}

export type CostBreakdown = {
    count: number;
    total: number;
    parts: number;
    labor: number;
    preventiva: { count: number; total: number };
    corretiva: { count: number; total: number };
    byCategory: { category: string; count: number; total: number }[];
};

export function costBreakdown(records: MaintenanceRecord[]): CostBreakdown {
    const out: CostBreakdown = { count: records.length, total: 0, parts: 0, labor: 0, preventiva: { count: 0, total: 0 }, corretiva: { count: 0, total: 0 }, byCategory: [] };
    const cats = new Map<string, { category: string; count: number; total: number }>();
    for (const r of records) {
        const t = totalCost(r);
        out.total += t; out.parts += r.partsCost || 0; out.labor += r.laborCost || 0;
        out[r.kind].count++; out[r.kind].total += t;
        const name = (r.category || "").replace(/\s+/g, " ").trim() || "Sem categoria";
        const c = cats.get(name.toLowerCase()) || cats.set(name.toLowerCase(), { category: name, count: 0, total: 0 }).get(name.toLowerCase())!;
        c.count++; c.total += t;
    }
    out.total = roundMoney(out.total); out.parts = roundMoney(out.parts); out.labor = roundMoney(out.labor);
    out.preventiva.total = roundMoney(out.preventiva.total); out.corretiva.total = roundMoney(out.corretiva.total);
    out.byCategory = [...cats.values()].map(c => ({ ...c, total: roundMoney(c.total) })).sort((a, b) => b.total - a.total);
    return out;
}

type VehicleLike = { id: string; plate: string; model?: string };
type FuelLike = { vehicleId: string; fuelDate: string; totalValue: number };
type KmLike = { vehicleId: string; logDate: string; odometerStart: number; odometerEnd?: number };

export type VehicleCostRow = {
    vehicleId: string;
    plate: string;
    model?: string;
    fuel: number;
    maintenance: number;
    preventive: number;
    corrective: number;
    total: number;
    km: number;
    /** Custo total (combustível + manutenção) por km rodado; nulo sem km fechado no período. */
    costPerKm: number | null;
};

/** Custo de operação por veículo no período: combustível + manutenção, com o km rodado (registros de km fechados). */
export function vehicleCosts(input: {
    vehicles: VehicleLike[]; maintenances: MaintenanceRecord[]; fuel: FuelLike[]; kmLogs: KmLike[]; period: PeriodKey; now: Date;
}): { rows: VehicleCostRow[]; totals: Omit<VehicleCostRow, "vehicleId" | "plate" | "model"> } {
    const inP = (s: string) => dateInPeriod(s, input.period, input.now);
    const rows: VehicleCostRow[] = input.vehicles.map(v => {
        const m = input.maintenances.filter(x => x.vehicleId === v.id && inP(x.serviceDate));
        const fuel = roundMoney(input.fuel.filter(x => x.vehicleId === v.id && inP(x.fuelDate)).reduce((s, x) => s + x.totalValue, 0));
        const km = input.kmLogs.filter(x => x.vehicleId === v.id && x.odometerEnd !== undefined && inP(x.logDate)).reduce((s, x) => s + (x.odometerEnd! - x.odometerStart), 0);
        const b = costBreakdown(m);
        const total = roundMoney(fuel + b.total);
        return { vehicleId: v.id, plate: v.plate, model: v.model, fuel, maintenance: b.total, preventive: b.preventiva.total, corrective: b.corretiva.total, total, km, costPerKm: km > 0 ? roundMoney(total / km) : null };
    });
    const sum = (f: (r: VehicleCostRow) => number) => roundMoney(rows.reduce((s, r) => s + f(r), 0));
    const km = rows.reduce((s, r) => s + r.km, 0);
    const total = sum(r => r.total);
    return {
        rows: rows.sort((a, b) => b.total - a.total),
        totals: { fuel: sum(r => r.fuel), maintenance: sum(r => r.maintenance), preventive: sum(r => r.preventive), corrective: sum(r => r.corrective), total, km, costPerKm: km > 0 ? roundMoney(total / km) : null },
    };
}

const MONTH_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Gasto por mês nos últimos `months` meses (do mais antigo ao atual), para o gráfico. */
export function monthlyCosts(maintenances: MaintenanceRecord[], fuel: FuelLike[], months: number, now: Date): { key: string; label: string; maintenance: number; fuel: number }[] {
    const out: { key: string; label: string; maintenance: number; fuel: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
        out.push({
            key,
            label: `${MONTH_ABBR[start.getMonth()]}/${String(start.getFullYear()).slice(2)}`,
            maintenance: roundMoney(maintenances.filter(m => m.serviceDate.startsWith(key)).reduce((s, m) => s + totalCost(m), 0)),
            fuel: roundMoney(fuel.filter(f => f.fuelDate.startsWith(key)).reduce((s, f) => s + f.totalValue, 0)),
        });
    }
    return out;
}

// ---------- Planilha ----------

const dmy = (s?: string) => { const p = parseDay(s); return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}` : ""; };

export function maintenanceSheet(records: MaintenanceRecord[], plateOf: (vehicleId: string) => string): SheetDef {
    const rows: SheetRow[] = [...records]
        .sort((a, b) => (a.serviceDate < b.serviceDate ? 1 : a.serviceDate > b.serviceDate ? -1 : 0))
        .map(r => ({
            tone: r.kind === "corretiva" ? "red" : "green",
            values: [dmy(r.serviceDate), plateOf(r.vehicleId), MAINTENANCE_KIND_LABEL[r.kind], r.category || "", r.description, r.odometerKm ?? "", r.partsCost, r.laborCost, totalCost(r), r.supplier || "", r.invoiceNumber || "", r.notes || "", r.createdByName || ""],
        }));
    return {
        name: "Manutenções",
        headers: ["Data", "Placa", "Tipo", "Categoria", "Serviço", "Km", "Peças (R$)", "Mão de obra (R$)", "Total (R$)", "Oficina / fornecedor", "Nota / OS", "Observações", "Lançado por"],
        widths: [11, 11, 11, 22, 36, 10, 12, 15, 12, 24, 14, 36, 18],
        rows,
    };
}

export function costsSheet(rows: VehicleCostRow[], totals: { fuel: number; maintenance: number; preventive: number; corrective: number; total: number; km: number; costPerKm: number | null }, label: string): SheetDef {
    const line = (plate: string, model: string, r: { fuel: number; maintenance: number; preventive: number; corrective: number; total: number; km: number; costPerKm: number | null }, tone?: SheetRow["tone"]): SheetRow => ({
        tone, values: [plate, model, r.fuel, r.maintenance, r.preventive, r.corrective, r.total, r.km, r.costPerKm ?? ""],
    });
    return {
        name: "Custos por veículo",
        headers: [`Placa (${label})`, "Modelo", "Combustível (R$)", "Manutenção (R$)", "Preventiva (R$)", "Corretiva (R$)", "Total (R$)", "Km rodado", "Custo por km (R$)"],
        widths: [20, 22, 16, 16, 15, 15, 14, 12, 16],
        rows: [...rows.map(r => line(r.plate, r.model || "", r)), line("TOTAL", "", totals, "blue")],
    };
}
