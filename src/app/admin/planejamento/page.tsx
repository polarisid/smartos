"use client";

import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDraftRoutes, useTechnicians, useDrivers } from "@/hooks/queries";
import { routeService } from "@/services/supabase/routeService";
import { type Route, type RouteStop, type RoutePart } from "@/lib/data";
import { optimizeRouteStops, describeOptimization } from "@/lib/routeOptimizer";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle2,
  Sparkles, Download, MapPin, Calendar, Users, Truck,
  Eye, Loader2, List
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";

const DynamicalRouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// ─── parseRouteText (same as admin/routes) ──────────────────────────────────
function parseRouteText(text: string): RouteStop[] {
  if (!text.trim()) return [];
  const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
  const headerLine = lines.shift()?.trim();
  if (!headerLine) return [];
  const hasTabs = headerLine.includes('\t');
  const getColumns = (line: string) =>
    hasTabs ? line.split('\t').map(c => c.trim().replace(/ {2,}/g, ' '))
            : line.replace(/[\s\t]{2,}/g, '\t').split('\t').map(c => c.trim());
  const headers = getColumns(headerLine).map(h => h.toLowerCase());
  const getIndex = (name: string | string[]) => {
    const names = Array.isArray(name) ? name : [name];
    for (const n of names) { const i = headers.indexOf(n.toLowerCase()); if (i !== -1) return i; }
    return -1;
  };
  const hi = {
    soNro: getIndex('so nro.'), ascJobNo: getIndex('asc job no.'),
    consumerName: getIndex('nome consumidor'), city: getIndex('cidade'),
    neighborhood: getIndex('bairro'), state: getIndex('uf'),
    model: getIndex('modelo'), turn: getIndex('turno'), tat: getIndex('tat'),
    requestDate: getIndex('data de solicitação'), firstVisitDate: getIndex('1st visit date'),
    ts: getIndex('ts'), warrantyType: getIndex('ow/lp'),
    productType: getIndex('spd'), statusComment: getIndex('status comment'),
  };
  const partColumns: { codeIndex: number; qtyIndex: number; descIndex?: number }[] = [];
  headers.forEach((header, index) => {
    if (header === 'cod') {
      const ci = index; let qi = -1; let di = -1;
      if (headers[index + 1]?.toLowerCase() === 'qtd') qi = index + 1;
      else if (['descricao','descrição'].includes(headers[index + 1]?.toLowerCase()) && headers[index + 2]?.toLowerCase() === 'qtd') { di = index + 1; qi = index + 2; }
      if (qi !== -1) partColumns.push({ codeIndex: ci, qtyIndex: qi, descIndex: di !== -1 ? di : undefined });
    }
  });
  return lines.map(line => {
    const cols = getColumns(line);
    const so = cols[hi.soNro]?.trim();
    if (!so) return null;
    const parts: RoutePart[] = [];
    partColumns.forEach(pc => {
      const code = cols[pc.codeIndex]?.trim();
      const qty = parseInt(cols[pc.qtyIndex]?.trim(), 10);
      if (code && !isNaN(qty) && qty > 0) parts.push({ code, description: pc.descIndex ? (cols[pc.descIndex]?.trim() || '') : '', quantity: qty, trackingCode: '' });
    });
    return {
      serviceOrder: so, ascJobNumber: cols[hi.ascJobNo]?.trim() || '',
      consumerName: cols[hi.consumerName]?.trim() || '', city: cols[hi.city]?.trim() || '',
      neighborhood: cols[hi.neighborhood]?.trim() || '', state: cols[hi.state]?.trim() || '',
      model: cols[hi.model]?.trim() || '', turn: cols[hi.turn]?.trim() || '',
      tat: cols[hi.tat]?.trim() || '', requestDate: cols[hi.requestDate]?.trim() || '',
      firstVisitDate: cols[hi.firstVisitDate]?.trim() || '', ts: cols[hi.ts]?.trim() || '',
      warrantyType: cols[hi.warrantyType]?.trim() || '', productType: cols[hi.productType]?.trim() || '',
      statusComment: cols[hi.statusComment]?.trim() || '', parts, stopType: 'padrao' as const,
    } as RouteStop;
  }).filter((s): s is RouteStop => s !== null);
}

// ─── Excel Export ────────────────────────────────────────────────────────────
function exportWeekToExcel(routes: Route[], weekStart: Date, weekEnd: Date) {
  const wb = XLSX.utils.book_new();
  const weekLabel = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

  const isCapital = (r: Route) =>
    r.routeType === 'capital' ||
    r.name?.toLowerCase().includes('capital');

  const capitalRoutes = routes.filter(isCapital);
  const interiorRoutes = routes.filter(r => !isCapital(r));

  const STOP_HEADERS = ['OS', 'Nome Cliente', 'Cidade', 'Bairro', 'Modelo', 'Garantia', 'Turno', 'TAT', 'Peças', 'Técnico'];

  const stopToRow = (stop: RouteStop, routeName: string, techName?: string): string[] => [
    stop.serviceOrder, stop.consumerName, stop.city, stop.neighborhood,
    stop.model, stop.warrantyType, stop.turn, stop.tat,
    stop.parts?.map(p => `${p.code}(x${p.quantity})`).join(', ') || '',
    techName || routeName,
  ];

  // ── ABA CAPITAL ─────────────────────────────────────────────────────────────
  if (capitalRoutes.length > 0) {
    const capitalData: (string[])[] = [];
    capitalRoutes.forEach((route, idx) => {
      if (idx > 0) capitalData.push([]); // spacer
      capitalData.push([`📍 ${route.name}`, `Técnico: ${route.technicianName || '—'}`, `Motorista: ${route.driverName || '—'}`, `${route.stops.length} paradas`, '', '', '', '', '', '']);
      capitalData.push(STOP_HEADERS);
      route.stops.forEach(stop => capitalData.push(stopToRow(stop, route.name, route.technicianName)));
    });
    const wsCapital = XLSX.utils.aoa_to_sheet(capitalData);
    wsCapital['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 22 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsCapital, 'Capital');
  }

  // ── ABAS INTERIOR ────────────────────────────────────────────────────────────
  interiorRoutes.forEach(route => {
    const sheetData: (string[])[] = [
      [`📍 ${route.name}`],
      [`Técnico: ${route.technicianName || '—'}`, `Motorista: ${route.driverName || '—'}`, `Paradas: ${route.stops.length}`, `Semana: ${weekLabel}`],
      [],
      STOP_HEADERS,
      ...route.stops.map(stop => stopToRow(stop, route.name, route.technicianName)),
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 6 }, { wch: 22 }, { wch: 18 }];
    // Sanitize sheet name (max 31 chars, no special chars)
    const safeName = route.name.replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['Nenhuma rota planejada para esta semana.']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Planejamento');
  }

  XLSX.writeFile(wb, `Planejamento_${weekLabel.replace(/\//g, '-')}.xlsx`);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PlanejamentoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: draftRoutes = [], isLoading } = useDraftRoutes();
  const { data: technicians = [] } = useTechnicians();
  const { data: drivers = [] } = useDrivers();

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(base, weekOffset);
  }, [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6];

  // Selected day
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Selected route for preview
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formText, setFormText] = useState("");
  const [formTechnicianId, setFormTechnicianId] = useState("");
  const [formDriverId, setFormDriverId] = useState("");
  const [formRouteType, setFormRouteType] = useState<"capital" | "interior">("capital");
  const [formPlannedDate, setFormPlannedDate] = useState<Date | undefined>(undefined);
  const [formCalOpen, setFormCalOpen] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<RouteStop[]>([]);

  // ── Filter routes for current week ──
  const routesForWeek = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    return draftRoutes.filter(r => {
      if (!r.plannedDate) return weekOffset === 0; // unscheduled shown in current week
      const d = r.plannedDate;
      return d >= start && d <= end;
    });
  }, [draftRoutes, weekStart, weekOffset]);

  // ── Routes filtered by selected day ──
  const displayedRoutes = useMemo(() => {
    if (!selectedDay) return routesForWeek;
    return routesForWeek.filter(r => {
      if (!r.plannedDate) return false;
      return isSameDay(r.plannedDate, selectedDay);
    });
  }, [routesForWeek, selectedDay]);

  // ── Badge count per day ──
  const countPerDay = useMemo(() => {
    return weekDays.map(day =>
      routesForWeek.filter(r => r.plannedDate && isSameDay(r.plannedDate, day)).length
    );
  }, [routesForWeek, weekDays]);

  // ── Parse text preview ──
  const handleTextChange = useCallback((v: string) => {
    setFormText(v);
    const stops = parseRouteText(v);
    setParsedPreview(stops);
  }, []);

  // ── Create draft ──
  const handleCreate = async () => {
    if (!formName.trim() || parsedPreview.length === 0) {
      toast({ variant: "destructive", title: "Preencha o nome e cole as OSs antes de salvar." });
      return;
    }
    setIsSaving(true);
    try {
      const tech = technicians.find(t => t.id === formTechnicianId);
      const driver = drivers.find(d => d.id === formDriverId);
      await routeService.create({
        name: formName.trim(),
        stops: parsedPreview,
        isActive: false,
        isDraft: true,
        plannedDate: formPlannedDate,
        routeType: formRouteType,
        technicianId: tech?.id,
        technicianName: tech?.name,
        driverId: driver?.id,
        driverName: driver?.name,
        driverPhone: (driver as any)?.phone,
        createdAt: new Date(),
      });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      toast({ title: "Rascunho criado!", description: `${parsedPreview.length} paradas adicionadas.` });
      setIsCreateOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao criar rascunho", description: e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setFormName(""); setFormText(""); setFormTechnicianId(""); setFormDriverId("");
    setFormRouteType("capital"); setFormPlannedDate(undefined); setParsedPreview([]);
  };

  // ── Optimize ──
  const handleOptimize = (route: Route) => {
    setIsOptimizing(true);
    setTimeout(() => {
      const optimized = optimizeRouteStops(route.stops);
      const description = describeOptimization(route.stops, optimized);
      routeService.update(route.id, { stops: optimized }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
        if (selectedRoute?.id === route.id) setSelectedRoute({ ...route, stops: optimized });
        toast({ title: "🤖 Rota Otimizada!", description });
      }).catch(e => {
        toast({ variant: "destructive", title: "Erro ao otimizar", description: e.message });
      }).finally(() => setIsOptimizing(false));
    }, 600); // small delay for visual feedback
  };

  // ── Publish ──
  const handlePublish = async (route: Route) => {
    setIsPublishing(route.id);
    try {
      await routeService.publishRoute(route.id);
      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'active'] });
      if (selectedRoute?.id === route.id) setSelectedRoute(null);
      toast({ title: "✅ Rota Publicada!", description: `"${route.name}" está agora ativa para os técnicos.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao publicar", description: e.message });
    } finally {
      setIsPublishing(null);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!routeToDelete) return;
    try {
      await routeService.remove(routeToDelete.id);
      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      if (selectedRoute?.id === routeToDelete.id) setSelectedRoute(null);
      toast({ title: "Rascunho excluído." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao excluir", description: e.message });
    } finally {
      setRouteToDelete(null); setIsDeleteOpen(false);
    }
  };

  // ── Excel export ──
  const handleExport = () => {
    exportWeekToExcel(routesForWeek, weekStart, weekEnd);
    toast({ title: "📥 Planilha gerada!", description: "O download foi iniciado." });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-screen">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Planejamento de Rotas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crie rascunhos de rotas e publique quando estiver pronto. As rotas ficam invisíveis para os técnicos até a publicação.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Baixar Semana (Excel)
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Rota Planejada
            </Button>
          </div>
        </div>

        {/* ── Weekly Calendar ── */}
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <span className="font-semibold text-sm">
                  {format(weekStart, "dd 'de' MMMM", { locale: ptBR })} —{' '}
                  {format(weekEnd, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
                {weekOffset === 0 && <span className="ml-2 text-[10px] font-bold text-primary uppercase tracking-wider">Esta semana</span>}
                {weekOffset > 0 && <span className="ml-2 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Semana futura</span>}
                {weekOffset < 0 && <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-wider">Semana passada</span>}
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null); }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                const count = countPerDay[i];
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-all duration-200",
                      isSelected ? "bg-primary text-primary-foreground border-primary shadow-md" :
                      isToday ? "border-primary/40 bg-primary/5 text-primary" :
                      "border-transparent hover:border-border hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-wider">
                      {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                    </span>
                    <span className={cn("text-lg font-bold", isToday && !isSelected && "text-primary")}>{format(day, 'd')}</span>
                    {count > 0 ? (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
                      )}>
                        {count}
                      </span>
                    ) : (
                      <span className="text-[10px] text-transparent">0</span>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDay && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Mostrando rotas de{' '}
                <span className="font-semibold text-foreground">{format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}</span>
                {' '}— <button className="text-primary underline" onClick={() => setSelectedDay(null)}>ver semana completa</button>
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Main Content: Draft List + Preview ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Draft list */}
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                {selectedDay
                  ? `Rascunhos — ${format(selectedDay, 'EEEE', { locale: ptBR })}`
                  : `Rascunhos da Semana`}
                {' '}
                <span className="normal-case font-normal">({displayedRoutes.length})</span>
              </h2>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : displayedRoutes.length === 0 ? (
              <Card className="border-dashed border-2 bg-transparent">
                <CardContent className="py-10 text-center text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhuma rota planejada</p>
                  <p className="text-xs mt-1">
                    {selectedDay ? `para ${format(selectedDay, "dd/MM")}` : "para esta semana"}
                  </p>
                  <Button size="sm" variant="outline" className="mt-4 gap-2" onClick={() => setIsCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Criar Rascunho
                  </Button>
                </CardContent>
              </Card>
            ) : (
              displayedRoutes.map(route => {
                const isSelected = selectedRoute?.id === route.id;
                const publishing = isPublishing === route.id;
                return (
                  <Card
                    key={route.id}
                    onClick={() => setSelectedRoute(isSelected ? null : route)}
                    className={cn(
                      "cursor-pointer transition-all duration-200 border hover:shadow-md",
                      isSelected ? "border-primary/50 bg-primary/5 shadow-md" : "border-border/50 hover:border-border"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{route.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 border-amber-200 text-amber-700">
                              📝 Rascunho
                            </Badge>
                            {route.routeType && (
                              <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5",
                                route.routeType === 'capital' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-green-50 border-green-200 text-green-700"
                              )}>
                                {route.routeType === 'capital' ? '🏙️ Capital' : '🌿 Interior'}
                              </Badge>
                            )}
                            {route.plannedDate && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-50 border-slate-200 text-slate-700">
                                📅 {format(route.plannedDate, 'EEE dd/MM', { locale: ptBR })}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-black text-primary">{route.stops.length}</p>
                          <p className="text-[10px] text-muted-foreground">paradas</p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground mb-3">
                        {route.technicianName && (
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{route.technicianName}</span>
                        )}
                        {route.driverName && (
                          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{route.driverName}</span>
                        )}
                      </div>

                      <div className="flex gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 flex-1"
                          disabled={isOptimizing}
                          onClick={() => handleOptimize(route)}
                        >
                          {isOptimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-violet-500" />}
                          IA
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 flex-1 bg-emerald-600 hover:bg-emerald-700"
                          disabled={publishing}
                          onClick={() => handlePublish(route)}
                        >
                          {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Publicar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs px-2"
                          onClick={() => { setRouteToDelete(route); setIsDeleteOpen(true); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Preview panel */}
          <div className="lg:col-span-3">
            {selectedRoute ? (
              <Card className="border-border/50 sticky top-4">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{selectedRoute.name}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {selectedRoute.stops.length} paradas — {selectedRoute.technicianName || "Sem técnico"}
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => setShowMap(v => !v)}
                    >
                      {showMap ? <List className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                      {showMap ? "Lista" : "Mapa"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {showMap ? (
                    <div className="h-72 rounded-b-xl overflow-hidden">
                      <DynamicalRouteMap routes={[selectedRoute]} activeStops={[]} />
                    </div>
                  ) : (
                    <div className="overflow-auto max-h-[520px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-8">#</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">OS</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Nome</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Cidade / Bairro</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Modelo</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">TAT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRoute.stops.map((stop, i) => (
                            <tr key={i} className={cn("border-t border-border/30", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                              <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-1.5 font-mono font-semibold">{stop.serviceOrder}</td>
                              <td className="px-3 py-1.5">{stop.consumerName}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                <span>{stop.city}</span>
                                {stop.neighborhood && <span className="text-[10px] block opacity-70">{stop.neighborhood}</span>}
                              </td>
                              <td className="px-3 py-1.5 text-muted-foreground">{stop.model}</td>
                              <td className="px-3 py-1.5">
                                {stop.warrantyType === 'LP' && <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1 rounded mr-1">LP</span>}
                                {stop.tat}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground py-20 border-2 border-dashed border-border/50 rounded-xl">
                <div>
                  <Eye className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Selecione um rascunho</p>
                  <p className="text-xs mt-1">para visualizar as paradas ou o mapa</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Rota Planejada</DialogTitle>
            <DialogDescription>
              Cole os dados das OSs da planilha Samsung para criar um rascunho.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Nome da Rota *</Label>
                <Input placeholder="Ex: W31 - ROTA CAPITAL - PEDRO" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Rota</Label>
                <Select value={formRouteType} onValueChange={(v: any) => setFormRouteType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capital">🏙️ Capital</SelectItem>
                    <SelectItem value="interior">🌿 Interior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data Planejada</Label>
                <Popover open={formCalOpen} onOpenChange={setFormCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {formPlannedDate ? format(formPlannedDate, 'dd/MM/yyyy') : 'Selecionar data...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={formPlannedDate}
                      onSelect={d => { setFormPlannedDate(d); setFormCalOpen(false); }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Técnico</Label>
                <Select value={formTechnicianId} onValueChange={setFormTechnicianId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Motorista</Label>
                <Select value={formDriverId} onValueChange={setFormDriverId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                OSs da Planilha Samsung *
                {parsedPreview.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-emerald-600">✓ {parsedPreview.length} OSs detectadas</span>
                )}
              </Label>
              <Textarea
                placeholder="Cole aqui o conteúdo da planilha Excel (Ctrl+A → Ctrl+C na planilha e cole aqui)..."
                className="min-h-[180px] font-mono text-xs"
                value={formText}
                onChange={e => handleTextChange(e.target.value)}
              />
              {parsedPreview.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20 p-2">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1.5">Pré-visualização das paradas:</p>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {parsedPreview.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground w-5 text-right">{i+1}.</span>
                        <span className="font-mono font-semibold">{s.serviceOrder}</span>
                        <span className="text-muted-foreground truncate">{s.consumerName}</span>
                        <span className="text-muted-foreground">{s.city}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isSaving || !formName.trim() || parsedPreview.length === 0} className="gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar Rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Rascunho?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá permanentemente o rascunho{' '}
              <span className="font-bold">"{routeToDelete?.name}"</span>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
