"use client";

// Planejador Livre: cola as OSs uma única vez e divide em várias rotas
// (Rota A, Rota B...) sugeridas por proximidade geográfica, com revisão
// visual no mapa e ajuste manual (arrastar parada entre grupos) antes de
// criar cada rascunho. Depois de criado, cada rascunho é editado normalmente
// pela lista de rotas (técnico/motorista/veículo/data ficam pra lá).

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Wand2, Plus, CheckCircle2, GripVertical, X, Trash2, Minus, Route as RouteIcon, Rocket, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { routeService } from "@/services/supabase/routeService";
import { configService } from "@/services/supabase/configService";
import type { Route, RouteStop } from "@/lib/data";
import { parseRouteText } from "@/lib/parseRouteText";
import { tagStopsWithZipMismatch } from "@/lib/geocode";
import { optimizeRouteStopsAsync } from "@/lib/routeOptimizer";
import { geocodeBase } from "@/lib/routeLegs";
import { fetchOsrmRouteGeometry } from "@/lib/routingEngine";
import { geocodeStopsForSplit, splitIntoGroups, colorForGroup, groupLabel as defaultGroupLabel } from "@/lib/routeSplitter";
import type { SplitMapPoint, GroupPath } from "./RouteSplitMap";

const DynamicSplitMap = dynamic(() => import("./RouteSplitMap"), { ssr: false });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

export function RouteSplitPlannerWizard({ open, onOpenChange, onCompleted }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<"input" | "review">("input");
  const [baseName, setBaseName] = useState("");
  const [routeType, setRouteType] = useState<"capital" | "interior">("capital");
  const [numGroups, setNumGroups] = useState(2);
  const [pasteText, setPasteText] = useState("");
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);

  const [considerBase, setConsiderBase] = useState(true);
  const [baseAddress, setBaseAddress] = useState("Aracaju");
  const [baseCoords, setBaseCoords] = useState<[number, number] | null>(null);

  const [groups, setGroups] = useState<RouteStop[][]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [coordsByOrder, setCoordsByOrder] = useState<Map<string, [number, number]>>(new Map());
  const [dragSource, setDragSource] = useState<{ groupIndex: number; stopIndex: number } | null>(null);
  const [createdRouteIds, setCreatedRouteIds] = useState<Record<number, string>>({});
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [optimizingIndex, setOptimizingIndex] = useState<number | null>(null);

  const [showRoutePaths, setShowRoutePaths] = useState(false);
  const [routePaths, setRoutePaths] = useState<GroupPath[]>([]);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(new Set());

  const toggleGroupVisibility = (groupIndex: number) => {
    setHiddenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupIndex)) next.delete(groupIndex); else next.add(groupIndex);
      return next;
    });
  };

  useEffect(() => {
    configService.getBaseAddress().then(addr => { if (addr) setBaseAddress(addr); }).catch(console.error);
  }, []);

  useEffect(() => {
    geocodeBase(baseAddress).then(setBaseCoords).catch(() => setBaseCoords(null));
  }, [baseAddress]);

  const resetAll = () => {
    setPhase("input");
    setBaseName("");
    setRouteType("capital");
    setNumGroups(2);
    setPasteText("");
    setStops([]);
    setGroups([]);
    setLabels([]);
    setCoordsByOrder(new Map());
    setDragSource(null);
    setCreatedRouteIds({});
    setCreatingIndex(null);
    setShowRoutePaths(false);
    setRoutePaths([]);
    setHiddenGroups(new Set());
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) {
      const hasCreated = Object.keys(createdRouteIds).length > 0;
      resetAll();
      if (hasCreated) onCompleted?.();
    }
    onOpenChange(o);
  };

  const handlePasteChange = async (v: string) => {
    setPasteText(v);
    const parsed = parseRouteText(v);
    setStops(parsed);
    setStops(await tagStopsWithZipMismatch(parsed));
  };

  const handleSplit = async () => {
    if (!baseName.trim() || stops.length === 0) {
      toast({ variant: "destructive", title: "Informe o nome base e cole as OSs antes de dividir." });
      return;
    }
    setIsSplitting(true);
    try {
      const geocoded = await geocodeStopsForSplit(stops);
      const map = new Map<string, [number, number]>();
      geocoded.forEach(g => { if (g.coords) map.set(g.stop.serviceOrder, g.coords); });
      setCoordsByOrder(map);
      const split = splitIntoGroups(geocoded, numGroups, considerBase ? baseCoords || undefined : undefined);
      setGroups(split);
      setLabels(split.map((_, i) => defaultGroupLabel(i)));
      setCreatedRouteIds({});
      setRoutePaths([]);
      setHiddenGroups(new Set());
      setPhase("review");
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao dividir a rota", description: e?.message });
    } finally {
      setIsSplitting(false);
    }
  };

  const mapPoints: SplitMapPoint[] = useMemo(() => {
    const pts: SplitMapPoint[] = [];
    groups.forEach((g, gi) => {
      if (hiddenGroups.has(gi)) return;
      g.forEach((stop, si) => {
        const c = coordsByOrder.get(stop.serviceOrder);
        if (c) pts.push({ stop, coords: c, groupIndex: gi, sequence: si + 1 });
      });
    });
    return pts;
  }, [groups, coordsByOrder, hiddenGroups]);

  const visibleRoutePaths = useMemo(
    () => routePaths.filter(p => !hiddenGroups.has(p.groupIndex)),
    [routePaths, hiddenGroups]
  );

  const groupColorsHex = useMemo(() => groups.map((_, i) => colorForGroup(i).hex), [groups]);
  const hasAnyCreated = Object.keys(createdRouteIds).length > 0;

  // Chave estável com a ordem/composição atual dos grupos - evita refazer as
  // chamadas OSRM a cada render, só quando a divisão realmente muda.
  const groupsSig = useMemo(
    () => groups.map(g => g.map(s => s.serviceOrder).join(",")).join("|"),
    [groups]
  );

  // Percurso real (OSRM) de cada grupo (base → paradas na ordem atual → base),
  // só buscado quando o usuário liga "Mostrar percurso no mapa" - evita gastar
  // chamadas à toa enquanto ele só está organizando os grupos.
  useEffect(() => {
    if (!showRoutePaths || phase !== "review") return;
    const nonEmptyGroups = groups
      .map((g, gi) => ({ gi, coords: g.map(s => coordsByOrder.get(s.serviceOrder)).filter((c): c is [number, number] => !!c) }))
      .filter(g => g.coords.length > 0);
    if (nonEmptyGroups.length === 0) { setRoutePaths([]); return; }

    let cancelled = false;
    setIsLoadingPaths(true);
    Promise.all(nonEmptyGroups.map(async ({ gi, coords }) => {
      const points = baseCoords
        ? [{ lat: baseCoords[0], lng: baseCoords[1] }, ...coords.map(c => ({ lat: c[0], lng: c[1] })), { lat: baseCoords[0], lng: baseCoords[1] }]
        : coords.map(c => ({ lat: c[0], lng: c[1] }));
      const geometry = await fetchOsrmRouteGeometry(points).catch(() => null);
      return geometry ? { groupIndex: gi, coords: geometry.map(p => [p.lat, p.lng] as [number, number]) } : null;
    })).then(results => {
      if (cancelled) return;
      setRoutePaths(results.filter((r): r is GroupPath => r != null));
    }).finally(() => { if (!cancelled) setIsLoadingPaths(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoutePaths, groupsSig, baseCoords, phase]);

  // Redivide do zero a partir das coordenadas já calculadas (sem geocodificar
  // de novo) - só disponível antes de criar o primeiro rascunho, pra não
  // bagunçar a correspondência entre grupo e rascunho já salvo.
  const handleResplit = (newNumGroups: number) => {
    setNumGroups(newNumGroups);
    if (hasAnyCreated || stops.length === 0) return;
    const geocoded = stops.map(stop => ({ stop, coords: coordsByOrder.get(stop.serviceOrder) || null }));
    const split = splitIntoGroups(geocoded, newNumGroups, considerBase ? baseCoords || undefined : undefined);
    setGroups(split);
    setLabels(split.map((_, i) => defaultGroupLabel(i)));
    setHiddenGroups(new Set());
  };

  // Solta no fim do grupo (espaço vazio da lista, fora de qualquer parada).
  const handleDropIntoGroup = (targetGroupIndex: number) => {
    if (!dragSource) return;
    setGroups(prev => {
      const next = prev.map(g => [...g]);
      const [moved] = next[dragSource.groupIndex].splice(dragSource.stopIndex, 1);
      if (moved) next[targetGroupIndex].push(moved);
      return next;
    });
    setDragSource(null);
  };

  // Solta em cima de uma parada específica - insere ali, reordenando dentro
  // do mesmo grupo ou movendo pra outro grupo numa posição escolhida.
  const handleDropAtPosition = (targetGroupIndex: number, targetIndex: number) => {
    if (!dragSource) return;
    setGroups(prev => {
      const next = prev.map(g => [...g]);
      const [moved] = next[dragSource.groupIndex].splice(dragSource.stopIndex, 1);
      if (!moved) return prev;
      let insertAt = targetIndex;
      if (dragSource.groupIndex === targetGroupIndex && dragSource.stopIndex < targetIndex) {
        insertAt -= 1;
      }
      next[targetGroupIndex].splice(insertAt, 0, moved);
      return next;
    });
    setDragSource(null);
  };

  const handleAddGroup = () => {
    setGroups(prev => [...prev, []]);
    setLabels(prev => [...prev, defaultGroupLabel(prev.length)]);
  };

  const handleRemoveGroup = (index: number) => {
    if (groups[index].length > 0) {
      toast({ variant: "destructive", title: "Grupo não está vazio", description: "Mova as paradas pra outro grupo antes de remover." });
      return;
    }
    setGroups(prev => prev.filter((_, i) => i !== index));
    setLabels(prev => prev.filter((_, i) => i !== index));
    setCreatedRouteIds(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      });
      return next;
    });
    setHiddenGroups(prev => {
      const next = new Set<number>();
      prev.forEach(ki => {
        if (ki < index) next.add(ki);
        else if (ki > index) next.add(ki - 1);
      });
      return next;
    });
  };

  // Otimiza só a sequência das paradas DESSE grupo (distância real via OSRM),
  // sem mexer nos outros grupos - mesma lógica usada no assistente de rota única.
  const handleOptimizeGroup = async (groupIndex: number) => {
    const groupStops = groups[groupIndex];
    if (groupStops.length <= 1) return;
    setOptimizingIndex(groupIndex);
    try {
      const result = await optimizeRouteStopsAsync(groupStops, baseAddress);
      setGroups(prev => prev.map((g, i) => (i === groupIndex ? result.stops : g)));
      toast({ title: `${labels[groupIndex]} otimizada`, description: result.summary });
    } catch (e) {
      console.error("Falha ao otimizar grupo:", e);
      toast({ variant: "destructive", title: "Não foi possível otimizar", description: "Tente novamente em instantes." });
    } finally {
      setOptimizingIndex(null);
    }
  };

  const handleInvertGroup = (groupIndex: number) => {
    setGroups(prev => prev.map((g, i) => (i === groupIndex ? [...g].reverse() : g)));
  };

  const handleCreateGroupDraft = async (groupIndex: number) => {
    const groupStops = groups[groupIndex];
    if (groupStops.length === 0) return;
    setCreatingIndex(groupIndex);
    try {
      const newId = await routeService.create({
        name: `${baseName.trim()} - ${labels[groupIndex]}`,
        stops: groupStops,
        routeType,
        isActive: false,
        isDraft: true,
        createdAt: new Date(),
      } as Omit<Route, "id">);
      setCreatedRouteIds(prev => ({ ...prev, [groupIndex]: newId }));
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      toast({ title: `${labels[groupIndex]} criada!`, description: "Encontre na lista de rotas pra definir técnico, veículo e data." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao criar rascunho", description: e?.message });
    } finally {
      setCreatingIndex(null);
    }
  };

  // Depois de criado, o grupo continua editável aqui (arrastar paradas,
  // renomear) - esse botão sincroniza as mudanças com o rascunho já salvo.
  const handleUpdateGroupDraft = async (groupIndex: number) => {
    const routeId = createdRouteIds[groupIndex];
    if (!routeId) return;
    setCreatingIndex(groupIndex);
    try {
      await routeService.update(routeId, {
        name: `${baseName.trim()} - ${labels[groupIndex]}`,
        stops: groups[groupIndex],
        routeType,
      });
      await queryClient.invalidateQueries({ queryKey: ["routes", "draft"] });
      toast({ title: `${labels[groupIndex]} atualizada!` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar rascunho", description: e?.message });
    } finally {
      setCreatingIndex(null);
    }
  };

  const totalStopsAssigned = groups.reduce((a, g) => a + g.length, 0);
  const allCreated = groups.length > 0 && groups.every((g, i) => g.length === 0 || createdRouteIds[i]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[1440px] w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" /> Planejador Livre — Dividir em Múltiplas Rotas
          </DialogTitle>
          <DialogDescription>
            {phase === "input"
              ? "Cole as OSs uma única vez e deixe o sistema sugerir a divisão geográfica em várias rotas."
              : `Revise a divisão sugerida (${groups.length} rota${groups.length !== 1 ? "s" : ""}, ${totalStopsAssigned} parada${totalStopsAssigned !== 1 ? "s" : ""}) — arraste uma parada pra outro grupo se quiser ajustar.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {phase === "input" ? (
            <div className="grid lg:grid-cols-[1fr_1.1fr] gap-8 max-w-5xl mx-auto">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome Base da Rota *</Label>
                  <Input placeholder="Ex: W31 - CAPITAL" value={baseName} onChange={e => setBaseName(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Cada rota gerada recebe esse nome + "- Rota A", "- Rota B"...</p>
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
                    <Label>Dividir em quantas rotas?</Label>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setNumGroups(n => Math.max(2, n - 1))}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <div className="h-9 flex-1 rounded-md border flex items-center justify-center font-bold font-mono">{numGroups}</div>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setNumGroups(n => Math.min(10, n + 1))}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 rounded-lg border p-3">
                  <Checkbox id="consider-base" checked={considerBase} onCheckedChange={c => setConsiderBase(c === true)} className="mt-0.5" />
                  <div>
                    <Label htmlFor="consider-base" className="text-xs font-semibold cursor-pointer">
                      Dividir considerando saída/retorno da base (recomendado)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Usa a base operacional como referência da divisão (igual a como veículos partem e voltam pro mesmo ponto), evitando rotas que se cruzam. Desative pra dividir só pela proximidade entre as próprias paradas.
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground bg-muted/30">
                  A divisão é sugerida por proximidade geográfica das paradas. Na próxima tela dá pra arrastar paradas entre as rotas antes de criar os rascunhos.
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
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 h-full">
              <div className="flex flex-col gap-2 min-h-[480px]">
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <Checkbox id="show-paths" checked={showRoutePaths} onCheckedChange={c => setShowRoutePaths(c === true)} />
                  <Label htmlFor="show-paths" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                    <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" /> Mostrar percurso no mapa
                  </Label>
                  {isLoadingPaths && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                  <span className="text-[11px] text-muted-foreground font-medium">Exibir no mapa:</span>
                  {groups.map((_, gi) => {
                    const color = colorForGroup(gi).hex;
                    const hidden = hiddenGroups.has(gi);
                    return (
                      <button
                        key={gi}
                        type="button"
                        onClick={() => toggleGroupVisibility(gi)}
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors"
                        style={{
                          background: hidden ? "transparent" : color,
                          borderColor: color,
                          color: hidden ? color : "white",
                        }}
                      >
                        {labels[gi] || defaultGroupLabel(gi)}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1 rounded-lg border overflow-hidden">
                  <DynamicSplitMap points={mapPoints} groupColors={groupColorsHex} groupLabels={labels} paths={showRoutePaths ? visibleRoutePaths : []} />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 rounded-lg border p-2.5 bg-muted/30">
                  <Label className="text-xs font-semibold shrink-0" title={hasAnyCreated ? "Não dá pra redividir depois de criar um rascunho — adicione grupos manualmente com o botão abaixo" : undefined}>
                    Redividir automaticamente em
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" disabled={hasAnyCreated} onClick={() => handleResplit(Math.max(2, numGroups - 1))}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center font-bold font-mono text-sm">{numGroups}</span>
                    <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0" disabled={hasAnyCreated} onClick={() => handleResplit(Math.min(10, numGroups + 1))}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {groups.map((groupStops, gi) => {
                  const color = colorForGroup(gi).hex;
                  const created = createdRouteIds[gi];
                  return (
                    <div
                      key={gi}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDropIntoGroup(gi)}
                      className="rounded-lg border overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-2.5 border-b bg-muted/30">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: color }} />
                        <Input
                          value={labels[gi] || ""}
                          onChange={e => setLabels(prev => prev.map((l, i) => (i === gi ? e.target.value : l)))}
                          className="h-7 text-sm font-semibold flex-1 min-w-0"
                        />
                        <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                          {groupStops.length} parada{groupStops.length !== 1 ? "s" : ""}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Otimizar sequência desta rota (distância real)"
                          disabled={groupStops.length <= 1 || optimizingIndex === gi}
                          onClick={() => handleOptimizeGroup(gi)}
                        >
                          {optimizingIndex === gi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Inverter o sentido desta rota"
                          disabled={groupStops.length <= 1}
                          onClick={() => handleInvertGroup(gi)}
                        >
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </Button>
                        {groupStops.length === 0 && groups.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveGroup(gi)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <div className="p-1.5 space-y-1 max-h-[180px] overflow-y-auto">
                        {groupStops.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground text-center py-3">Arraste uma parada aqui</p>
                        ) : (
                          groupStops.map((stop, si) => (
                            <div
                              key={stop.serviceOrder}
                              draggable
                              onDragStart={() => setDragSource({ groupIndex: gi, stopIndex: si })}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDropAtPosition(gi, si); }}
                              className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border bg-card cursor-grab active:cursor-grabbing"
                            >
                              <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                              <span className="text-muted-foreground/70 w-4 text-right shrink-0">{si + 1}.</span>
                              <span className="font-mono font-bold shrink-0">{stop.serviceOrder}</span>
                              <span className="text-muted-foreground truncate">
                                {stop.city}{stop.neighborhood ? ` · ${stop.neighborhood}` : ""}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="p-2 border-t space-y-1.5">
                        {created && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Rascunho criado — técnico/veículo/data ficam na lista de rotas
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant={created ? "outline" : "default"}
                          className="w-full gap-1.5"
                          disabled={groupStops.length === 0 || creatingIndex === gi}
                          onClick={() => (created ? handleUpdateGroupDraft(gi) : handleCreateGroupDraft(gi))}
                        >
                          {creatingIndex === gi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {created ? "Salvar alterações no rascunho" : "Criar rascunho desta rota"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={handleAddGroup}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar grupo
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t shrink-0">
          {phase === "input" ? (
            <Button type="button" onClick={handleSplit} disabled={isSplitting || !baseName.trim() || stops.length === 0} className="gap-2">
              {isSplitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              Dividir em {numGroups} rotas
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setPhase("input")} className="gap-2 mr-auto">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)} className="gap-2" variant={allCreated ? "default" : "outline"}>
                {allCreated ? <CheckCircle2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {allCreated ? "Concluído" : "Fechar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
