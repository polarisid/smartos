"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Car, CloudUpload, Flag, Fuel, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { vehicleService } from "@/services/supabase/vehicleService";
import {
  flushVehicleQueue, pendingKmCloses, pendingKmLogs, saveFuel, saveKmClose, saveKmOpen, subscribeVehicleQueue,
} from "@/lib/offlineVehicleQueue";
import { rentalStatus } from "@/lib/vehicleFuel";
import type { VehicleKmLog } from "@/lib/data";

const LAST_VEHICLE_KEY = "smartos_last_vehicle_v1";
const LAST_CARD_KEY = "smartos_last_card_v1";

const kmFmt = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toInt = (s: string) => (s.trim() === "" ? undefined : Math.round(Number(s.replace(",", "."))));
const toDec = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00`), "dd/MM");

function readStored(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function storeValue(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento: só não lembra da próxima vez */ }
}

export default function VehiclePage() {
  const { toast } = useToast();
  const { activeUnidadeId, appUser } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!appUser?.uid;
  const keyBase = [activeUnidadeId, appUser?.uid];

  const [vehicleId, setVehicleId] = useState("");
  const [queueTick, setQueueTick] = useState(0); // recalcula o que está guardado no aparelho
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeVehicleQueue(() => setQueueTick(t => t + 1)), []);

  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ["vehicles", ...keyBase], queryFn: () => vehicleService.getAll(activeUnidadeId), enabled,
  });
  const activeVehicles = useMemo(() => vehicles.filter(v => v.isActive), [vehicles]);

  // Lembra do último veículo usado; se só há um, já vem selecionado.
  useEffect(() => {
    if (vehicleId || activeVehicles.length === 0) return;
    const last = readStored(LAST_VEHICLE_KEY);
    const pick = activeVehicles.find(v => v.id === last) ?? (activeVehicles.length === 1 ? activeVehicles[0] : undefined);
    if (pick) setVehicleId(pick.id);
  }, [activeVehicles, vehicleId]);

  const vehicle = activeVehicles.find(v => v.id === vehicleId);

  const { data: serverLogs = [] } = useQuery({
    queryKey: ["vehicle-km-logs", ...keyBase, vehicleId],
    queryFn: () => vehicleService.getKmLogs(activeUnidadeId, { vehicleId, limit: 10 }),
    enabled: enabled && !!vehicleId,
  });

  // Junta o que já está no servidor com o que ainda só existe neste aparelho (sem internet).
  const logs: VehicleKmLog[] = useMemo(() => {
    void queueTick;
    const closes = pendingKmCloses();
    const ids = new Set<string>();
    const out: VehicleKmLog[] = [];
    for (const l of [...pendingKmLogs().filter(p => p.vehicleId === vehicleId).reverse(), ...serverLogs]) {
      if (ids.has(l.id)) continue;
      ids.add(l.id);
      out.push(closes.has(l.id) ? { ...l, odometerEnd: closes.get(l.id) } : l);
    }
    return out;
  }, [serverLogs, vehicleId, queueTick]);
  const openLog = logs.find(l => l.odometerEnd == null);

  const [startOdo, setStartOdo] = useState("");
  const [endOdo, setEndOdo] = useState("");
  const [kmNotes, setKmNotes] = useState("");
  const [fuelOdo, setFuelOdo] = useState("");
  const [liters, setLiters] = useState("");
  const [value, setValue] = useState("");
  const [fullTank, setFullTank] = useState(true);
  const [station, setStation] = useState("");
  const [card, setCard] = useState("");

  useEffect(() => { setCard(readStored(LAST_CARD_KEY)); }, []);

  // Ao trocar de veículo, a saída e o abastecimento já vêm com o hodômetro conhecido dele.
  useEffect(() => {
    const odo = vehicle?.currentOdometerKm;
    setStartOdo(odo != null ? String(odo) : "");
    setFuelOdo(odo != null ? String(odo) : "");
    setEndOdo("");
    if (vehicleId) storeValue(LAST_VEHICLE_KEY, vehicleId);
  }, [vehicleId, vehicle?.currentOdometerKm]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    queryClient.invalidateQueries({ queryKey: ["vehicle-km-logs"] });
  };

  const afterSave = (queued: boolean, okTitle: string) => {
    if (queued) {
      toast({ title: "Guardado no aparelho", description: "Sem conexão agora: será enviado sozinho quando houver internet." });
      void flushVehicleQueue();
    } else {
      toast({ title: okTitle });
      refresh();
    }
  };

  const start = toInt(startOdo);
  const end = toInt(endOdo);
  const belowCurrent = (n: number | undefined) =>
    vehicle?.currentOdometerKm != null && n !== undefined && !Number.isNaN(n) && n < vehicle.currentOdometerKm;

  const registerStart = async () => {
    if (!vehicle) return;
    if (start === undefined || Number.isNaN(start) || start < 0) {
      toast({ variant: "destructive", title: "Informe o hodômetro de saída" });
      return;
    }
    setSaving(true);
    try {
      const r = await saveKmOpen({
        vehicleId: vehicle.id, logDate: format(new Date(), "yyyy-MM-dd"), odometerStart: start,
        notes: kmNotes.trim() || undefined, createdByName: appUser?.name,
      }, activeUnidadeId);
      setKmNotes("");
      afterSave(r.queued, "Saída registrada!");
    } catch (error) {
      console.error("Error saving km start:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const registerEnd = async () => {
    if (!openLog) return;
    if (end === undefined || Number.isNaN(end) || end < openLog.odometerStart) {
      toast({ variant: "destructive", title: "Hodômetro de chegada inválido", description: `Deve ser ${kmFmt(openLog.odometerStart)} km ou mais.` });
      return;
    }
    setSaving(true);
    try {
      const r = await saveKmClose(openLog.id, end);
      setEndOdo("");
      afterSave(r.queued, `Chegada registrada: ${kmFmt(end - openLog.odometerStart)} km rodados`);
    } catch (error) {
      console.error("Error saving km end:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const fOdo = toInt(fuelOdo);
  const fLiters = toDec(liters);
  const fValue = toDec(value);

  const registerFuel = async () => {
    if (!vehicle) return;
    if (fOdo === undefined || Number.isNaN(fOdo) || fOdo < 0) {
      toast({ variant: "destructive", title: "Informe o hodômetro" });
      return;
    }
    if (!fLiters || !(fLiters > 0) || !fValue || !(fValue > 0)) {
      toast({ variant: "destructive", title: "Informe litros e valor", description: "Os dois precisam ser maiores que zero." });
      return;
    }
    const c = card.trim();
    if (c && !/^\d{4}$/.test(c)) {
      toast({ variant: "destructive", title: "Final do cartão inválido", description: "Informe os 4 últimos dígitos." });
      return;
    }
    setSaving(true);
    try {
      const r = await saveFuel({
        vehicleId: vehicle.id, fuelDate: format(new Date(), "yyyy-MM-dd"), odometerKm: fOdo, liters: fLiters,
        totalValue: fValue, fuelType: vehicle.fuelType && vehicle.fuelType !== "flex" ? vehicle.fuelType : undefined,
        fullTank, station: station.trim() || undefined, cardLast4: c || undefined, createdByName: appUser?.name,
      }, activeUnidadeId);
      if (c) storeValue(LAST_CARD_KEY, c);
      setLiters(""); setValue(""); setStation("");
      afterSave(r.queued, "Abastecimento registrado!");
    } catch (error) {
      console.error("Error saving fuel:", error);
      toast({ variant: "destructive", title: "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  };

  const rental = vehicle?.ownership === "locada" ? rentalStatus(vehicle) : null;
  const kmAlert = rental?.usedRatio != null && rental.usedRatio >= 0.9;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Car className="h-6 w-6" /> Veículo</h1>
        <p className="text-sm text-muted-foreground">Registre a saída, a chegada e os abastecimentos. Funciona sem internet.</p>
      </div>

      <div className="grid gap-2">
        <Label>Veículo</Label>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="h-12 text-base"><SelectValue placeholder={loadingVehicles ? "Carregando..." : "Selecione o veículo"} /></SelectTrigger>
          <SelectContent>
            {activeVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}{v.model ? ` · ${v.model}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {!loadingVehicles && activeVehicles.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum veículo disponível. Peça para o administrador cadastrar em &quot;Veículos e Km&quot;.</p>
        )}
      </div>

      {vehicle && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-mono text-lg font-bold uppercase">{vehicle.plate}</p>
                <p className="text-sm text-muted-foreground">{vehicle.model || "—"}</p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-sm text-muted-foreground"><Gauge className="h-4 w-4" /> Hodômetro</p>
                <p className="text-lg font-semibold">{vehicle.currentOdometerKm != null ? `${kmFmt(vehicle.currentOdometerKm)} km` : "—"}</p>
              </div>
              {rental && (rental.usedKm != null || rental.daysToReturn != null) && (
                <div className={`w-full text-xs ${kmAlert || (rental.daysToReturn != null && rental.daysToReturn <= 30) ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>
                  {(kmAlert || (rental.daysToReturn != null && rental.daysToReturn <= 30)) && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                  Locado{vehicle.rentalCompany ? ` · ${vehicle.rentalCompany}` : ""}
                  {rental.usedKm != null && rental.limitKm != null && ` · franquia ${kmFmt(rental.usedKm)} de ${kmFmt(rental.limitKm)} km`}
                  {rental.daysToReturn != null && ` · devolução em ${rental.daysToReturn} dia(s)`}
                </div>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="km">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="km"><Flag className="mr-2 h-4 w-4" /> Saída / chegada</TabsTrigger>
              <TabsTrigger value="fuel"><Fuel className="mr-2 h-4 w-4" /> Abastecer</TabsTrigger>
            </TabsList>

            <TabsContent value="km" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {openLog ? "Veículo em uso" : "Registrar saída"}
                    {openLog && <Badge variant="secondary">em uso</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {openLog
                      ? `Saiu em ${dayLabel(openLog.logDate)} com ${kmFmt(openLog.odometerStart)} km${openLog.createdByName ? ` (${openLog.createdByName})` : ""}.`
                      : "Informe o hodômetro antes de sair."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {openLog ? (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="end">Hodômetro de chegada (km)</Label>
                        <Input id="end" inputMode="numeric" className="h-12 text-lg" value={endOdo} onChange={e => setEndOdo(e.target.value)} />
                        {end !== undefined && !Number.isNaN(end) && end >= openLog.odometerStart && (
                          <p className="text-sm text-muted-foreground">Km rodado: <span className="font-semibold text-foreground">{kmFmt(end - openLog.odometerStart)} km</span></p>
                        )}
                      </div>
                      <Button className="h-12 text-base" onClick={registerEnd} disabled={saving}>{saving ? "Salvando..." : "Registrar chegada"}</Button>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="start">Hodômetro de saída (km)</Label>
                        <Input id="start" inputMode="numeric" className="h-12 text-lg" value={startOdo} onChange={e => setStartOdo(e.target.value)} />
                        {belowCurrent(start) && (
                          <p className="text-sm text-amber-600">Menor que o hodômetro atual ({kmFmt(vehicle.currentOdometerKm!)} km). Confira o valor.</p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="kmnotes">Observações (opcional)</Label>
                        <Input id="kmnotes" className="h-12" value={kmNotes} onChange={e => setKmNotes(e.target.value)} />
                      </div>
                      <Button className="h-12 text-base" onClick={registerStart} disabled={saving}>{saving ? "Salvando..." : "Registrar saída"}</Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {logs.filter(l => l.odometerEnd != null).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Últimos usos</p>
                  {logs.filter(l => l.odometerEnd != null).slice(0, 4).map(l => (
                    <div key={l.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>{dayLabel(l.logDate)}{l.createdByName ? ` · ${l.createdByName}` : ""}</span>
                      <span className="font-semibold">{kmFmt(l.odometerEnd! - l.odometerStart)} km</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="fuel" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Registrar abastecimento</CardTitle>
                  <CardDescription>Pago no cartão corporativo. Marque &quot;tanque cheio&quot; para calcular o consumo.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="fodo">Hodômetro (km)</Label>
                    <Input id="fodo" inputMode="numeric" className="h-12 text-lg" value={fuelOdo} onChange={e => setFuelOdo(e.target.value)} />
                    {belowCurrent(fOdo) && (
                      <p className="text-sm text-amber-600">Menor que o hodômetro atual ({kmFmt(vehicle.currentOdometerKm!)} km). Confira o valor.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fl">Litros</Label>
                      <Input id="fl" inputMode="decimal" className="h-12 text-lg" value={liters} onChange={e => setLiters(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fv">Valor total (R$)</Label>
                      <Input id="fv" inputMode="decimal" className="h-12 text-lg" value={value} onChange={e => setValue(e.target.value)} />
                    </div>
                  </div>
                  {fLiters && fValue && fLiters > 0 && fValue > 0 && (
                    <p className="text-sm text-muted-foreground">Preço por litro: <span className="font-semibold text-foreground">{brl(fValue / fLiters)}</span></p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fs">Posto (opcional)</Label>
                      <Input id="fs" className="h-12" value={station} onChange={e => setStation(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fc">Final do cartão</Label>
                      <Input id="fc" inputMode="numeric" maxLength={4} className="h-12" value={card} onChange={e => setCard(e.target.value.replace(/\D/g, ""))} placeholder="4 dígitos" />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-base">
                    <input type="checkbox" className="h-5 w-5" checked={fullTank} onChange={e => setFullTank(e.target.checked)} />
                    Tanque cheio
                  </label>
                  <Button className="h-12 text-base" onClick={registerFuel} disabled={saving}>{saving ? "Salvando..." : "Registrar abastecimento"}</Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CloudUpload className="h-3.5 w-3.5" /> Sem internet, os registros ficam no aparelho e são enviados sozinhos quando a conexão voltar.
      </p>
    </div>
  );
}
