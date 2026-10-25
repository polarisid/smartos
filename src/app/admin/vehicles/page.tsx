"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit, Trash2, Car, Flag, AlertTriangle, MapPin } from "lucide-react";
import { type Vehicle, type VehicleKmLog, type VehicleFuelLog, type VehicleFuelType, type VehicleOwnership } from "@/lib/data";
import { computeFuelStats, consumptionDeficit, rentalStatus, type FuelLogStats } from "@/lib/vehicleFuel";
import { useToast } from "@/hooks/use-toast";
import { vehicleService, DUPLICATE_PLATE_CODE } from "@/services/supabase/vehicleService";
import { driverService } from "@/services/supabase/driverService";
import { routeService } from "@/services/supabase/routeService";
import { useAuth } from "@/context/AuthContext";
import { mapsUrl } from "@/lib/geolocation";

const FUEL_LABELS: Record<VehicleFuelType, string> = {
  gasolina: "Gasolina", etanol: "Etanol", flex: "Flex", diesel: "Diesel", gnv: "GNV", eletrico: "Elétrico",
};
const NONE = "none";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Consumo 20% pior que o de referência já merece atenção (bico, pneu, vazamento, desvio de uso).
const CONSUMPTION_ALERT = 0.2;

const kmFmt = (n: number) => n.toLocaleString("pt-BR");
const toInt = (s: string) => (s.trim() === "" ? undefined : Math.round(Number(s.replace(",", "."))));
const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");

type VehicleForm = {
  plate: string; model: string; fuelType: string; avgKml: string; odometer: string; isActive: boolean; notes: string;
  ownership: VehicleOwnership; rentalCompany: string; rentalStartOdometer: string; rentalKmLimit: string; rentalEndDate: string;
};
const emptyVehicleForm: VehicleForm = {
  plate: "", model: "", fuelType: NONE, avgKml: "", odometer: "", isActive: true, notes: "",
  ownership: "propria", rentalCompany: "", rentalStartOdometer: "", rentalKmLimit: "", rentalEndDate: "",
};

type LogForm = { vehicleId: string; logDate: string; driverId: string; routeId: string; start: string; end: string; notes: string };
type FuelForm = {
  vehicleId: string; fuelDate: string; driverId: string; odometer: string; liters: string; totalValue: string;
  fuelType: string; fullTank: boolean; station: string; routeId: string; notes: string;
};
const emptyFuelForm = (): FuelForm => ({
  vehicleId: "", fuelDate: format(new Date(), "yyyy-MM-dd"), driverId: NONE, odometer: "", liters: "", totalValue: "",
  fuelType: NONE, fullTank: true, station: "", routeId: NONE, notes: "",
});
const toDec = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));

const emptyLogForm = (): LogForm => ({ vehicleId: "", logDate: format(new Date(), "yyyy-MM-dd"), driverId: NONE, routeId: NONE, start: "", end: "", notes: "" });

function RentalCell({ vehicle }: { vehicle: Vehicle }) {
  if (vehicle.ownership !== "locada") return <span>Própria</span>;
  const st = rentalStatus(vehicle);
  const kmAlert = st.usedRatio != null && st.usedRatio >= 0.9;
  const dateAlert = st.daysToReturn != null && st.daysToReturn <= 30;
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-sm">Locada{vehicle.rentalCompany ? ` · ${vehicle.rentalCompany}` : ""}</span>
      {st.usedKm != null && st.limitKm != null && (
        <span className={kmAlert ? "font-semibold text-amber-600" : "text-muted-foreground"}>
          {kmAlert && <AlertTriangle className="mr-1 inline h-3 w-3" />}
          Franquia: {kmFmt(st.usedKm)} de {kmFmt(st.limitKm)} km ({Math.round((st.usedRatio ?? 0) * 100)}%)
        </span>
      )}
      {st.daysToReturn != null && (
        <span className={dateAlert ? "font-semibold text-amber-600" : "text-muted-foreground"}>
          {dateAlert && <AlertTriangle className="mr-1 inline h-3 w-3" />}
          {st.daysToReturn < 0 ? `Devolução vencida há ${-st.daysToReturn} dia(s)` : st.daysToReturn === 0 ? "Devolução hoje" : `Devolução em ${st.daysToReturn} dia(s)`}
        </span>
      )}
    </div>
  );
}

export default function VehiclesPage() {
  const { toast } = useToast();
  const { activeUnidadeId, appUser } = useAuth();
  const isMaster = appUser?.role === "master";
  const queryClient = useQueryClient();
  // uid na chave: sem ele o cache seria compartilhado entre contas no mesmo aparelho (ver hooks/queries).
  const keyBase = [activeUnidadeId, appUser?.uid];
  const enabled = !!appUser?.uid;

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ["vehicles", ...keyBase], queryFn: () => vehicleService.getAll(activeUnidadeId), enabled,
  });
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["vehicle-km-logs", ...keyBase], queryFn: () => vehicleService.getKmLogs(activeUnidadeId), enabled,
  });
  const { data: fuelLogs = [], isLoading: loadingFuel } = useQuery({
    queryKey: ["vehicle-fuel-logs", ...keyBase], queryFn: () => vehicleService.getFuelLogs(activeUnidadeId), enabled,
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", ...keyBase], queryFn: () => driverService.getAll(activeUnidadeId), enabled, staleTime: 5 * 60 * 1000,
  });
  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-km", ...keyBase], queryFn: () => routeService.getAll(activeUnidadeId), enabled, staleTime: 5 * 60 * 1000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["vehicle-km-logs"] });
    queryClient.invalidateQueries({ queryKey: ["vehicle-fuel-logs"] });
  };

  const vehicleById = useMemo(() => new Map(vehicles.map(v => [v.id, v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map(d => [d.id, d.name])), [drivers]);
  const recentRoutes = useMemo(
    () => [...routes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 80),
    [routes]
  );
  const routeById = useMemo(() => new Map(routes.map(r => [r.id, r.name])), [routes]);

  const requireUnidade = () => {
    if (isMaster && !activeUnidadeId) {
      toast({ variant: "destructive", title: "Selecione uma unidade", description: "Escolha uma unidade no seletor no topo antes de cadastrar." });
      return false;
    }
    return true;
  };

  // ── Veículos ──────────────────────────────────────────────────────────
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleForm>(emptyVehicleForm);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openVehicleDialog = (v: Vehicle | null) => {
    setEditingVehicle(v);
    setVehicleForm(v ? {
      plate: v.plate, model: v.model ?? "", fuelType: v.fuelType ?? NONE,
      avgKml: v.avgKml != null ? String(v.avgKml) : "", odometer: v.currentOdometerKm != null ? String(v.currentOdometerKm) : "",
      isActive: v.isActive, notes: v.notes ?? "",
      ownership: v.ownership, rentalCompany: v.rentalCompany ?? "",
      rentalStartOdometer: v.rentalStartOdometerKm != null ? String(v.rentalStartOdometerKm) : "",
      rentalKmLimit: v.rentalKmLimit != null ? String(v.rentalKmLimit) : "", rentalEndDate: v.rentalEndDate ?? "",
    } : emptyVehicleForm);
    setVehicleDialogOpen(true);
  };

  const saveVehicle = async () => {
    const plate = vehicleForm.plate.trim().toUpperCase();
    if (!plate) {
      toast({ variant: "destructive", title: "Informe a placa" });
      return;
    }
    const avgKml = vehicleForm.avgKml.trim() === "" ? undefined : Number(vehicleForm.avgKml.replace(",", "."));
    const odometer = toInt(vehicleForm.odometer);
    if ((avgKml !== undefined && !(avgKml > 0)) || (odometer !== undefined && !(odometer >= 0))) {
      toast({ variant: "destructive", title: "Valores inválidos", description: "Consumo deve ser maior que zero e o hodômetro não pode ser negativo." });
      return;
    }
    const rented = vehicleForm.ownership === "locada";
    const rentalStart = toInt(vehicleForm.rentalStartOdometer);
    const rentalLimit = toInt(vehicleForm.rentalKmLimit);
    if (rented && ((rentalStart !== undefined && !(rentalStart >= 0)) || (rentalLimit !== undefined && !(rentalLimit > 0)))) {
      toast({ variant: "destructive", title: "Dados da locação inválidos", description: "A franquia deve ser maior que zero e o hodômetro da retirada não pode ser negativo." });
      return;
    }
    if (!editingVehicle && !requireUnidade()) return;

    const payload = {
      plate,
      model: vehicleForm.model.trim(),
      fuelType: vehicleForm.fuelType === NONE ? undefined : (vehicleForm.fuelType as VehicleFuelType),
      avgKml,
      currentOdometerKm: odometer,
      isActive: vehicleForm.isActive,
      notes: vehicleForm.notes.trim(),
      ownership: vehicleForm.ownership,
      // Dados do contrato só valem para veículo locado; ao voltar para "própria" eles são limpos.
      rentalCompany: rented ? vehicleForm.rentalCompany.trim() : "",
      rentalStartOdometerKm: rented ? rentalStart : undefined,
      rentalKmLimit: rented ? rentalLimit : undefined,
      rentalEndDate: rented ? vehicleForm.rentalEndDate : "",
    };
    setSubmitting(true);
    try {
      if (editingVehicle) await vehicleService.update(editingVehicle.id, payload);
      else await vehicleService.create(payload, activeUnidadeId);
      toast({ title: editingVehicle ? "Veículo atualizado!" : "Veículo cadastrado!" });
      setVehicleDialogOpen(false);
      refresh();
    } catch (error: any) {
      console.error("Error saving vehicle:", error);
      toast({
        variant: "destructive",
        title: error?.code === DUPLICATE_PLATE_CODE ? "Placa já cadastrada" : "Erro ao salvar",
        description: error?.code === DUPLICATE_PLATE_CODE ? "Já existe um veículo com esta placa nesta unidade." : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteVehicle = async () => {
    if (!vehicleToDelete) return;
    setSubmitting(true);
    try {
      await vehicleService.remove(vehicleToDelete.id);
      toast({ title: "Veículo excluído!", description: "Os registros de km dele também foram removidos." });
      setVehicleToDelete(null);
      refresh();
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Registros de km ───────────────────────────────────────────────────
  const [vehicleFilter, setVehicleFilter] = useState<string>(NONE);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logForm, setLogForm] = useState<LogForm>(emptyLogForm);
  const [logToClose, setLogToClose] = useState<VehicleKmLog | null>(null);
  const [closeValue, setCloseValue] = useState("");
  const [logToDelete, setLogToDelete] = useState<VehicleKmLog | null>(null);

  const filteredLogs = useMemo(
    () => (vehicleFilter === NONE ? logs : logs.filter(l => l.vehicleId === vehicleFilter)),
    [logs, vehicleFilter]
  );
  const totalKm = useMemo(
    () => filteredLogs.reduce((sum, l) => sum + (l.odometerEnd != null ? l.odometerEnd - l.odometerStart : 0), 0),
    [filteredLogs]
  );
  const activeVehicles = useMemo(() => vehicles.filter(v => v.isActive), [vehicles]);

  const openLogDialog = () => {
    const first = vehicleFilter !== NONE ? vehicleById.get(vehicleFilter) : activeVehicles.length === 1 ? activeVehicles[0] : undefined;
    setLogForm({ ...emptyLogForm(), vehicleId: first?.id ?? "", start: first?.currentOdometerKm != null ? String(first.currentOdometerKm) : "" });
    setLogDialogOpen(true);
  };

  const onLogVehicleChange = (vehicleId: string) => {
    const v = vehicleById.get(vehicleId);
    setLogForm(f => ({ ...f, vehicleId, start: v?.currentOdometerKm != null ? String(v.currentOdometerKm) : f.start }));
  };

  const logVehicle = vehicleById.get(logForm.vehicleId);
  const logStart = toInt(logForm.start);
  const startBelowCurrent = logVehicle?.currentOdometerKm != null && logStart !== undefined && logStart < logVehicle.currentOdometerKm;

  const saveLog = async () => {
    const end = toInt(logForm.end);
    if (!logForm.vehicleId || logStart === undefined || Number.isNaN(logStart) || logStart < 0) {
      toast({ variant: "destructive", title: "Informe o veículo e o hodômetro de saída" });
      return;
    }
    if (end !== undefined && (Number.isNaN(end) || end < logStart)) {
      toast({ variant: "destructive", title: "Hodômetro de chegada inválido", description: "A chegada não pode ser menor que a saída." });
      return;
    }
    if (!requireUnidade()) return;
    setSubmitting(true);
    try {
      await vehicleService.createKmLog({
        vehicleId: logForm.vehicleId,
        routeId: logForm.routeId === NONE ? undefined : logForm.routeId,
        driverId: logForm.driverId === NONE ? undefined : logForm.driverId,
        logDate: logForm.logDate,
        odometerStart: logStart,
        odometerEnd: end,
        notes: logForm.notes.trim(),
      }, activeUnidadeId);
      toast({ title: "Registro de km salvo!" });
      setLogDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Error saving km log:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSubmitting(false);
    }
  };

  const closeLog = async () => {
    if (!logToClose) return;
    const end = toInt(closeValue);
    if (end === undefined || Number.isNaN(end) || end < logToClose.odometerStart) {
      toast({ variant: "destructive", title: "Hodômetro de chegada inválido", description: `Deve ser ${kmFmt(logToClose.odometerStart)} km ou mais.` });
      return;
    }
    setSubmitting(true);
    try {
      await vehicleService.closeKmLog(logToClose.id, end);
      toast({ title: "Chegada registrada!" });
      setLogToClose(null);
      refresh();
    } catch (error) {
      console.error("Error closing km log:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteLog = async () => {
    if (!logToDelete) return;
    setSubmitting(true);
    try {
      await vehicleService.removeKmLog(logToDelete.id);
      toast({ title: "Registro excluído!" });
      setLogToDelete(null);
      refresh();
    } catch (error) {
      console.error("Error deleting km log:", error);
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Abastecimentos ────────────────────────────────────────────────────
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false);
  const [fuelForm, setFuelForm] = useState<FuelForm>(emptyFuelForm);
  const [fuelToDelete, setFuelToDelete] = useState<VehicleFuelLog | null>(null);
  const [fuelVehicleFilter, setFuelVehicleFilter] = useState<string>(NONE);

  // O consumo é calculado por veículo (cada um com a sua sequência de tanques cheios).
  const fuelStats = useMemo(() => {
    const byVehicle = new Map<string, VehicleFuelLog[]>();
    fuelLogs.forEach(l => byVehicle.set(l.vehicleId, [...(byVehicle.get(l.vehicleId) ?? []), l]));
    const all = new Map<string, FuelLogStats>();
    byVehicle.forEach(list => computeFuelStats(list).forEach((v, k) => all.set(k, v)));
    return all;
  }, [fuelLogs]);

  const filteredFuel = useMemo(
    () => (fuelVehicleFilter === NONE ? fuelLogs : fuelLogs.filter(l => l.vehicleId === fuelVehicleFilter)),
    [fuelLogs, fuelVehicleFilter]
  );
  const fuelTotals = useMemo(() => {
    const liters = filteredFuel.reduce((s, l) => s + l.liters, 0);
    const value = filteredFuel.reduce((s, l) => s + l.totalValue, 0);
    const stats = filteredFuel.map(l => fuelStats.get(l.id)).filter((x): x is FuelLogStats => !!x);
    const km = stats.reduce((s, x) => s + x.kmSincePrev, 0);
    const lit = stats.reduce((s, x) => s + x.litersSincePrev, 0);
    return { liters, value, avgKml: lit > 0 ? km / lit : null };
  }, [filteredFuel, fuelStats]);

  const openFuelDialog = () => {
    const first = fuelVehicleFilter !== NONE ? vehicleById.get(fuelVehicleFilter) : activeVehicles.length === 1 ? activeVehicles[0] : undefined;
    setFuelForm({
      ...emptyFuelForm(), vehicleId: first?.id ?? "",
      odometer: first?.currentOdometerKm != null ? String(first.currentOdometerKm) : "",
      fuelType: first?.fuelType && first.fuelType !== "flex" ? first.fuelType : NONE,
    });
    setFuelDialogOpen(true);
  };

  const onFuelVehicleChange = (vehicleId: string) => {
    const v = vehicleById.get(vehicleId);
    setFuelForm(f => ({
      ...f, vehicleId,
      odometer: v?.currentOdometerKm != null ? String(v.currentOdometerKm) : f.odometer,
      fuelType: v?.fuelType && v.fuelType !== "flex" ? v.fuelType : NONE,
    }));
  };

  const fuelVehicle = vehicleById.get(fuelForm.vehicleId);
  const fuelOdo = toInt(fuelForm.odometer);
  const fuelLiters = toDec(fuelForm.liters);
  const fuelValue = toDec(fuelForm.totalValue);
  const fuelPricePerLiter = fuelLiters && fuelValue && fuelLiters > 0 ? fuelValue / fuelLiters : null;
  // Hodômetro anterior ao último abastecimento deste veículo é quase sempre erro de digitação.
  const lastFuelOdo = useMemo(
    () => fuelLogs.filter(l => l.vehicleId === fuelForm.vehicleId).reduce((m, l) => Math.max(m, l.odometerKm), 0),
    [fuelLogs, fuelForm.vehicleId]
  );
  const fuelOdoBelowLast = fuelOdo !== undefined && !Number.isNaN(fuelOdo) && fuelOdo < lastFuelOdo;

  const saveFuel = async () => {
    if (!fuelForm.vehicleId || fuelOdo === undefined || Number.isNaN(fuelOdo) || fuelOdo < 0) {
      toast({ variant: "destructive", title: "Informe o veículo e o hodômetro" });
      return;
    }
    if (!fuelLiters || !(fuelLiters > 0) || !fuelValue || !(fuelValue > 0)) {
      toast({ variant: "destructive", title: "Informe litros e valor", description: "Os dois precisam ser maiores que zero." });
      return;
    }
    if (fuelOdoBelowLast) {
      toast({ variant: "destructive", title: "Hodômetro menor que o do último abastecimento", description: `O último foi com ${kmFmt(lastFuelOdo)} km.` });
      return;
    }
    if (!requireUnidade()) return;
    setSubmitting(true);
    try {
      await vehicleService.createFuelLog({
        vehicleId: fuelForm.vehicleId,
        driverId: fuelForm.driverId === NONE ? undefined : fuelForm.driverId,
        fuelDate: fuelForm.fuelDate,
        odometerKm: fuelOdo,
        liters: fuelLiters,
        totalValue: fuelValue,
        fuelType: fuelForm.fuelType === NONE ? undefined : (fuelForm.fuelType as VehicleFuelType),
        fullTank: fuelForm.fullTank,
        station: fuelForm.station.trim(),
        routeId: fuelForm.routeId === NONE ? undefined : fuelForm.routeId,
        notes: fuelForm.notes.trim(),
      }, activeUnidadeId);
      toast({ title: "Abastecimento salvo!" });
      setFuelDialogOpen(false);
      refresh();
    } catch (error) {
      console.error("Error saving fuel log:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteFuel = async () => {
    if (!fuelToDelete) return;
    setSubmitting(true);
    try {
      await vehicleService.removeFuelLog(fuelToDelete.id);
      toast({ title: "Abastecimento excluído!" });
      setFuelToDelete(null);
      refresh();
    } catch (error) {
      console.error("Error deleting fuel log:", error);
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Veículos e Km</h1>
        </div>

        <Tabs defaultValue="km">
          <TabsList>
            <TabsTrigger value="km">Km rodado</TabsTrigger>
            <TabsTrigger value="fuel">Abastecimentos</TabsTrigger>
            <TabsTrigger value="vehicles">Veículos</TabsTrigger>
          </TabsList>

          <TabsContent value="km" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Registros de km</CardTitle>
                  <CardDescription>Hodômetro de saída e de chegada de cada uso do veículo.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Todos os veículos</SelectItem>
                      {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={openLogDialog} disabled={activeVehicles.length === 0}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Novo registro
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingLogs || loadingVehicles ? (
                  <div className="text-center p-4">Carregando registros...</div>
                ) : activeVehicles.length === 0 ? (
                  <div className="text-center p-4 text-muted-foreground">Cadastre um veículo na aba &quot;Veículos&quot; para começar a registrar km.</div>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {filteredLogs.length} registro(s) · <span className="font-semibold text-foreground">{kmFmt(totalKm)} km</span> rodados (só registros fechados)
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Veículo</TableHead>
                          <TableHead>Motorista</TableHead>
                          <TableHead>Rota</TableHead>
                          <TableHead className="text-right">Saída</TableHead>
                          <TableHead className="text-right">Chegada</TableHead>
                          <TableHead className="text-right">Km rodado</TableHead>
                          <TableHead className="text-right w-[140px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLogs.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                        ) : filteredLogs.map(l => (
                          <TableRow key={l.id}>
                            <TableCell>{dayLabel(l.logDate)}</TableCell>
                            <TableCell className="font-mono uppercase">{vehicleById.get(l.vehicleId)?.plate ?? "—"}</TableCell>
                            <TableCell>{l.driverId ? driverById.get(l.driverId) ?? "—" : "—"}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{l.routeId ? routeById.get(l.routeId) ?? "—" : "—"}</TableCell>
                            <TableCell className="text-right">{kmFmt(l.odometerStart)}</TableCell>
                            <TableCell className="text-right">{l.odometerEnd != null ? kmFmt(l.odometerEnd) : <Badge variant="secondary">Em uso</Badge>}</TableCell>
                            <TableCell className="text-right font-semibold">{l.odometerEnd != null ? `${kmFmt(l.odometerEnd - l.odometerStart)} km` : "—"}</TableCell>
                            <TableCell className="text-right">
                              {l.odometerEnd == null && (
                                <Button variant="ghost" size="icon" title="Registrar chegada" onClick={() => { setLogToClose(l); setCloseValue(""); }}>
                                  <Flag className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" title="Excluir" onClick={() => setLogToDelete(l)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fuel" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Abastecimentos</CardTitle>
                  <CardDescription>Pagos no cartão corporativo. O consumo (km/l) é calculado entre dois tanques cheios.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={fuelVehicleFilter} onValueChange={setFuelVehicleFilter}>
                    <SelectTrigger className="w-[200px]"><SelectValue placeholder="Veículo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Todos os veículos</SelectItem>
                      {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button onClick={openFuelDialog} disabled={activeVehicles.length === 0}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Novo abastecimento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingFuel || loadingVehicles ? (
                  <div className="text-center p-4">Carregando abastecimentos...</div>
                ) : activeVehicles.length === 0 ? (
                  <div className="text-center p-4 text-muted-foreground">Cadastre um veículo na aba &quot;Veículos&quot; para começar a registrar abastecimentos.</div>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {filteredFuel.length} abastecimento(s) · <span className="font-semibold text-foreground">{num1(fuelTotals.liters)} L</span> ·{" "}
                      <span className="font-semibold text-foreground">{brl(fuelTotals.value)}</span>
                      {fuelTotals.avgKml != null && <> · consumo médio <span className="font-semibold text-foreground">{num1(fuelTotals.avgKml)} km/l</span></>}
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Veículo</TableHead>
                          <TableHead>Motorista</TableHead>
                          <TableHead className="text-right">Hodômetro</TableHead>
                          <TableHead className="text-right">Litros</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">R$/L</TableHead>
                          <TableHead className="text-right">Consumo</TableHead>
                          <TableHead>Rota</TableHead>
                          <TableHead>Local</TableHead>
                          <TableHead className="text-right w-[70px]">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredFuel.length === 0 ? (
                          <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">Nenhum abastecimento.</TableCell></TableRow>
                        ) : filteredFuel.map(l => {
                          const st = fuelStats.get(l.id);
                          const deficit = st ? consumptionDeficit(st.kml, vehicleById.get(l.vehicleId)?.avgKml) : null;
                          const alert = deficit != null && deficit >= CONSUMPTION_ALERT;
                          return (
                            <TableRow key={l.id}>
                              <TableCell>{dayLabel(l.fuelDate)}</TableCell>
                              <TableCell className="font-mono uppercase">{vehicleById.get(l.vehicleId)?.plate ?? "—"}</TableCell>
                              <TableCell>{l.driverId ? driverById.get(l.driverId) ?? "—" : "—"}</TableCell>
                              <TableCell className="text-right">{kmFmt(l.odometerKm)}</TableCell>
                              <TableCell className="text-right">
                                {num1(l.liters)}
                                {!l.fullTank && <Badge variant="secondary" className="ml-1">parcial</Badge>}
                              </TableCell>
                              <TableCell className="text-right">{brl(l.totalValue)}</TableCell>
                              <TableCell className="text-right">{brl(l.totalValue / l.liters)}</TableCell>
                              <TableCell className="text-right">
                                {st ? (
                                  <span className={alert ? "font-semibold text-amber-600" : ""} title={`${kmFmt(st.kmSincePrev)} km com ${num1(st.litersSincePrev)} L · ${brl(st.costPerKm)}/km`}>
                                    {alert && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}{num1(st.kml)} km/l
                                  </span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="max-w-[160px] truncate">{l.routeId ? routeById.get(l.routeId) ?? "—" : "—"}</TableCell>
                              <TableCell>
                                {l.latitude != null && l.longitude != null ? (
                                  <a
                                    href={mapsUrl(l.latitude, l.longitude)} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                                    title={l.locationAccuracyM != null ? `Precisão do GPS: ${Math.round(l.locationAccuracyM)} m` : undefined}
                                  >
                                    <MapPin className="h-3.5 w-3.5" /> Ver no mapa
                                  </a>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" title="Excluir" onClick={() => setFuelToDelete(l)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vehicles" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>Veículos</CardTitle>
                  <CardDescription>Cadastro dos veículos da unidade.</CardDescription>
                </div>
                <Button onClick={() => openVehicleDialog(null)}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Veículo
                </Button>
              </CardHeader>
              <CardContent>
                {loadingVehicles ? (
                  <div className="text-center p-4">Carregando veículos...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Placa</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Propriedade</TableHead>
                        <TableHead>Combustível</TableHead>
                        <TableHead className="text-right">Consumo (km/l)</TableHead>
                        <TableHead className="text-right">Hodômetro</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right w-[120px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicles.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum veículo cadastrado.</TableCell></TableRow>
                      ) : vehicles.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono font-bold uppercase"><Car className="mr-2 inline h-4 w-4 text-muted-foreground" />{v.plate}</TableCell>
                          <TableCell>{v.model || "—"}</TableCell>
                          <TableCell><RentalCell vehicle={v} /></TableCell>
                          <TableCell>{v.fuelType ? FUEL_LABELS[v.fuelType] : "—"}</TableCell>
                          <TableCell className="text-right">{v.avgKml != null ? v.avgKml.toLocaleString("pt-BR") : "—"}</TableCell>
                          <TableCell className="text-right">{v.currentOdometerKm != null ? `${kmFmt(v.currentOdometerKm)} km` : "—"}</TableCell>
                          <TableCell>{v.isActive ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" title="Editar" onClick={() => openVehicleDialog(v)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Excluir" onClick={() => setVehicleToDelete(v)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Cadastro / edição de veículo */}
      <Dialog open={vehicleDialogOpen} onOpenChange={setVehicleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVehicle ? "Editar veículo" : "Cadastrar veículo"}</DialogTitle>
            <DialogDescription>Placa e hodômetro atual são a base do controle de km.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="v-plate">Placa</Label>
                <Input id="v-plate" value={vehicleForm.plate} onChange={e => setVehicleForm(f => ({ ...f, plate: e.target.value }))} placeholder="Ex: TEM8E13" className="uppercase font-mono font-bold" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-model">Modelo</Label>
                <Input id="v-model" value={vehicleForm.model} onChange={e => setVehicleForm(f => ({ ...f, model: e.target.value }))} placeholder="Ex: Fiat Strada" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Combustível</Label>
                <Select value={vehicleForm.fuelType} onValueChange={v => setVehicleForm(f => ({ ...f, fuelType: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {(Object.keys(FUEL_LABELS) as VehicleFuelType[]).map(k => <SelectItem key={k} value={k}>{FUEL_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-kml">Consumo (km/l)</Label>
                <Input id="v-kml" inputMode="decimal" value={vehicleForm.avgKml} onChange={e => setVehicleForm(f => ({ ...f, avgKml: e.target.value }))} placeholder="10" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="v-odo">Hodômetro (km)</Label>
                <Input id="v-odo" inputMode="numeric" value={vehicleForm.odometer} onChange={e => setVehicleForm(f => ({ ...f, odometer: e.target.value }))} placeholder="45000" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="v-notes">Observações</Label>
              <Input id="v-notes" value={vehicleForm.notes} onChange={e => setVehicleForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Propriedade</Label>
              <Select value={vehicleForm.ownership} onValueChange={v => setVehicleForm(f => ({ ...f, ownership: v as VehicleOwnership }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="propria">Própria da loja</SelectItem>
                  <SelectItem value="locada">Locada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {vehicleForm.ownership === "locada" && (
              <div className="grid gap-4 rounded-md border p-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="v-rcomp">Locadora</Label>
                    <Input id="v-rcomp" value={vehicleForm.rentalCompany} onChange={e => setVehicleForm(f => ({ ...f, rentalCompany: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="v-rend">Devolução</Label>
                    <Input id="v-rend" type="date" value={vehicleForm.rentalEndDate} onChange={e => setVehicleForm(f => ({ ...f, rentalEndDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="v-rstart">Hodômetro na retirada (km)</Label>
                    <Input id="v-rstart" inputMode="numeric" value={vehicleForm.rentalStartOdometer} onChange={e => setVehicleForm(f => ({ ...f, rentalStartOdometer: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="v-rlimit">Franquia do contrato (km)</Label>
                    <Input id="v-rlimit" inputMode="numeric" value={vehicleForm.rentalKmLimit} onChange={e => setVehicleForm(f => ({ ...f, rentalKmLimit: e.target.value }))} placeholder="Ex: 36000" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">O sistema avisa quando a franquia passar de 90% e 30 dias antes da devolução.</p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vehicleForm.isActive} onChange={e => setVehicleForm(f => ({ ...f, isActive: e.target.checked }))} />
              Veículo ativo (aparece para novos registros de km)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVehicleDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveVehicle} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo registro de km */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo registro de km</DialogTitle>
            <DialogDescription>Informe a chegada agora ou deixe em branco e registre quando o veículo voltar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Veículo</Label>
                <Select value={logForm.vehicleId} onValueChange={onLogVehicleChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="l-date">Data</Label>
                <Input id="l-date" type="date" value={logForm.logDate} onChange={e => setLogForm(f => ({ ...f, logDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Motorista</Label>
                <Select value={logForm.driverId} onValueChange={v => setLogForm(f => ({ ...f, driverId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Rota (opcional)</Label>
                <Select value={logForm.routeId} onValueChange={v => setLogForm(f => ({ ...f, routeId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem rota</SelectItem>
                    {recentRoutes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="l-start">Hodômetro de saída (km)</Label>
                <Input id="l-start" inputMode="numeric" value={logForm.start} onChange={e => setLogForm(f => ({ ...f, start: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="l-end">Hodômetro de chegada (km)</Label>
                <Input id="l-end" inputMode="numeric" value={logForm.end} onChange={e => setLogForm(f => ({ ...f, end: e.target.value }))} placeholder="Em branco = em uso" />
              </div>
            </div>
            {startBelowCurrent && logVehicle?.currentOdometerKm != null && (
              <p className="text-sm text-amber-600">
                A saída ({kmFmt(logStart!)} km) é menor que o hodômetro atual do veículo ({kmFmt(logVehicle.currentOdometerKm)} km). Confira o valor.
              </p>
            )}
            {logForm.end.trim() !== "" && logStart !== undefined && toInt(logForm.end)! >= logStart && (
              <p className="text-sm text-muted-foreground">Km rodado: <span className="font-semibold text-foreground">{kmFmt(toInt(logForm.end)! - logStart)} km</span></p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="l-notes">Observações</Label>
              <Input id="l-notes" value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveLog} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar chegada */}
      <Dialog open={!!logToClose} onOpenChange={open => { if (!open) setLogToClose(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar chegada</DialogTitle>
            <DialogDescription>
              {logToClose && `${vehicleById.get(logToClose.vehicleId)?.plate ?? ""} saiu com ${kmFmt(logToClose.odometerStart)} km.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="c-end">Hodômetro de chegada (km)</Label>
            <Input id="c-end" inputMode="numeric" value={closeValue} onChange={e => setCloseValue(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogToClose(null)}>Cancelar</Button>
            <Button onClick={closeLog} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo abastecimento */}
      <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo abastecimento</DialogTitle>
            <DialogDescription>Pago no cartão corporativo. Marque &quot;tanque cheio&quot; para o consumo ser calculado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Veículo</Label>
                <Select value={fuelForm.vehicleId} onValueChange={onFuelVehicleChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-date">Data</Label>
                <Input id="f-date" type="date" value={fuelForm.fuelDate} onChange={e => setFuelForm(f => ({ ...f, fuelDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="f-odo">Hodômetro (km)</Label>
                <Input id="f-odo" inputMode="numeric" value={fuelForm.odometer} onChange={e => setFuelForm(f => ({ ...f, odometer: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-liters">Litros</Label>
                <Input id="f-liters" inputMode="decimal" value={fuelForm.liters} onChange={e => setFuelForm(f => ({ ...f, liters: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="f-value">Valor total (R$)</Label>
                <Input id="f-value" inputMode="decimal" value={fuelForm.totalValue} onChange={e => setFuelForm(f => ({ ...f, totalValue: e.target.value }))} />
              </div>
            </div>
            {fuelOdoBelowLast && (
              <p className="text-sm text-destructive">O hodômetro ({kmFmt(fuelOdo!)} km) é menor que o do último abastecimento ({kmFmt(lastFuelOdo)} km).</p>
            )}
            {fuelPricePerLiter != null && (
              <p className="text-sm text-muted-foreground">Preço por litro: <span className="font-semibold text-foreground">{brl(fuelPricePerLiter)}</span></p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Combustível</Label>
                <Select value={fuelForm.fuelType} onValueChange={v => setFuelForm(f => ({ ...f, fuelType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {(Object.keys(FUEL_LABELS) as VehicleFuelType[]).filter(k => k !== "flex").map(k => <SelectItem key={k} value={k}>{FUEL_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Motorista</Label>
                <Select value={fuelForm.driverId} onValueChange={v => setFuelForm(f => ({ ...f, driverId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informado</SelectItem>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="f-station">Posto</Label>
                <Input id="f-station" value={fuelForm.station} onChange={e => setFuelForm(f => ({ ...f, station: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Rota (opcional)</Label>
                <Select value={fuelForm.routeId} onValueChange={v => setFuelForm(f => ({ ...f, routeId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem rota</SelectItem>
                    {recentRoutes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fuelForm.fullTank} onChange={e => setFuelForm(f => ({ ...f, fullTank: e.target.checked }))} />
              Tanque cheio
            </label>
            {fuelVehicle?.fuelType === "flex" && (
              <p className="text-xs text-muted-foreground">Veículo flex: escolha o combustível abastecido para o histórico.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFuelDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveFuel} disabled={submitting}>{submitting ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!fuelToDelete} onOpenChange={open => { if (!open) setFuelToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir abastecimento?</AlertDialogTitle>
            <AlertDialogDescription>O consumo dos abastecimentos vizinhos será recalculado sem este registro.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteFuel} disabled={submitting}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!vehicleToDelete} onOpenChange={open => { if (!open) setVehicleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              {vehicleToDelete?.plate} e todos os registros de km e abastecimentos dele serão removidos. Para só tirar da lista de novos registros, desative o veículo em vez de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteVehicle} disabled={submitting}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!logToDelete} onOpenChange={open => { if (!open) setLogToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de km?</AlertDialogTitle>
            <AlertDialogDescription>O registro será removido. O hodômetro atual do veículo não volta ao valor anterior.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteLog} disabled={submitting}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
