"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, Calendar as CalendarIcon, CheckCircle2, Copy, Mail, Sparkles,
  Rocket, ArrowLeft, ArrowRight, ExternalLink, RefreshCw, Save, List, Map as MapIcon,
  X, Route as RouteIcon, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTechnicians, useDrivers } from "@/hooks/queries";
import { routeService } from "@/services/supabase/routeService";
import { configService } from "@/services/supabase/configService";
import { triggerWebhook } from "@/lib/webhook";
import { type Route, type RouteStop } from "@/lib/data";
import { parseRouteText } from "@/lib/parseRouteText";
import { validateCepWithCityState } from "@/lib/geocode";
import { optimizeRouteStopsAsync } from "@/lib/routeOptimizer";
import { buildGoogleSummary } from "@/services/googleRouteOptimizer";
import { fetchLegDistancesAndDurations } from "@/lib/routeLegs";
import { buildRouteEmailPayload, copyRouteEmailToClipboard, formatLegTempo } from "@/lib/emailExport";
import { SortableStopCard } from "./SortableStopCard";
import { StopSummaryCard } from "./StopSummaryCard";

const DynamicalRouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

const STEPS = [
  { n: 1, label: "Rascunho" },
  { n: 2, label: "Otimização" },
  { n: 3, label: "Turnos e datas" },
  { n: 4, label: "Email" },
  { n: 5, label: "Publicar" },
] as const;

type WizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rascunho já existente pra retomar (ex: "Continuar Rascunho"). Omitir para criar do zero. */
  initialRoute?: Route | null;
  /** Chamado depois que a rota é publicada com sucesso. */
  onCompleted?: () => void;
};

export function RouteCreationWizard({ open, onOpenChange, initialRoute, onCompleted }: WizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: technicians = [] } = useTechnicians();
  const { data: drivers = [] } = useDrivers();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [baseAddress, setBaseAddress] = useState("Aracaju");

  // ── Passo 1: rascunho ──
  const [name, setName] = useState("");
  const [routeType, setRouteType] = useState<"capital" | "interior">("capital");
  const [plannedDate, setPlannedDate] = useState<Date | undefined>(undefined);
  const [plannedDateOpen, setPlannedDateOpen] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [licensePlate, setLicensePlate] = useState("TEM8E13");
  const [fuelAvgKml, setFuelAvgKml] = useState(10);
  const [pasteText, setPasteText] = useState("");
  const [stops, setStops] = useState<RouteStop[]>([]);

  // ── Passo 2: otimização ──
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationSummary, setOptimizationSummary] = useState("");
  const [origKm, setOrigKm] = useState<number[]>([]);
  const [propKm, setPropKm] = useState<number[]>([]);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [step2View, setStep2View] = useState<"list" | "map">("list");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const optimizedForRouteId = useRef<string | null>(null);
  // Ordem "antes" (como veio da colagem/planilha) — fixa por rascunho, usada só pra
  // comparação visual no Passo 2 (quem moveu, quanto), independe de otimizar/arrastar de novo.
  const rawOrderRef = useRef<string[]>([]);

  // ── Passo 3: turnos e datas ──
  const [legKm, setLegKm] = useState<number[]>([]);
  const [legDurationMin, setLegDurationMin] = useState<number[]>([]);
  const [legsLoading, setLegsLoading] = useState(false);
  const [departureDate, setDepartureDate] = useState<Date | undefined>(undefined);
  const [arrivalDate, setArrivalDate] = useState<Date | undefined>(undefined);
  const [departureDateOpen, setDepartureDateOpen] = useState(false);
  const [arrivalDateOpen, setArrivalDateOpen] = useState(false);

  // ── Passo 4: email ──
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  // ── Passo 5: publicar ──
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    configService.getBaseAddress().then(base => { if (base) setBaseAddress(base); }).catch(console.error);
  }, []);

  const resetAll = useCallback(() => {
    setRouteId(null);
    setName(""); setRouteType("capital"); setPlannedDate(undefined);
    setTechnicianId(""); setDriverId(""); setLicensePlate("TEM8E13"); setFuelAvgKml(10);
    setPasteText(""); setStops([]);
    setOptimizationSummary(""); setOrigKm([]); setPropKm([]);
    setLegKm([]); setLegDurationMin([]);
    setDepartureDate(undefined); setArrivalDate(undefined);
    setEmailConfirmed(false);
    optimizedForRouteId.current = null;
  }, []);

  // Inicializa/reseta o wizard ao abrir
  useEffect(() => {
    if (!open) return;
    if (initialRoute) {
      setRouteId(initialRoute.id);
      setName(initialRoute.name);
      setRouteType(initialRoute.routeType || "capital");
      setPlannedDate(initialRoute.plannedDate ? new Date(initialRoute.plannedDate) : undefined);
      setTechnicianId(initialRoute.technicianId || "");
      setDriverId(initialRoute.driverId || "");
      setLicensePlate(initialRoute.licensePlate || "TEM8E13");
      setFuelAvgKml(initialRoute.fuelAvgKml || 10);
      setStops(initialRoute.stops || []);
      rawOrderRef.current = (initialRoute.stops || []).map(s => s.serviceOrder);
      const dep = initialRoute.departureDate ? new Date(initialRoute.departureDate) : (initialRoute.plannedDate ? new Date(initialRoute.plannedDate) : undefined);
      setDepartureDate(dep);
      setArrivalDate(initialRoute.arrivalDate ? new Date(initialRoute.arrivalDate) : undefined);
      setEmailConfirmed(false);
      setStep(initialRoute.stops && initialRoute.stops.length > 0 ? 2 : 1);
    } else {
      resetAll();
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRoute]);

  const handlePasteChange = useCallback(async (v: string) => {
    setPasteText(v);
    const parsed = parseRouteText(v);
    setStops(parsed);

    const validated = await Promise.all(parsed.map(async (stop) => {
      if (stop.zipCode) {
        const val = await validateCepWithCityState(stop.zipCode, stop.city, stop.state);
        if (val.mismatch) {
          return {
            ...stop,
            zipMismatch: true,
            zipMismatchDetails: val.details,
            suggestedCityState: `${val.suggestedCity}-${val.suggestedState}`,
          };
        }
      }
      return stop;
    }));
    setStops(validated);
  }, []);

  const selectedTechnician = technicians.find(t => t.id === technicianId);
  const selectedDriver = drivers.find(d => d.id === driverId);

  // Passo de e-mail só se aplica a rotas de interior (viagens mais longas que
  // exigem aviso formal por e-mail). Rotas de capital vão direto pra publicação.
  const requiresEmailStep = routeType === "interior";
  const visibleSteps = useMemo(() => STEPS.filter(s => requiresEmailStep || s.n !== 4), [requiresEmailStep]);
  const currentStepPosition = visibleSteps.findIndex(s => s.n === step) + 1;

  // Snapshot da rota com o estado atual do wizard — usado tanto pelo mapa (Passo 2)
  // quanto pelo preview de e-mail (Passo 4).
  const currentRoute: Route = useMemo(() => ({
    id: routeId || "",
    name,
    stops,
    createdAt: new Date(),
    isActive: false,
    isDraft: true,
    plannedDate,
    departureDate: departureDate || plannedDate,
    arrivalDate: arrivalDate || departureDate || plannedDate,
    routeType,
    licensePlate,
    technicianId: selectedTechnician?.id,
    technicianName: selectedTechnician?.name,
    driverId: selectedDriver?.id,
    driverName: selectedDriver?.name,
    driverPhone: selectedDriver?.phone,
    fuelAvgKml,
  }), [routeId, name, stops, plannedDate, departureDate, arrivalDate, routeType, licensePlate, selectedTechnician, selectedDriver, fuelAvgKml]);

  // ── Salvar rascunho a qualquer momento (sem avançar de passo) ──
  const handleSaveDraft = async () => {
    if (!name.trim() || stops.length === 0) {
      toast({ variant: "destructive", title: "Preencha o nome e cole as OSs antes de salvar." });
      return;
    }
    setIsSaving(true);
    try {
      const payload: Partial<Route> = {
        name: name.trim(),
        stops,
        routeType,
        plannedDate,
        departureDate: departureDate || plannedDate,
        arrivalDate: arrivalDate || departureDate || plannedDate,
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name,
        driverId: selectedDriver?.id,
        driverName: selectedDriver?.name,
        driverPhone: selectedDriver?.phone,
        licensePlate: licensePlate.trim() || "TEM8E13",
        fuelAvgKml: fuelAvgKml || 10,
      };
      if (routeId) {
        await routeService.update(routeId, payload);
      } else {
        const newId = await routeService.create({
          ...payload,
          isActive: false,
          isDraft: true,
          createdAt: new Date(),
        } as Omit<Route, "id">);
        setRouteId(newId);
      }
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      toast({ title: "Rascunho salvo!", description: "Pode fechar e continuar depois pela lista de rascunhos." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar rascunho", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Passo 1 → 2 ──
  const handleAdvanceStep1 = async () => {
    if (!name.trim() || stops.length === 0) {
      toast({ variant: "destructive", title: "Preencha o nome e cole as OSs antes de avançar." });
      return;
    }
    setIsSaving(true);
    try {
      const payload: Partial<Route> = {
        name: name.trim(),
        stops,
        routeType,
        plannedDate,
        departureDate: departureDate || plannedDate,
        technicianId: selectedTechnician?.id,
        technicianName: selectedTechnician?.name,
        driverId: selectedDriver?.id,
        driverName: selectedDriver?.name,
        driverPhone: selectedDriver?.phone,
        licensePlate: licensePlate.trim() || "TEM8E13",
        fuelAvgKml: fuelAvgKml || 10,
      };
      if (routeId) {
        await routeService.update(routeId, payload);
      } else {
        const newId = await routeService.create({
          ...payload,
          isActive: false,
          isDraft: true,
          createdAt: new Date(),
        } as Omit<Route, "id">);
        setRouteId(newId);
      }
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      // Força recálculo da otimização ao entrar no Passo 2 — relevante quando o
      // admin volta ao Passo 1, edita as paradas e avança de novo.
      optimizedForRouteId.current = null;
      rawOrderRef.current = stops.map(s => s.serviceOrder);
      setStep(2);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar rascunho", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Passo 2: otimização de percurso ──
  const runOptimization = useCallback(async () => {
    if (stops.length === 0) return;
    setIsOptimizing(true);
    setOptimizationSummary("Calculando circuito rodoviário ideal via OSRM...");
    try {
      const osrmResult = await optimizeRouteStopsAsync(stops, baseAddress);
      const finalStops = osrmResult.stops;
      const [orig, prop] = await Promise.all([
        fetchLegDistancesAndDurations(stops, baseAddress),
        fetchLegDistancesAndDurations(finalStops, baseAddress),
      ]);
      const movedCount = finalStops.filter((s, i) => stops.findIndex(o => o.serviceOrder === s.serviceOrder) !== i).length;
      const origTotal = orig.km.reduce((a, b) => a + b, 0);
      const propTotal = prop.km.reduce((a, b) => a + b, 0);

      setStops(finalStops);
      setOptimizationSummary(buildGoogleSummary(origTotal, propTotal, movedCount, finalStops.length));
      setOrigKm(orig.km);
      setPropKm(prop.km);
      setLegKm(prop.km);
      setLegDurationMin(prop.durationMin);
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao otimizar", description: "Não foi possível calcular a rota otimizada." });
    } finally {
      setIsOptimizing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, baseAddress]);

  useEffect(() => {
    if (step === 2 && routeId && optimizedForRouteId.current !== routeId) {
      optimizedForRouteId.current = routeId;
      runOptimization();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, routeId]);

  const handleStep2DragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStops(prev => {
      const oldIndex = prev.findIndex(s => s.serviceOrder === active.id);
      const newIndex = prev.findIndex(s => s.serviceOrder === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      setPropKm([]);
      fetchLegDistancesAndDurations(next, baseAddress).then(r => {
        setPropKm(r.km);
        setLegKm(r.km);
        setLegDurationMin(r.durationMin);
      });
      return next;
    });
  };

  // ── Inverter o sentido da rota (1 clique) ──
  const handleReverseOrder = () => {
    setStops(prev => {
      const next = [...prev].reverse();
      setPropKm([]);
      fetchLegDistancesAndDurations(next, baseAddress).then(r => {
        setPropKm(r.km);
        setLegKm(r.km);
        setLegDurationMin(r.durationMin);
      });
      return next;
    });
  };

  const totalOrigKm = origKm.reduce((a, b) => a + b, 0);
  const totalPropKm = propKm.reduce((a, b) => a + b, 0);
  const kmSaved = totalOrigKm - totalPropKm;
  const kmSavedPct = totalOrigKm > 0 ? Math.round((kmSaved / totalOrigKm) * 100) : 0;

  const handleAdvanceStep2 = async () => {
    if (!routeId) return;
    setIsSaving(true);
    try {
      await routeService.update(routeId, { stops });
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      setStep(3);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar otimização", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Passo 3: turnos e datas ──
  useEffect(() => {
    if (step !== 3 || stops.length === 0) return;
    setLegsLoading(true);
    fetchLegDistancesAndDurations(stops, baseAddress)
      .then(r => { setLegKm(r.km); setLegDurationMin(r.durationMin); })
      .finally(() => setLegsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSetTurn = (idx: number, turn: string) => setStops(prev => prev.map((s, i) => (i === idx ? { ...s, turn } : s)));
  const handleToggleCall = (idx: number) => setStops(prev => prev.map((s, i) => (i === idx ? { ...s, confirmedByCall: !s.confirmedByCall } : s)));
  const handleToggleMessage = (idx: number) => setStops(prev => prev.map((s, i) => (i === idx ? { ...s, confirmedByMessage: !s.confirmedByMessage } : s)));

  const handleAdvanceStep3 = async () => {
    if (!routeId) return;
    setIsSaving(true);
    try {
      await routeService.update(routeId, {
        stops,
        departureDate,
        arrivalDate: arrivalDate || departureDate,
        plannedDate: departureDate || plannedDate,
      });
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      setStep(requiresEmailStep ? 4 : 5);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar turnos/datas", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Passo 4: email ──
  const totalKm = useMemo(() => legKm.reduce((a, b) => a + b, 0), [legKm]);

  const emailPayload = useMemo(
    () => buildRouteEmailPayload({ route: currentRoute, legKm, legDurationsMin: legDurationMin, totalKm, fuelAvgKml }),
    [currentRoute, legKm, legDurationMin, totalKm, fuelAvgKml]
  );

  const handleCopyEmail = async () => {
    const ok = await copyRouteEmailToClipboard({ route: currentRoute, legKm, legDurationsMin: legDurationMin, totalKm, fuelAvgKml });
    if (ok) {
      toast({ title: "📧 E-mail copiado!", description: "Cole (Ctrl+V) no Gmail, Outlook ou Word — a tabela formatada vai junto." });
    } else {
      toast({ variant: "destructive", title: "Erro ao copiar para a área de transferência." });
    }
  };

  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent(`Rota: ${name || "Nova Rota"}`);
    const body = encodeURIComponent(emailPayload.plain);
    return `mailto:?subject=${subject}&body=${body}`;
  }, [name, emailPayload]);

  // ── Passo 5: publicar ──
  const handlePublish = async () => {
    if (!routeId) return;
    setIsPublishing(true);
    try {
      await routeService.publishRoute(routeId, departureDate || plannedDate);
      await triggerWebhook({
        event: "new_route",
        technicianName: selectedTechnician?.name,
        technicianPhone: selectedTechnician?.phone,
        driverName: selectedDriver?.name,
        driverPhone: selectedDriver?.phone,
        routeName: name,
        licensePlate,
        departureDate: departureDate ? format(departureDate, "dd/MM/yyyy") : undefined,
        arrivalDate: arrivalDate ? format(arrivalDate, "dd/MM/yyyy") : undefined,
        stops: stops.map(s => ({ so_nro: s.serviceOrder, cidade: s.city, spd: s.productType })),
      });
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      await queryClient.invalidateQueries({ queryKey: ["routes", "active"] });
      await queryClient.invalidateQueries({ queryKey: ["routes"] });
      toast({ title: "✅ Rota Publicada!", description: `"${name}" está agora ativa para os técnicos.` });
      onOpenChange(false);
      onCompleted?.();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao publicar", description: e.message });
    } finally {
      setIsPublishing(false);
    }
  };

  const canGoBack = step > 1;
  const goBack = () => setStep(prev => {
    if (prev === 5 && !requiresEmailStep) return 3;
    return prev > 1 ? ((prev - 1) as typeof prev) : prev;
  });

  const summaryKm = totalKm || totalPropKm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "left-0 top-0 w-screen max-w-none h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0",
          "rounded-none border-0 p-0 gap-0 flex flex-col overflow-hidden",
          "data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0",
          "data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0",
          // O botão de fechar padrão do Dialog (canto superior direito) some aqui — usamos
          // um botão próprio no cabeçalho, estilizado pra combinar com o fundo escuro.
          "[&>button]:hidden"
        )}
      >
        {/* ── Cabeçalho ── */}
        <div className="shrink-0 flex items-center gap-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border px-6 py-4">
          <div className="h-9 w-9 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
            <RouteIcon className="h-4.5 w-4.5 text-sidebar-primary" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-headline text-lg leading-tight text-sidebar-foreground truncate">
              {name || "Nova Rota"}
              <span className="text-sidebar-foreground/40 font-normal"> — {STEPS[step - 1].label}</span>
            </DialogTitle>
            <DialogDescription className="text-[11px] text-sidebar-foreground/50 mt-0.5">
              Passo {currentStepPosition} de {visibleSteps.length}
              {!requiresEmailStep && " · rota de capital, sem etapa de e-mail"}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="ml-auto shrink-0 rounded-md p-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Corpo: trilha de passos + conteúdo ── */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Trilha lateral (desktop) — os passos ligados por uma linha, como o percurso da própria rota */}
          <aside className="hidden lg:flex w-[272px] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border overflow-y-auto">
            <nav className="p-6">
              {visibleSteps.map((s, i) => {
                const isDone = step > s.n;
                const isCurrent = step === s.n;
                return (
                  <div key={s.n} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          "relative flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0 transition-colors",
                          isDone ? "bg-primary text-primary-foreground" :
                          isCurrent ? "bg-sidebar-accent border-2 border-primary text-primary" :
                          "bg-transparent border-2 border-sidebar-border text-sidebar-foreground/40"
                        )}
                      >
                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.n}
                        {isCurrent && <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />}
                      </div>
                      {i < visibleSteps.length - 1 && (
                        <div className={cn("w-0.5 flex-1 my-1", isDone ? "bg-primary" : "bg-sidebar-border")} style={{ minHeight: 28 }} />
                      )}
                    </div>
                    <div className={cn("pt-1", i === visibleSteps.length - 1 ? "pb-0" : "pb-7")}>
                      <p className={cn("text-sm font-semibold", isCurrent ? "text-sidebar-foreground" : isDone ? "text-sidebar-foreground/80" : "text-sidebar-foreground/40")}>
                        {s.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </nav>

            {(name || stops.length > 0) && (
              <div className="mt-auto p-6 border-t border-sidebar-border space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">Resumo</p>
                {name && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-sidebar-foreground/50 shrink-0">Rota</span>
                    <span className="font-medium text-right truncate">{name}</span>
                  </div>
                )}
                {selectedTechnician && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-sidebar-foreground/50 shrink-0">Técnico</span>
                    <span className="font-medium text-right truncate">{selectedTechnician.name}</span>
                  </div>
                )}
                {selectedDriver && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-sidebar-foreground/50 shrink-0">Motorista</span>
                    <span className="font-medium text-right truncate">{selectedDriver.name}</span>
                  </div>
                )}
                {stops.length > 0 && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-sidebar-foreground/50">Paradas</span>
                    <span className="font-mono font-medium">{stops.length}</span>
                  </div>
                )}
                {summaryKm > 0 && (
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-sidebar-foreground/50">Km total</span>
                    <span className="font-mono font-medium">{summaryKm.toFixed(1)} km</span>
                  </div>
                )}
              </div>
            )}
          </aside>

          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* Trilha compacta (mobile/tablet) */}
            <div className="lg:hidden shrink-0 border-b bg-muted/30 px-4 py-2.5 overflow-x-auto">
              <div className="flex items-center gap-1 w-max">
                {visibleSteps.map((s, i) => (
                  <div key={s.n} className="flex items-center">
                    <div
                      className={cn(
                        "flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold shrink-0",
                        step > s.n ? "bg-primary text-primary-foreground" :
                        step === s.n ? "border-2 border-primary text-primary" :
                        "border border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      {step > s.n ? <CheckCircle2 className="h-3 w-3" /> : s.n}
                    </div>
                    <span className={cn("mx-1.5 text-[10px] font-semibold whitespace-nowrap", step === s.n ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                    {i < visibleSteps.length - 1 && <div className={cn("w-4 h-[2px] mr-1.5", step > s.n ? "bg-primary" : "bg-muted")} />}
                  </div>
                ))}
              </div>
            </div>

            <main className="flex-1 overflow-y-auto">
              <div className="max-w-5xl mx-auto p-6 md:p-10">

                {/* ── Passo 1 ── */}
                {step === 1 && (
                  <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Nome da Rota *</Label>
                        <Input placeholder="Ex: W31 - ROTA CAPITAL - PEDRO" value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Tipo de Rota</Label>
                          <Select value={routeType} onValueChange={(v: any) => setRouteType(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="capital">🏙️ Capital</SelectItem>
                              <SelectItem value="interior">🌿 Interior</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Data Planejada</Label>
                          <Popover open={plannedDateOpen} onOpenChange={setPlannedDateOpen}>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {plannedDate ? format(plannedDate, "dd/MM/yyyy") : "Selecionar..."}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <CalendarComp mode="single" selected={plannedDate} onSelect={d => { setPlannedDate(d); setPlannedDateOpen(false); }} locale={ptBR} />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Técnico</Label>
                          <Select value={technicianId} onValueChange={setTechnicianId}>
                            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                            <SelectContent>
                              {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Motorista</Label>
                          <Select value={driverId} onValueChange={setDriverId}>
                            <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                            <SelectContent>
                              {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label>Placa do Veículo 🚗</Label>
                          <Input placeholder="Ex: TEM8E13" value={licensePlate} onChange={e => setLicensePlate(e.target.value)} className="uppercase font-mono font-bold" />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Consumo Médio ⛽</Label>
                          <div className="flex items-center gap-1">
                            <Input type="number" step="0.5" min="1" max="50" value={fuelAvgKml} onChange={e => setFuelAvgKml(parseFloat(e.target.value) || 10)} className="font-mono text-xs" />
                            <span className="text-[10px] font-bold text-muted-foreground shrink-0">km/L</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 flex flex-col">
                      <Label>
                        OSs da Planilha Samsung *
                        {stops.length > 0 && <span className="ml-2 text-xs font-normal text-emerald-600">✓ {stops.length} OSs detectadas</span>}
                      </Label>
                      <Textarea
                        placeholder="Cole aqui o conteúdo da planilha Excel (Ctrl+A → Ctrl+C na planilha e cole aqui)..."
                        className="min-h-[180px] font-mono text-xs"
                        value={pasteText}
                        onChange={e => handlePasteChange(e.target.value)}
                      />
                      {stops.length > 0 && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 p-2 max-h-[45vh] overflow-y-auto space-y-0.5">
                          {stops.map((s, i) => (
                            <div key={i} className={cn("flex items-center flex-wrap gap-1.5 text-xs py-1 px-1 rounded border-b border-border/20 last:border-0", s.zipMismatch && "bg-red-500/10 border-red-500/30")}>
                              <span className="text-muted-foreground w-5 text-right font-bold">{i + 1}.</span>
                              <span className="font-mono font-bold">{s.serviceOrder}</span>
                              <span className="text-muted-foreground truncate max-w-[110px]">{s.consumerName}</span>
                              <span className="text-muted-foreground font-medium">{s.city}{s.state ? `-${s.state}` : ""}</span>
                              {s.zipMismatch && (
                                <span className="text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.2 rounded border border-red-300" title={s.zipMismatchDetails}>
                                  ⚠️ CEP de {s.suggestedCityState}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Passo 2 ── */}
                {step === 2 && (
                  <div className="space-y-3">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p>{optimizationSummary}</p>
                      </div>

                      {!isOptimizing && totalOrigKm > 0 && (
                        <div className="flex items-center gap-4 sm:gap-8 pt-1">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Antes</p>
                            <p className="font-mono text-xl font-bold text-muted-foreground">
                              {totalOrigKm.toFixed(1)} <span className="text-xs font-sans font-normal">km</span>
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Depois</p>
                            <p className="font-mono text-xl font-bold text-foreground">
                              {totalPropKm.toFixed(1)} <span className="text-xs font-sans font-normal">km</span>
                            </p>
                          </div>
                          <div className="ml-auto">
                            {kmSaved > 0.05 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                ↓ {kmSaved.toFixed(1)} km economizados{kmSavedPct > 0 ? ` (${kmSavedPct}%)` : ""}
                              </span>
                            ) : kmSaved < -0.05 ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                ↑ {Math.abs(kmSaved).toFixed(1)} km a mais
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                Sem alteração
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border p-1 w-fit">
                        <button
                          type="button"
                          onClick={() => setStep2View("list")}
                          className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors", step2View === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        >
                          <List className="h-3.5 w-3.5" /> Lista
                        </button>
                        <button
                          type="button"
                          onClick={() => setStep2View("map")}
                          className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors", step2View === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                        >
                          <MapIcon className="h-3.5 w-3.5" /> Mapa
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={handleReverseOrder} disabled={isOptimizing || stops.length < 2} title="Inverte a ordem das paradas em um clique" className="gap-1.5">
                          <ArrowLeftRight className="h-3.5 w-3.5" /> Inverter Ordem
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={runOptimization} disabled={isOptimizing} className="gap-1.5">
                          {isOptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Recalcular
                        </Button>
                      </div>
                    </div>

                    {step2View === "list" ? (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStep2DragEnd}>
                        <SortableContext items={stops.map(s => s.serviceOrder)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1 min-h-[50vh] pr-1">
                            {stops.map((stop, i) => {
                              const origIdx = rawOrderRef.current.indexOf(stop.serviceOrder);
                              const oldPos = origIdx !== -1 ? origIdx + 1 : i + 1;
                              const newPos = i + 1;
                              const isMoved = oldPos !== newPos;
                              const posDiff = oldPos - newPos;
                              return (
                                <SortableStopCard
                                  key={stop.serviceOrder}
                                  stop={stop}
                                  newPos={newPos}
                                  oldPos={oldPos}
                                  isMoved={isMoved}
                                  posDiff={posDiff}
                                  segKm={propKm[i]}
                                  segsLoading={isOptimizing}
                                  isHovered={hoveredStopId === stop.serviceOrder}
                                  onHover={setHoveredStopId}
                                  onSetTurn={() => {}}
                                  onToggleCall={() => {}}
                                  onToggleMessage={() => {}}
                                  showTurnControls={false}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="rounded-lg overflow-hidden border h-[65vh] min-h-[420px]">
                        <DynamicalRouteMap
                          routes={[currentRoute]}
                          activeStops={stops.map(s => ({ stop: s, route: currentRoute, status: "todo" as const }))}
                          showPolyline
                          polylineColor="#10b981"
                          baseAddress={baseAddress}
                          height="100%"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* ── Passo 3 ── */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 max-w-xl">
                      <div className="space-y-1.5">
                        <Label className="text-emerald-700 dark:text-emerald-400 font-bold">Data de Saída 🛫</Label>
                        <Popover open={departureDateOpen} onOpenChange={setDepartureDateOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-semibold text-xs border-emerald-300 dark:border-emerald-800">
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                              {departureDate ? format(departureDate, "dd/MM/yyyy") : "Data de Saída"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <CalendarComp mode="single" selected={departureDate} onSelect={d => { setDepartureDate(d); setDepartureDateOpen(false); }} locale={ptBR} />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-blue-700 dark:text-blue-400 font-bold">Data de Retorno 🛬</Label>
                        <Popover open={arrivalDateOpen} onOpenChange={setArrivalDateOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-semibold text-xs border-blue-300 dark:border-blue-800">
                              <CalendarIcon className="mr-2 h-3.5 w-3.5 text-blue-600" />
                              {arrivalDate ? format(arrivalDate, "dd/MM/yyyy") : "Data de Retorno"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <CalendarComp mode="single" selected={arrivalDate} onSelect={d => { setArrivalDate(d); setArrivalDateOpen(false); }} locale={ptBR} />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div className="max-w-3xl space-y-1">
                      {stops.map((stop, i) => (
                        <StopSummaryCard
                          key={stop.serviceOrder}
                          stop={stop}
                          position={i + 1}
                          legKm={legKm[i]}
                          legDurationMin={legDurationMin[i]}
                          legsLoading={legsLoading}
                          onSetTurn={(turn) => handleSetTurn(i, turn)}
                          onToggleCall={() => handleToggleCall(i)}
                          onToggleMessage={() => handleToggleMessage(i)}
                        />
                      ))}

                      {/* Trecho final: retorno à base, fecha o circuito da rota */}
                      {stops.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1 pl-2 my-0.5">
                            <span className="text-[9px] text-muted-foreground/60">↓</span>
                            {legsLoading ? (
                              <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando…</span>
                            ) : legKm[stops.length] !== undefined ? (
                              <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                {formatLegTempo(legKm[stops.length], legDurationMin[stops.length]) || `${legKm[stops.length].toFixed(1)} km`}
                              </span>
                            ) : null}
                          </div>
                          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 flex items-center gap-2.5 p-2.5 text-xs">
                            <span className="h-6 w-6 rounded-full bg-sidebar text-sidebar-foreground text-xs flex items-center justify-center shrink-0">🏢</span>
                            <div className="min-w-0">
                              <p className="font-semibold">Retorno à base</p>
                              <p className="text-[10px] text-muted-foreground truncate">{baseAddress}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Passo 4 ── */}
                {step === 4 && (
                  <div className="space-y-4 max-w-3xl">
                    <p className="text-sm text-muted-foreground">
                      Revise o e-mail da rota abaixo, copie e cole no seu cliente de e-mail (Gmail/Outlook), ou abra um rascunho já preenchido. Confirme que enviou antes de publicar.
                    </p>
                    <pre className="rounded-lg border max-h-[50vh] overflow-y-auto p-3 bg-white text-black text-xs whitespace-pre-wrap font-mono">{emailPayload.plain}</pre>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={handleCopyEmail} className="gap-2">
                        <Copy className="h-4 w-4" /> Copiar e-mail
                      </Button>
                      <Button type="button" variant="outline" asChild className="gap-2">
                        <a href={mailtoHref}>
                          <Mail className="h-4 w-4" /> Abrir rascunho <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
                      <Checkbox id="email-confirmed" checked={emailConfirmed} onCheckedChange={(c) => setEmailConfirmed(c === true)} />
                      <Label htmlFor="email-confirmed" className="cursor-pointer">Confirmo que enviei o e-mail da rota</Label>
                    </div>
                  </div>
                )}

                {/* ── Passo 5 ── */}
                {step === 5 && (
                  <div className="max-w-xl space-y-6">
                    <div>
                      <h3 className="font-headline text-2xl font-semibold tracking-tight">Tudo pronto pra publicar</h3>
                      <p className="text-sm text-muted-foreground mt-1">Confira os dados abaixo antes de tornar a rota visível para o técnico.</p>
                    </div>
                    <div className="rounded-lg border p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Rota</span><span className="font-semibold">{name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Técnico</span><span>{selectedTechnician?.name || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Motorista</span><span>{selectedDriver?.name || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Placa</span><span className="font-mono">{licensePlate}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Saída</span><span>{departureDate ? format(departureDate, "dd/MM/yyyy") : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Retorno</span><span>{arrivalDate ? format(arrivalDate, "dd/MM/yyyy") : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Paradas</span><span className="font-mono">{stops.length}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">KM total</span><span className="font-mono">{totalKm.toFixed(1)} km</span></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ao publicar, a rota fica visível para o técnico e um aviso automático é disparado (se configurado em Configurações).
                    </p>
                  </div>
                )}

              </div>
            </main>
          </div>
        </div>

        {/* ── Rodapé fixo ── */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t bg-background px-6 py-4 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={goBack} disabled={!canGoBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleSaveDraft}
              disabled={isSaving || !name.trim() || stops.length === 0}
              title="Salva o progresso atual sem avançar de passo — pode fechar e continuar depois"
              className="gap-1.5 text-muted-foreground"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Rascunho
            </Button>
          </div>

          {step === 1 && (
            <Button type="button" onClick={handleAdvanceStep1} disabled={isSaving || !name.trim() || stops.length === 0} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Avançar
            </Button>
          )}
          {step === 2 && (
            <Button type="button" onClick={handleAdvanceStep2} disabled={isSaving || isOptimizing} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Aplicar e Avançar
            </Button>
          )}
          {step === 3 && (
            <Button type="button" onClick={handleAdvanceStep3} disabled={isSaving || !departureDate} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Avançar
            </Button>
          )}
          {step === 4 && (
            <Button type="button" onClick={() => setStep(5)} disabled={!emailConfirmed} className="gap-2">
              <ArrowRight className="h-4 w-4" /> Avançar
            </Button>
          )}
          {step === 5 && (
            <Button type="button" onClick={handlePublish} disabled={isPublishing} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              {isPublishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publicar Rota
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
