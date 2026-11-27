import { supabase } from "@/lib/supabase";
import type { MaintenanceKind, MaintenancePlan, MaintenanceRecord } from "@/lib/vehicleMaintenance";

export type MaintenanceInput = Omit<MaintenanceRecord, "id" | "createdByName"> & { createdByName?: string };
export type PlanInput = Omit<MaintenancePlan, "id">;

const clean = (s?: string) => (s || "").replace(/\s+/g, " ").trim();

const recordFromDb = (r: any): MaintenanceRecord => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  planId: r.plan_id ?? undefined,
  kind: (r.kind === "corretiva" ? "corretiva" : "preventiva") as MaintenanceKind,
  category: r.category ?? undefined,
  description: r.description,
  serviceDate: String(r.service_date).slice(0, 10),
  odometerKm: r.odometer_km ?? undefined,
  partsCost: Number(r.parts_cost) || 0,
  laborCost: Number(r.labor_cost) || 0,
  supplier: r.supplier ?? undefined,
  invoiceNumber: r.invoice_number ?? undefined,
  notes: r.notes ?? undefined,
  createdByName: r.created_by_name ?? undefined,
});

const recordToDb = (m: Omit<MaintenanceInput, "createdByName">) => ({
  vehicle_id: m.vehicleId,
  plan_id: m.planId || null,
  kind: m.kind,
  category: clean(m.category).slice(0, 60) || null,
  description: clean(m.description),
  service_date: m.serviceDate,
  odometer_km: m.odometerKm ?? null,
  parts_cost: m.partsCost || 0,
  labor_cost: m.laborCost || 0,
  supplier: clean(m.supplier) || null,
  invoice_number: clean(m.invoiceNumber) || null,
  notes: m.notes?.trim() || null,
});

const planFromDb = (r: any): MaintenancePlan => ({
  id: r.id,
  vehicleId: r.vehicle_id,
  name: r.name,
  intervalKm: r.interval_km ?? undefined,
  intervalMonths: r.interval_months ?? undefined,
  baselineOdometerKm: r.baseline_odometer_km ?? undefined,
  baselineDate: r.baseline_date ? String(r.baseline_date).slice(0, 10) : undefined,
  notes: r.notes ?? undefined,
  isActive: r.is_active !== false,
});

const planToDb = (p: PlanInput) => ({
  vehicle_id: p.vehicleId,
  name: clean(p.name),
  interval_km: p.intervalKm ?? null,
  interval_months: p.intervalMonths ?? null,
  baseline_odometer_km: p.baselineOdometerKm ?? null,
  baseline_date: p.baselineDate || null,
  notes: p.notes?.trim() || null,
  is_active: p.isActive,
});

// .select('id'): o Supabase devolve sucesso mesmo quando o RLS barra a escrita (0 linhas); aqui isso vira erro.
async function write(table: string, run: (q: any) => any, message: string): Promise<void> {
  const { data, error } = await run(supabase.from(table)).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(message);
}

export const vehicleMaintenanceService = {
  async getAll(unidadeId?: string | null): Promise<MaintenanceRecord[]> {
    let query = supabase.from("vehicle_maintenances").select("*").order("service_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(recordFromDb);
  },

  // unidadeId: obrigatório na prática pro master (o gatilho do banco só preenche a unidade de quem não é master).
  async create(input: MaintenanceInput, unidadeId?: string | null): Promise<string> {
    const { data, error } = await supabase
      .from("vehicle_maintenances")
      .insert({ ...recordToDb(input), created_by_name: input.createdByName || null, ...(unidadeId ? { unidade_id: unidadeId } : {}) } as any)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  async update(id: string, input: Omit<MaintenanceInput, "createdByName">): Promise<void> {
    await write("vehicle_maintenances", q => q.update(recordToDb(input) as any).eq("id", id), "A alteração não foi salva (sem permissão ou registro removido).");
  },

  async remove(id: string): Promise<void> {
    await write("vehicle_maintenances", q => q.delete().eq("id", id), "O registro não foi apagado (sem permissão ou já removido).");
  },

  async getPlans(unidadeId?: string | null): Promise<MaintenancePlan[]> {
    let query = supabase.from("vehicle_maintenance_plans").select("*").order("created_at", { ascending: true });
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(planFromDb);
  },

  async createPlan(input: PlanInput, unidadeId?: string | null): Promise<string> {
    const { data, error } = await supabase
      .from("vehicle_maintenance_plans")
      .insert({ ...planToDb(input), ...(unidadeId ? { unidade_id: unidadeId } : {}) } as any)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  async updatePlan(id: string, input: PlanInput): Promise<void> {
    await write("vehicle_maintenance_plans", q => q.update(planToDb(input) as any).eq("id", id), "A alteração não foi salva (sem permissão ou item removido).");
  },

  async removePlan(id: string): Promise<void> {
    await write("vehicle_maintenance_plans", q => q.delete().eq("id", id), "O item não foi apagado (sem permissão ou já removido).");
  },
};
