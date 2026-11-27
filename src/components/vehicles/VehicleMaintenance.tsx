"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Edit, FileSpreadsheet, Plus, PlusCircle, Search, Trash2, Wrench, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Vehicle, VehicleFuelLog, VehicleKmLog } from "@/lib/data";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/quoteFunnel";
import { parseMoney } from "@/lib/quotes";
import { downloadSpreadsheet } from "@/lib/spreadsheetXml";
import {
  MAINTENANCE_CATEGORIES, MAINTENANCE_KIND_LABEL, PLAN_PRESETS, costBreakdown, costsSheet, dateInPeriod, maintenanceSheet,
  monthlyCosts, planAlerts, totalCost, vehicleCosts,
  type MaintenanceKind, type MaintenancePlan, type MaintenanceRecord, type PlanState,
} from "@/lib/vehicleMaintenance";
import { cn } from "@/lib/utils";
import { vehicleMaintenanceService } from "@/services/supabase/vehicleMaintenanceService";

const NONE = "none";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kmFmt = (n: number) => n.toLocaleString("pt-BR");
const dayLabel = (iso?: string) => (iso ? format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy") : "—");
const toInt = (s: string) => (s.trim() === "" ? undefined : Math.round(Number(s.replace(",", "."))));
const today = () => format(new Date(), "yyyy-MM-dd");

const STATE_BADGE: Record<PlanState, { label: string; cls: string }> = {
  vencida: { label: "Vencida", cls: "bg-red-600/15 text-red-700 hover:bg-red-600/15 dark:text-red-400" },
  breve: { label: "Em breve", cls: "bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400" },
  ok: { label: "Em dia", cls: "bg-green-600/15 text-green-700 hover:bg-green-600/15 dark:text-green-400" },
  sem_base: { label: "Sem base", cls: "bg-slate-500/15 text-slate-700 hover:bg-slate-500/15 dark:text-slate-300" },
};

type MForm = {
  vehicleId: string; kind: MaintenanceKind; planId: string; category: string; description: string; serviceDate: string;
  odometer: string; parts: string; labor: string; supplier: string; invoice: string; notes: string;
};
const emptyM = (): MForm => ({ vehicleId: "", kind: "corretiva", planId: NONE, category: "", description: "", serviceDate: today(), odometer: "", parts: "", labor: "", supplier: "", invoice: "", notes: "" });

type PForm = { vehicleId: string; name: string; intervalKm: string; intervalMonths: string; baselineOdometer: string; baselineDate: string; notes: string; isActive: boolean };
const emptyP = (): PForm => ({ vehicleId: "", name: "", intervalKm: "", intervalMonths: "", baselineOdometer: "", baselineDate: today(), notes: "", isActive: true });

/**
 * Manutenção dos veículos: plano preventivo (alertas por km/prazo), histórico de serviços (preventivos e corretivos)
 * e custos (manutenção + combustível, por veículo, categoria e mês).
 */
export function VehicleMaintenance({ vehicles, fuelLogs, kmLogs }: { vehicles: Vehicle[]; fuelLogs: VehicleFuelLog[]; kmLogs: VehicleKmLog[] }) {
  const { toast } = useToast();
  const { activeUnidadeId, appUser } = useAuth();
  const isMaster = appUser?.role === "master";
  const queryClient = useQueryClient();
  const keyBase = [activeUnidadeId, appUser?.uid];
  const enabled = !!appUser?.uid;

  const { data: records = [], isLoading, error } = useQuery({
    queryKey: ["vehicle-maintenances", ...keyBase], queryFn: () => vehicleMaintenanceService.getAll(activeUnidadeId), enabled,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["vehicle-maintenance-plans", ...keyBase], queryFn: () => vehicleMaintenanceService.getPlans(activeUnidadeId), enabled,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vehicle-maintenances"] });
    queryClient.invalidateQueries({ queryKey: ["vehicle-maintenance-plans"] });
    queryClient.invalidateQueries({ queryKey: ["vehicles"] }); // o hodômetro do veículo pode ter avançado
  };

  const now = useMemo(() => new Date(), []);
  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const plateOf = (id: string) => vehicleById.get(id)?.plate ?? "—";
  const activeVehicles = useMemo(() => vehicles.filter(v => v.isActive), [vehicles]);
  const planById = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);

  const [period, setPeriod] = useState<PeriodKey>("3meses");
  const [vehicleFilter, setVehicleFilter] = useState(NONE);
  const [kindFilter, setKindFilter] = useState<"all" | MaintenanceKind>("all");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requireUnidade = () => {
    if (isMaster && !activeUnidadeId) {
      toast({ variant: "destructive", title: "Selecione uma unidade", description: "Escolha uma unidade no seletor no topo antes de cadastrar." });
      return false;
    }
    return true;
  };

  // ── Alertas do plano ──────────────────────────────────────────────────
  const alerts = useMemo(() => planAlerts(plans, records, id => vehicleById.get(id)?.currentOdometerKm, now), [plans, records, vehicleById, now]);
  const overdue = alerts.filter(a => a.status.state === "vencida").length;
  const soon = alerts.filter(a => a.status.state === "breve").length;

  // ── Histórico filtrado ────────────────────────────────────────────────
  const history = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter(r =>
      dateInPeriod(r.serviceDate, period, now)
      && (vehicleFilter === NONE || r.vehicleId === vehicleFilter)
      && (kindFilter === "all" || r.kind === kindFilter)
      && (!term || [r.description, r.category, r.supplier, r.invoiceNumber, r.notes, plateOf(r.vehicleId)].some(v => v && v.toLowerCase().includes(term))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, period, vehicleFilter, kindFilter, search, now, vehicleById]);
  const historyTotals = useMemo(() => costBreakdown(history), [history]);

  // ── Custos ────────────────────────────────────────────────────────────
  const costs = useMemo(
    () => vehicleCosts({ vehicles, maintenances: records, fuel: fuelLogs, kmLogs, period, now }),
    [vehicles, records, fuelLogs, kmLogs, period, now],
  );
  const periodRecords = useMemo(() => records.filter(r => dateInPeriod(r.serviceDate, period, now)), [records, period, now]);
  const periodBreakdown = useMemo(() => costBreakdown(periodRecords), [periodRecords]);
  const months = useMemo(() => monthlyCosts(records, fuelLogs, 6, now), [records, fuelLogs, now]);
  const maxMonth = Math.max(1, ...months.map(m => m.maintenance + m.fuel));
  const periodLabel = PERIOD_OPTIONS.find(p => p.key === period)?.label || "";

  const exportSheet = () => {
    downloadSpreadsheet(`Manutenção de veículos - ${periodLabel} - ${today()}`, [
      costsSheet(costs.rows, costs.totals, periodLabel),
      maintenanceSheet(periodRecords, plateOf),
    ]);
  };

  // ── Serviço (registro) ────────────────────────────────────────────────
  const [mOpen, setMOpen] = useState(false);
  const [mEditing, setMEditing] = useState<MaintenanceRecord | null>(null);
  const [mForm, setMForm] = useState<MForm>(emptyM);
  const [mDelete, setMDelete] = useState<MaintenanceRecord | null>(null);

  const openNew = (preset?: Partial<MForm>) => {
    const single = activeVehicles.length === 1 ? activeVehicles[0] : undefined;
    const vehicleId = preset?.vehicleId ?? (vehicleFilter !== NONE ? vehicleFilter : single?.id ?? "");
    const v = vehicleById.get(vehicleId);
    setMEditing(null);
    setMForm({ ...emptyM(), vehicleId, odometer: v?.currentOdometerKm != null ? String(v.currentOdometerKm) : "", ...preset });
    setMOpen(true);
  };

  const openEdit = (r: MaintenanceRecord) => {
    setMEditing(r);
    setMForm({
      vehicleId: r.vehicleId, kind: r.kind, planId: r.planId ?? NONE, category: r.category ?? "", description: r.description, serviceDate: r.serviceDate,
      odometer: r.odometerKm != null ? String(r.odometerKm) : "", parts: r.partsCost ? String(r.partsCost).replace(".", ",") : "", labor: r.laborCost ? String(r.laborCost).replace(".", ",") : "",
      supplier: r.supplier ?? "", invoice: r.invoiceNumber ?? "", notes: r.notes ?? "",
    });
    setMOpen(true);
  };

  const registerPlan = (p: MaintenancePlan) =>
    openNew({ vehicleId: p.vehicleId, kind: "preventiva", planId: p.id, category: p.name, description: p.name,
      odometer: vehicleById.get(p.vehicleId)?.currentOdometerKm != null ? String(vehicleById.get(p.vehicleId)!.currentOdometerKm) : "" });

  const mParts = parseMoney(mForm.parts);
  const mLabor = parseMoney(mForm.labor);
  const mOdo = toInt(mForm.odometer);

  const saveRecord = async () => {
    if (!mForm.vehicleId) { toast({ variant: "destructive", title: "Escolha o veículo" }); return; }
    if (!mForm.description.trim()) { toast({ variant: "destructive", title: "Descreva o serviço" }); return; }
    if (!mForm.serviceDate) { toast({ variant: "destructive", title: "Informe a data" }); return; }
    if (mOdo !== undefined && (Number.isNaN(mOdo) || mOdo < 0)) { toast({ variant: "destructive", title: "Km inválido" }); return; }
    if (!mEditing && !requireUnidade()) return;
    const payload = {
      vehicleId: mForm.vehicleId, kind: mForm.kind, planId: mForm.planId === NONE ? undefined : mForm.planId, category: mForm.category,
      description: mForm.description, serviceDate: mForm.serviceDate, odometerKm: mOdo, partsCost: mParts, laborCost: mLabor,
      supplier: mForm.supplier, invoiceNumber: mForm.invoice, notes: mForm.notes,
    };
    setSubmitting(true);
    try {
      if (mEditing) await vehicleMaintenanceService.update(mEditing.id, payload);
      else await vehicleMaintenanceService.create({ ...payload, createdByName: appUser?.name }, activeUnidadeId);
      toast({ title: mEditing ? "Serviço atualizado!" : "Serviço registrado!" });
      setMOpen(false);
      refresh();
    } catch (e: any) {
      console.error("Error saving maintenance:", e);
      toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async () => {
    if (!mDelete) return;
    setSubmitting(true);
    try {
      await vehicleMaintenanceService.remove(mDelete.id);
      toast({ title: "Serviço excluído!" });
      setMDelete(null);
      refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Item do plano ─────────────────────────────────────────────────────
  const [pOpen, setPOpen] = useState(false);
  const [pEditing, setPEditing] = useState<MaintenancePlan | null>(null);
  const [pForm, setPForm] = useState<PForm>(emptyP);
  const [pDelete, setPDelete] = useState<MaintenancePlan | null>(null);

  const openNewPlan = () => {
    const first = vehicleFilter !== NONE ? vehicleById.get(vehicleFilter) : activeVehicles.length === 1 ? activeVehicles[0] : undefined;
    setPEditing(null);
    setPForm({ ...emptyP(), vehicleId: first?.id ?? "", baselineOdometer: first?.currentOdometerKm != null ? String(first.currentOdometerKm) : "" });
    setPOpen(true);
  };
  const openEditPlan = (p: MaintenancePlan) => {
    setPEditing(p);
    setPForm({
      vehicleId: p.vehicleId, name: p.name, intervalKm: p.intervalKm != null ? String(p.intervalKm) : "", intervalMonths: p.intervalMonths != null ? String(p.intervalMonths) : "",
      baselineOdometer: p.baselineOdometerKm != null ? String(p.baselineOdometerKm) : "", baselineDate: p.baselineDate ?? "", notes: p.notes ?? "", isActive: p.isActive,
    });
    setPOpen(true);
  };

  const savePlan = async () => {
    const intervalKm = toInt(pForm.intervalKm);
    const intervalMonths = toInt(pForm.intervalMonths);
    const baselineKm = toInt(pForm.baselineOdometer);
    if (!pForm.vehicleId || !pForm.name.trim()) { toast({ variant: "destructive", title: "Informe o veículo e o nome do item" }); return; }
    if (intervalKm === undefined && intervalMonths === undefined) { toast({ variant: "destructive", title: "Informe o intervalo", description: "Preencha a cada quantos km e/ou a cada quantos meses." }); return; }
    if ((intervalKm !== undefined && !(intervalKm > 0)) || (intervalMonths !== undefined && !(intervalMonths > 0)) || (baselineKm !== undefined && !(baselineKm >= 0))) {
      toast({ variant: "destructive", title: "Valores inválidos", description: "Os intervalos devem ser maiores que zero." }); return;
    }
    if (!pEditing && !requireUnidade()) return;
    const payload = { vehicleId: pForm.vehicleId, name: pForm.name, intervalKm, intervalMonths, baselineOdometerKm: baselineKm, baselineDate: pForm.baselineDate || undefined, notes: pForm.notes, isActive: pForm.isActive };
    setSubmitting(true);
    try {
      if (pEditing) await vehicleMaintenanceService.updatePlan(pEditing.id, payload);
      else await vehicleMaintenanceService.createPlan(payload, activeUnidadeId);
      toast({ title: pEditing ? "Item atualizado!" : "Item do plano criado!" });
      setPOpen(false);
      refresh();
    } catch (e: any) {
      console.error("Error saving plan:", e);
      toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const deletePlan = async () => {
    if (!pDelete) return;
    setSubmitting(true);
    try {
      await vehicleMaintenanceService.removePlan(pDelete.id);
      toast({ title: "Item removido!", description: "Os serviços já registrados continuam no histórico." });
      setPDelete(null);
      refresh();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  const periodSelect = (
    <Select value={period} onValueChange={v => setPeriod(v as PeriodKey)}>
      <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
      <SelectContent>{PERIOD_OPTIONS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
    </Select>
  );
  const vehicleSelect = (
    <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
      <SelectTrigger className="w-[190px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Todos os veículos</SelectItem>
        {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  if (error) {
    return (
      <Card><CardContent className="p-6 text-sm text-destructive">
        Não foi possível carregar a manutenção. Confira se a migration 38_vehicle_maintenance.sql foi executada no Supabase.
      </CardContent></Card>
    );
  }

  const noVehicles = activeVehicles.length === 0;

  return (
    <div className="space-y-4">
      {(overdue > 0 || soon > 0) && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-3 text-sm", overdue > 0 ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {overdue > 0 && <strong>{overdue} manutenção(ões) preventiva(s) vencida(s)</strong>}
            {overdue > 0 && soon > 0 && " · "}
            {soon > 0 && <>{soon} chegando (menos de {kmFmt(1000)} km ou 30 dias)</>}
          </span>
        </div>
      )}

      <Tabs defaultValue="plan">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="plan">Plano preventivo{overdue + soon > 0 ? ` (${overdue + soon})` : ""}</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="costs">Custos</TabsTrigger>
          </TabsList>
          <Button onClick={() => openNew()} disabled={noVehicles}><PlusCircle className="mr-2 h-4 w-4" /> Registrar serviço</Button>
        </div>

        {/* ── Plano preventivo ── */}
        <TabsContent value="plan" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Plano de manutenção preventiva</CardTitle>
                <CardDescription>Cada item vence pelo km OU pelo prazo (o que vier primeiro). Ao registrar a execução, a próxima conta a partir dela.</CardDescription>
              </div>
              <Button variant="outline" onClick={openNewPlan} disabled={noVehicles}><Plus className="mr-2 h-4 w-4" /> Novo item do plano</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>A cada</TableHead>
                    <TableHead>Última vez</TableHead>
                    <TableHead>Próxima</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-[170px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">
                      {noVehicles ? "Cadastre um veículo para montar o plano." : "Nenhum item no plano. Crie itens como troca de óleo, pneus e revisão para receber os avisos."}
                    </TableCell></TableRow>
                  ) : alerts.map(({ plan: p, status: st }) => {
                    const badge = STATE_BADGE[st.state];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-bold uppercase">{plateOf(p.vehicleId)}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {[p.intervalKm ? `${kmFmt(p.intervalKm)} km` : "", p.intervalMonths ? `${p.intervalMonths} mês(es)` : ""].filter(Boolean).join(" ou ")}
                        </TableCell>
                        <TableCell className="text-sm">{st.lastDate ? dayLabel(st.lastDate) : "—"}{st.lastKm !== undefined ? ` · ${kmFmt(st.lastKm)} km` : ""}</TableCell>
                        <TableCell className="text-sm">{[st.nextKm !== undefined ? `${kmFmt(st.nextKm)} km` : "", st.nextDate ? dayLabel(st.nextDate) : ""].filter(Boolean).join(" · ") || "—"}</TableCell>
                        <TableCell>
                          <Badge className={badge.cls}>{badge.label}</Badge>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{st.label}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant={st.state === "vencida" || st.state === "breve" ? "default" : "outline"} className="gap-1" onClick={() => registerPlan(p)} title="Registrar que este item foi feito">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Feito
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditPlan(p)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => setPDelete(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {plans.some(p => !p.isActive) && <p className="mt-3 text-xs text-muted-foreground">{plans.filter(p => !p.isActive).length} item(ns) pausado(s) não aparecem aqui nem geram aviso.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Histórico ── */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Histórico de manutenções</CardTitle>
                  <CardDescription>Tudo que foi feito em cada veículo, com custo de peças e mão de obra.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {periodSelect}
                  {vehicleSelect}
                  <Select value={kindFilter} onValueChange={v => setKindFilter(v as "all" | MaintenanceKind)}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="preventiva">Preventivas</SelectItem>
                      <SelectItem value="corretiva">Corretivas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9 pr-8" placeholder="Buscar serviço, oficina, nota, placa…" value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar a busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                {history.length} serviço(s) · <span className="font-semibold text-foreground">{brl(historyTotals.total)}</span>
                {history.length > 0 && <> (peças {brl(historyTotals.parts)} · mão de obra {brl(historyTotals.labor)}) · preventivas {brl(historyTotals.preventiva.total)} · corretivas {brl(historyTotals.corretiva.total)}</>}
              </p>
              {isLoading ? <div className="p-4 text-center">Carregando...</div> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead className="text-right">Peças</TableHead>
                      <TableHead className="text-right">Mão de obra</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Oficina</TableHead>
                      <TableHead className="w-[100px] text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nenhum serviço neste filtro.</TableCell></TableRow>
                    ) : history.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{dayLabel(r.serviceDate)}</TableCell>
                        <TableCell className="font-mono uppercase">{plateOf(r.vehicleId)}</TableCell>
                        <TableCell>
                          <Badge className={r.kind === "corretiva" ? "bg-red-600/15 text-red-700 hover:bg-red-600/15 dark:text-red-400" : "bg-green-600/15 text-green-700 hover:bg-green-600/15 dark:text-green-400"}>{MAINTENANCE_KIND_LABEL[r.kind]}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="truncate font-medium" title={r.description}>{r.description}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{[r.category, r.planId ? `plano: ${planById.get(r.planId)?.name ?? "item removido"}` : "", r.invoiceNumber ? `nota ${r.invoiceNumber}` : ""].filter(Boolean).join(" · ")}</div>
                        </TableCell>
                        <TableCell className="text-right">{r.odometerKm != null ? kmFmt(r.odometerKm) : "—"}</TableCell>
                        <TableCell className="text-right">{brl(r.partsCost)}</TableCell>
                        <TableCell className="text-right">{brl(r.laborCost)}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(totalCost(r))}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{r.supplier || "—"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => setMDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Custos ── */}
        <TabsContent value="costs" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Custos de operação</CardTitle>
                <CardDescription>Manutenção + combustível. O custo por km usa só os registros de km fechados no período.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {periodSelect}
                <Button variant="outline" className="gap-1.5" onClick={exportSheet} title="Baixa os custos por veículo e os serviços do período"><FileSpreadsheet className="h-4 w-4" /> Exportar planilha</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  { label: "Custo total", value: brl(costs.totals.total), tone: "" },
                  { label: "Manutenção", value: brl(costs.totals.maintenance), tone: "" },
                  { label: "Preventiva", value: brl(costs.totals.preventive), tone: "text-green-700 dark:text-green-400" },
                  { label: "Corretiva", value: brl(costs.totals.corrective), tone: "text-red-700 dark:text-red-400" },
                  { label: "Combustível", value: brl(costs.totals.fuel), tone: "" },
                  { label: "Custo por km", value: costs.totals.costPerKm != null ? brl(costs.totals.costPerKm) : "—", tone: "" },
                ].map(c => (
                  <div key={c.label} className="rounded-lg border bg-background p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <p className={cn("mt-1 text-lg font-bold tabular-nums leading-none", c.tone)}>{c.value}</p>
                  </div>
                ))}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Combustível</TableHead>
                    <TableHead className="text-right">Preventiva</TableHead>
                    <TableHead className="text-right">Corretiva</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Km rodado</TableHead>
                    <TableHead className="text-right">R$/km</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum veículo cadastrado.</TableCell></TableRow>
                  ) : costs.rows.map(r => (
                    <TableRow key={r.vehicleId}>
                      <TableCell><span className="font-mono font-bold uppercase">{r.plate}</span>{r.model ? <span className="ml-2 text-xs text-muted-foreground">{r.model}</span> : null}</TableCell>
                      <TableCell className="text-right">{brl(r.fuel)}</TableCell>
                      <TableCell className="text-right">{brl(r.preventive)}</TableCell>
                      <TableCell className="text-right">{brl(r.corrective)}</TableCell>
                      <TableCell className="text-right font-semibold">{brl(r.total)}</TableCell>
                      <TableCell className="text-right">{r.km > 0 ? `${kmFmt(r.km)} km` : "—"}</TableCell>
                      <TableCell className="text-right">{r.costPerKm != null ? brl(r.costPerKm) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Manutenção por categoria ({periodLabel.toLowerCase()})</p>
                  {periodBreakdown.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum serviço no período.</p> : (
                    <div className="space-y-2">
                      {periodBreakdown.byCategory.map(c => (
                        <div key={c.category}>
                          <div className="flex justify-between text-sm"><span>{c.category} <span className="text-xs text-muted-foreground">({c.count})</span></span><span className="font-medium tabular-nums">{brl(c.total)}</span></div>
                          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(c.total / Math.max(1, periodBreakdown.byCategory[0].total)) * 100}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Últimos 6 meses</p>
                  <div className="space-y-2">
                    {months.map(m => (
                      <div key={m.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{m.label}</span>
                        <div className="flex h-4 w-full overflow-hidden rounded bg-muted" title={`Manutenção ${brl(m.maintenance)} · Combustível ${brl(m.fuel)}`}>
                          <div className="h-full bg-orange-500" style={{ width: `${(m.maintenance / maxMonth) * 100}%` }} />
                          <div className="h-full bg-sky-500" style={{ width: `${(m.fuel / maxMonth) * 100}%` }} />
                        </div>
                        <span className="text-right tabular-nums text-muted-foreground">{brl(m.maintenance + m.fuel)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-500" /> Manutenção</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-500" /> Combustível</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Registrar / editar serviço */}
      <Dialog open={mOpen} onOpenChange={setMOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{mEditing ? "Editar serviço" : "Registrar serviço"}</DialogTitle>
            <DialogDescription>Preventiva é a revisão planejada; corretiva é o conserto de um problema.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Veículo</Label>
                <Select value={mForm.vehicleId} onValueChange={id => setMForm(f => ({ ...f, vehicleId: id, planId: NONE, odometer: f.odometer || (vehicleById.get(id)?.currentOdometerKm != null ? String(vehicleById.get(id)!.currentOdometerKm) : "") }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{(mEditing ? vehicles : activeVehicles).map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={mForm.kind} onValueChange={k => setMForm(f => ({ ...f, kind: k as MaintenanceKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preventiva">Preventiva</SelectItem>
                    <SelectItem value="corretiva">Corretiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {mForm.kind === "preventiva" && plans.some(p => p.vehicleId === mForm.vehicleId) && (
              <div className="grid gap-2">
                <Label>Cumpre qual item do plano?</Label>
                <Select value={mForm.planId} onValueChange={id => setMForm(f => ({ ...f, planId: id }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum (avulsa)</SelectItem>
                    {plans.filter(p => p.vehicleId === mForm.vehicleId).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Ligar ao item reinicia a contagem do próximo vencimento a partir deste serviço.</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="m-desc">Serviço realizado</Label>
              <Input id="m-desc" value={mForm.description} onChange={e => setMForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Troca de óleo e filtro de ar" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="m-cat">Categoria</Label>
                <Input id="m-cat" list="m-cats" value={mForm.category} onChange={e => setMForm(f => ({ ...f, category: e.target.value }))} placeholder="Escolha ou digite" />
                <datalist id="m-cats">{MAINTENANCE_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-date">Data</Label>
                <Input id="m-date" type="date" value={mForm.serviceDate} onChange={e => setMForm(f => ({ ...f, serviceDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="m-odo">Km do veículo</Label>
                <Input id="m-odo" inputMode="numeric" value={mForm.odometer} onChange={e => setMForm(f => ({ ...f, odometer: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-parts">Peças (R$)</Label>
                <Input id="m-parts" inputMode="decimal" value={mForm.parts} onChange={e => setMForm(f => ({ ...f, parts: e.target.value }))} placeholder="0,00" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-labor">Mão de obra (R$)</Label>
                <Input id="m-labor" inputMode="decimal" value={mForm.labor} onChange={e => setMForm(f => ({ ...f, labor: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Total do serviço: <span className="font-semibold text-foreground">{brl(mParts + mLabor)}</span></p>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="m-sup">Oficina / fornecedor</Label>
                <Input id="m-sup" value={mForm.supplier} onChange={e => setMForm(f => ({ ...f, supplier: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="m-inv">Nota fiscal / OS da oficina</Label>
                <Input id="m-inv" value={mForm.invoice} onChange={e => setMForm(f => ({ ...f, invoice: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="m-notes">Observações</Label>
              <Input id="m-notes" value={mForm.notes} onChange={e => setMForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMOpen(false)}>Cancelar</Button>
            <Button onClick={saveRecord} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item do plano */}
      <Dialog open={pOpen} onOpenChange={setPOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{pEditing ? "Editar item do plano" : "Novo item do plano"}</DialogTitle>
            <DialogDescription>O sistema avisa quando faltar pouco (menos de {kmFmt(1000)} km ou 30 dias) e quando vencer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!pEditing && (
              <div className="flex flex-wrap gap-1.5">
                {PLAN_PRESETS.map(pr => (
                  <button key={pr.name} type="button" onClick={() => setPForm(f => ({ ...f, name: pr.name, intervalKm: pr.intervalKm ? String(pr.intervalKm) : "", intervalMonths: pr.intervalMonths ? String(pr.intervalMonths) : "" }))}
                    className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted" title="Preenche o nome e o intervalo (ajuste conforme o manual do veículo)">
                    {pr.name}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Veículo</Label>
                <Select value={pForm.vehicleId} onValueChange={id => setPForm(f => ({ ...f, vehicleId: id, baselineOdometer: f.baselineOdometer || (vehicleById.get(id)?.currentOdometerKm != null ? String(vehicleById.get(id)!.currentOdometerKm) : "") }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{(pEditing ? vehicles : activeVehicles).map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-name">Item</Label>
                <Input id="p-name" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Troca de óleo" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-km">A cada (km)</Label>
                <Input id="p-km" inputMode="numeric" value={pForm.intervalKm} onChange={e => setPForm(f => ({ ...f, intervalKm: e.target.value }))} placeholder="Ex: 10000" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-mo">e/ou a cada (meses)</Label>
                <Input id="p-mo" inputMode="numeric" value={pForm.intervalMonths} onChange={e => setPForm(f => ({ ...f, intervalMonths: e.target.value }))} placeholder="Ex: 6" />
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-sm font-medium">Última vez que foi feito</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="p-bkm">Km nessa data</Label>
                  <Input id="p-bkm" inputMode="numeric" value={pForm.baselineOdometer} onChange={e => setPForm(f => ({ ...f, baselineOdometer: e.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p-bdate">Data</Label>
                  <Input id="p-bdate" type="date" value={pForm.baselineDate} onChange={e => setPForm(f => ({ ...f, baselineDate: e.target.value }))} />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Ponto de partida do prazo. Depois de registrar o serviço, a contagem passa a partir dele.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-notes">Observações</Label>
              <Input id="p-notes" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={pForm.isActive} onChange={e => setPForm(f => ({ ...f, isActive: e.target.checked }))} />
              Item ativo (gera avisos)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPOpen(false)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!mDelete} onOpenChange={open => { if (!open) setMDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este serviço?</AlertDialogTitle>
            <AlertDialogDescription>{mDelete && `${plateOf(mDelete.vehicleId)} · ${mDelete.description} · ${brl(totalCost(mDelete))}. O custo sai dos relatórios e, se ele cumpria um item do plano, o prazo volta a contar do serviço anterior.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRecord} disabled={submitting}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pDelete} onOpenChange={open => { if (!open) setPDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item do plano?</AlertDialogTitle>
            <AlertDialogDescription>{pDelete && `${plateOf(pDelete.vehicleId)} · ${pDelete.name}. Os serviços já registrados continuam no histórico. Para só parar os avisos, desmarque "Item ativo" ao editar.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletePlan} disabled={submitting}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
