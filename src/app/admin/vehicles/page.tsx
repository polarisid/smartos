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
import { PlusCircle, Edit, Trash2, Car, Flag } from "lucide-react";
import { type Vehicle, type VehicleKmLog, type VehicleFuelType } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { vehicleService, DUPLICATE_PLATE_CODE } from "@/services/supabase/vehicleService";
import { driverService } from "@/services/supabase/driverService";
import { routeService } from "@/services/supabase/routeService";
import { useAuth } from "@/context/AuthContext";

const FUEL_LABELS: Record<VehicleFuelType, string> = {
  gasolina: "Gasolina", etanol: "Etanol", flex: "Flex", diesel: "Diesel", gnv: "GNV", eletrico: "Elétrico",
};
const NONE = "none";

const kmFmt = (n: number) => n.toLocaleString("pt-BR");
const toInt = (s: string) => (s.trim() === "" ? undefined : Math.round(Number(s.replace(",", "."))));
const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");

type VehicleForm = { plate: string; model: string; fuelType: string; avgKml: string; odometer: string; isActive: boolean; notes: string };
const emptyVehicleForm: VehicleForm = { plate: "", model: "", fuelType: NONE, avgKml: "", odometer: "", isActive: true, notes: "" };

type LogForm = { vehicleId: string; logDate: string; driverId: string; routeId: string; start: string; end: string; notes: string };
const emptyLogForm = (): LogForm => ({ vehicleId: "", logDate: format(new Date(), "yyyy-MM-dd"), driverId: NONE, routeId: NONE, start: "", end: "", notes: "" });

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
  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", ...keyBase], queryFn: () => driverService.getAll(activeUnidadeId), enabled, staleTime: 5 * 60 * 1000,
  });
  const { data: routes = [] } = useQuery({
    queryKey: ["routes-for-km", ...keyBase], queryFn: () => routeService.getAll(activeUnidadeId), enabled, staleTime: 5 * 60 * 1000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["vehicle-km-logs"] });
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
    if (!editingVehicle && !requireUnidade()) return;

    const payload = {
      plate,
      model: vehicleForm.model.trim(),
      fuelType: vehicleForm.fuelType === NONE ? undefined : (vehicleForm.fuelType as VehicleFuelType),
      avgKml,
      currentOdometerKm: odometer,
      isActive: vehicleForm.isActive,
      notes: vehicleForm.notes.trim(),
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

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Veículos e Km</h1>
        </div>

        <Tabs defaultValue="km">
          <TabsList>
            <TabsTrigger value="km">Km rodado</TabsTrigger>
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
                        <TableHead>Combustível</TableHead>
                        <TableHead className="text-right">Consumo (km/l)</TableHead>
                        <TableHead className="text-right">Hodômetro</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right w-[120px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicles.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum veículo cadastrado.</TableCell></TableRow>
                      ) : vehicles.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono font-bold uppercase"><Car className="mr-2 inline h-4 w-4 text-muted-foreground" />{v.plate}</TableCell>
                          <TableCell>{v.model || "—"}</TableCell>
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

      <AlertDialog open={!!vehicleToDelete} onOpenChange={open => { if (!open) setVehicleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              {vehicleToDelete?.plate} e todos os registros de km dele serão removidos. Para só tirar da lista de novos registros, desative o veículo em vez de excluir.
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
