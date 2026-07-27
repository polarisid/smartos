"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
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
import { useAllRoutes, useTechnicians, useDrivers } from "@/hooks/queries";
import { routeService } from "@/services/supabase/routeService";
import { configService } from "@/services/supabase/configService";
import { type Route, type RouteStop, type RoutePart } from "@/lib/data";
import { optimizeRouteStops, describeOptimization } from "@/lib/routeOptimizer";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, CheckCircle2,
  Sparkles, Download, MapPin, Calendar, Users, Truck,
  Eye, Loader2, List, Edit, Copy
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";

const DynamicalRouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// ─── formatStopsToText (converts RouteStops back to TSV text format for editing) ──
function formatStopsToText(stops: RouteStop[]): string {
  if (!stops || stops.length === 0) return "";
  const header = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tDESCRICAO\tQTD";
  const rows = stops.map(s => {
    const p0 = s.parts?.[0];
    const partCode = p0?.code || "";
    const partDesc = p0?.description || "";
    const partQty = p0?.quantity ? String(p0.quantity) : "";
    return [
      s.serviceOrder || "",
      s.ascJobNumber || "",
      s.consumerName || "",
      s.city || "",
      s.neighborhood || "",
      s.state || "",
      s.model || "",
      s.turn || "",
      s.tat || "",
      s.requestDate || "",
      s.firstVisitDate || "",
      s.ts || "",
      s.warrantyType || "",
      s.productType || "",
      s.statusComment || "",
      partCode,
      partDesc,
      partQty
    ].join("\t");
  });
  return [header, ...rows].join("\n");
}

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
  const weekLabel = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM/yyyy')}`;

  const isCapital = (r: Route) =>
    r.routeType === 'capital' ||
    r.name?.toLowerCase().includes('capital');

  const capitalRoutes = routes.filter(isCapital);
  const interiorRoutes = routes.filter(r => !isCapital(r));

  const escapeXml = (str: string | number | undefined | null) => {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const FULL_HEADERS = [
    'SO Nro.', 'ASC Job No.', 'Nome Consumidor', 'Cidade', 'Bairro', 'UF', 'Modelo', 'TURNO', 'TAT', 
    'Data de Solicitação', '1st Visit Date', 'TS', 'OW/LP', 'SPD', 'Status comment',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD'
  ];

  const buildWorksheetXml = (sheetRoutes: Route[], sheetName: string) => {
    let rowsXml = '';

    sheetRoutes.forEach((route, rIdx) => {
      // 1. Table Header Row (Black bg, White bold text - matching input format)
      rowsXml += `   <Row ss:Height="22">\n`;
      FULL_HEADERS.forEach(h => {
        rowsXml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
      });
      rowsXml += `   </Row>\n`;

      // 2. Data Rows (with exact columns matching input format)
      route.stops.forEach(stop => {
        const p0 = stop.parts?.[0];
        const p1 = stop.parts?.[1];
        const p2 = stop.parts?.[2];
        const p3 = stop.parts?.[3];
        const p4 = stop.parts?.[4];

        const rowVals = [
          stop.serviceOrder || '',
          stop.ascJobNumber || '',
          stop.consumerName || '',
          stop.city || '',
          stop.neighborhood || '',
          stop.state || '',
          stop.model || '',
          stop.turn || '',
          stop.tat || '',
          stop.requestDate || '',
          stop.firstVisitDate || '',
          stop.ts || '',
          stop.warrantyType || '',
          stop.productType || '',
          stop.statusComment || '',
          p0?.code || '', p0?.description || '', p0?.quantity != null ? p0.quantity : '',
          p1?.code || '', p1?.description || '', p1?.quantity != null ? p1.quantity : '',
          p2?.code || '', p2?.description || '', p2?.quantity != null ? p2.quantity : '',
          p3?.code || '', p3?.description || '', p3?.quantity != null ? p3.quantity : '',
          p4?.code || '', p4?.description || '', p4?.quantity != null ? p4.quantity : '',
        ];

        rowsXml += `   <Row ss:Height="19">\n`;
        rowVals.forEach(val => {
          rowsXml += `    <Cell ss:StyleID="DataCell"><Data ss:Type="String">${escapeXml(val)}</Data></Cell>\n`;
        });
        rowsXml += `   </Row>\n`;
      });

      // 3. Empty spacer row
      rowsXml += `   <Row ss:Height="10"/>\n`;

      // 4. Route Metadata Block (Black label, White value - matching photo 2)
      const statusStr = route.isDraft ? '[Rascunho]' : route.isActive ? '[Ativa]' : '[Inativa]';
      rowsXml += `   <Row ss:Height="20">\n`;
      rowsXml += `    <Cell ss:StyleID="LabelBlack"><Data ss:Type="String">ROTA</Data></Cell>\n`;
      rowsXml += `    <Cell ss:StyleID="ValueWhite"><Data ss:Type="String">${escapeXml(route.name + ' ' + statusStr)}</Data></Cell>\n`;
      rowsXml += `   </Row>\n`;

      rowsXml += `   <Row ss:Height="20">\n`;
      rowsXml += `    <Cell ss:StyleID="LabelBlack"><Data ss:Type="String">TECNICO</Data></Cell>\n`;
      rowsXml += `    <Cell ss:StyleID="ValueWhite"><Data ss:Type="String">${escapeXml(route.technicianName || '—')}</Data></Cell>\n`;
      rowsXml += `   </Row>\n`;

      rowsXml += `   <Row ss:Height="20">\n`;
      rowsXml += `    <Cell ss:StyleID="LabelBlack"><Data ss:Type="String">MOTORISTA</Data></Cell>\n`;
      rowsXml += `    <Cell ss:StyleID="ValueWhite"><Data ss:Type="String">${escapeXml(route.driverName || '—')}</Data></Cell>\n`;
      rowsXml += `   </Row>\n`;

      // 5. Spacer between routes in the same sheet
      if (rIdx < sheetRoutes.length - 1) {
        rowsXml += `   <Row ss:Height="18"/>\n`;
      }
    });

    return ` <Worksheet ss:Name="${escapeXml(sheetName.substring(0, 31))}">\n  <Table>\n${rowsXml}  </Table>\n </Worksheet>\n`;
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#000000" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataCell">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CCCCCC"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="LabelBlack">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#000000" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="ValueWhite">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#000000"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>
 </Styles>\n`;

  if (capitalRoutes.length > 0) {
    xml += buildWorksheetXml(capitalRoutes, 'Capital');
  }

  interiorRoutes.forEach(route => {
    const safeName = route.name.replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 31);
    xml += buildWorksheetXml([route], safeName);
  });

  if (capitalRoutes.length === 0 && interiorRoutes.length === 0) {
    xml += ` <Worksheet ss:Name="Planejamento">\n  <Table>\n   <Row><Cell><Data ss:Type="String">Nenhuma rota encontrada para esta semana.</Data></Cell></Row>\n  </Table>\n </Worksheet>\n`;
  }

  xml += `</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Planejamento_${weekLabel.replace(/\//g, '-')}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PlanejamentoPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allRoutes = [], isLoading } = useAllRoutes();
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

  // AI Optimization preview state
  const [isOptimizeOpen, setIsOptimizeOpen] = useState(false);
  const [optimizingRoute, setOptimizingRoute] = useState<Route | null>(null);
  const [originCity, setOriginCity] = useState("Aracaju");
  const [proposedStops, setProposedStops] = useState<RouteStop[]>([]);
  const [optimizationSummary, setOptimizationSummary] = useState("");

  const routeCities = useMemo(() => {
    if (!optimizingRoute) return [];
    const set = new Set(optimizingRoute.stops.map(s => s.city).filter(Boolean));
    return Array.from(set);
  }, [optimizingRoute]);

  // Configured default base address
  const [defaultBaseAddress, setDefaultBaseAddress] = useState("Aracaju");

  useEffect(() => {
    configService.getBaseAddress().then(base => {
      if (base) {
        setDefaultBaseAddress(base);
        setOriginCity(base);
      }
    }).catch(console.error);
  }, []);

  // Form state (Create)
  const [formName, setFormName] = useState("");
  const [formText, setFormText] = useState("");
  const [formTechnicianId, setFormTechnicianId] = useState("");
  const [formDriverId, setFormDriverId] = useState("");
  const [formRouteType, setFormRouteType] = useState<"capital" | "interior">("capital");
  const [formPlannedDate, setFormPlannedDate] = useState<Date | undefined>(undefined);
  const [formCalOpen, setFormCalOpen] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<RouteStop[]>([]);

  // Edit Dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [editName, setEditName] = useState("");
  const [editText, setEditText] = useState("");
  const [editTechnicianId, setEditTechnicianId] = useState("");
  const [editDriverId, setEditDriverId] = useState("");
  const [editRouteType, setEditRouteType] = useState<"capital" | "interior">("capital");
  const [editPlannedDate, setEditPlannedDate] = useState<Date | undefined>(undefined);
  const [editCalOpen, setEditCalOpen] = useState(false);
  const [editParsedPreview, setEditParsedPreview] = useState<RouteStop[]>([]);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  // Helper: Get true operational date of route (plannedDate → departureDate → createdAt)
  const getRouteDate = useCallback((r: Route): Date => {
    return r.plannedDate || r.departureDate || r.createdAt;
  }, []);

  // ── Filter ALL routes (Drafts + Active + Inactive) for current week ──
  const routesForWeek = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);

    return allRoutes.filter(r => {
      const dateToTest = getRouteDate(r);
      if (!dateToTest) return weekOffset === 0;
      return dateToTest >= start && dateToTest <= end;
    });
  }, [allRoutes, weekStart, weekOffset, getRouteDate]);

  // ── Routes visible in UI cards (Drafts + Active only, hiding inactive) ──
  const activeAndDraftRoutesForWeek = useMemo(() => {
    return routesForWeek.filter(r => r.isDraft || r.isActive);
  }, [routesForWeek]);

  // ── Routes filtered by selected day for UI cards ──
  const displayedRoutes = useMemo(() => {
    if (!selectedDay) return activeAndDraftRoutesForWeek;
    return activeAndDraftRoutesForWeek.filter(r => {
      const d = getRouteDate(r);
      if (!d) return false;
      return isSameDay(d, selectedDay);
    });
  }, [activeAndDraftRoutesForWeek, selectedDay, getRouteDate]);

  // ── Badge count per day ──
  const countPerDay = useMemo(() => {
    return weekDays.map(day =>
      activeAndDraftRoutesForWeek.filter(r => {
        const d = getRouteDate(r);
        return d && isSameDay(d, day);
      }).length
    );
  }, [activeAndDraftRoutesForWeek, weekDays, getRouteDate]);

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
        departureDate: formPlannedDate,
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

  // ── Open Edit Route Modal ──
  const handleOpenEdit = (route: Route) => {
    setEditingRoute(route);
    setEditName(route.name);
    setEditTechnicianId(route.technicianId || "");
    setEditDriverId(route.driverId || "");
    setEditRouteType(route.routeType || "capital");
    const d = getRouteDate(route);
    setEditPlannedDate(d);
    const formatted = formatStopsToText(route.stops);
    setEditText(formatted);
    setEditParsedPreview(route.stops);
    setIsEditOpen(true);
  };

  const handleEditTextChange = (v: string) => {
    setEditText(v);
    const stops = parseRouteText(v);
    setEditParsedPreview(stops);
  };

  const handleSaveEdit = async () => {
    if (!editingRoute) return;
    if (!editName.trim() || editParsedPreview.length === 0) {
      toast({ variant: "destructive", title: "Preencha o nome e mantenha pelo menos 1 parada válida." });
      return;
    }
    setIsUpdatingRoute(true);
    try {
      const tech = technicians.find(t => t.id === editTechnicianId);
      const driver = drivers.find(d => d.id === editDriverId);

      await routeService.update(editingRoute.id, {
        name: editName.trim(),
        stops: editParsedPreview,
        plannedDate: editPlannedDate,
        departureDate: editPlannedDate,
        routeType: editRouteType,
        technicianId: tech?.id || "",
        technicianName: tech?.name || "",
        driverId: driver?.id || "",
        driverName: driver?.name || "",
        driverPhone: (driver as any)?.phone || "",
      });

      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'active'] });
      await queryClient.invalidateQueries({ queryKey: ['routes'] });

      if (selectedRoute?.id === editingRoute.id) {
        setSelectedRoute({
          ...editingRoute,
          name: editName.trim(),
          stops: editParsedPreview,
          plannedDate: editPlannedDate,
          departureDate: editPlannedDate,
          routeType: editRouteType,
          technicianId: tech?.id || "",
          technicianName: tech?.name || "",
          driverId: driver?.id || "",
          driverName: driver?.name || "",
        });
      }

      toast({ title: "Rota atualizada com sucesso!" });
      setIsEditOpen(false);
      setEditingRoute(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar rota", description: e.message });
    } finally {
      setIsUpdatingRoute(false);
    }
  };

  // ── Duplicate / Copy Route ──
  const handleDuplicateRoute = async (route: Route) => {
    setIsDuplicating(route.id);
    try {
      const copyName = `Cópia de ${route.name}`;
      await routeService.create({
        name: copyName,
        stops: route.stops,
        isActive: false,
        isDraft: true,
        plannedDate: getRouteDate(route),
        departureDate: getRouteDate(route),
        routeType: route.routeType || "capital",
        technicianId: route.technicianId,
        technicianName: route.technicianName,
        driverId: route.driverId,
        driverName: route.driverName,
        driverPhone: route.driverPhone,
        createdAt: new Date(),
      });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      await queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast({ title: "Rota copiada com sucesso!", description: `Criado rascunho "${copyName}".` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao copiar rota", description: e.message });
    } finally {
      setIsDuplicating(null);
    }
  };

  // ── Open AI Optimization Preview Modal ──
  const handleOpenOptimize = (route: Route) => {
    setOptimizingRoute(route);
    const initialOrigin = defaultBaseAddress || "Aracaju";
    setOriginCity(initialOrigin);
    const optimized = optimizeRouteStops(route.stops, initialOrigin);
    const summary = describeOptimization(route.stops, optimized, initialOrigin);
    setProposedStops(optimized);
    setOptimizationSummary(summary);
    setIsOptimizeOpen(true);
  };

  // ── Handle Origin Base Change ──
  const handleOriginChange = (newOrigin: string) => {
    setOriginCity(newOrigin);
    if (!optimizingRoute) return;
    const optimized = optimizeRouteStops(optimizingRoute.stops, newOrigin);
    const summary = describeOptimization(optimizingRoute.stops, optimized, newOrigin);
    setProposedStops(optimized);
    setOptimizationSummary(summary);
  };

  // ── Apply AI Optimization ──
  const handleApplyOptimization = async () => {
    if (!optimizingRoute) return;
    setIsOptimizing(true);
    try {
      await routeService.update(optimizingRoute.id, { stops: proposedStops });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'draft'] });
      await queryClient.invalidateQueries({ queryKey: ['routes', 'active'] });
      if (selectedRoute?.id === optimizingRoute.id) {
        setSelectedRoute({ ...optimizingRoute, stops: proposedStops });
      }
      toast({ title: "🤖 Otimização Aplicada!", description: optimizationSummary });
      setIsOptimizeOpen(false);
      setOptimizingRoute(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao otimizar", description: e.message });
    } finally {
      setIsOptimizing(false);
    }
  };

  // ── Publish ──
  const handlePublish = async (route: Route) => {
    setIsPublishing(route.id);
    try {
      await routeService.publishRoute(route.id, route.plannedDate);
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
                            {route.isDraft ? (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-50 border-amber-200 text-amber-700">
                                📝 Rascunho
                              </Badge>
                            ) : route.isActive ? (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-emerald-50 border-emerald-200 text-emerald-700">
                                🚀 Publicada
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-100 border-slate-300 text-slate-700">
                                🏁 Inativa
                              </Badge>
                            )}
                            {route.routeType && (
                              <Badge variant="outline" className={cn("text-[10px] py-0 px-1.5",
                                route.routeType === 'capital' ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-green-50 border-green-200 text-green-700"
                              )}>
                                {route.routeType === 'capital' ? '🏙️ Capital' : '🌿 Interior'}
                              </Badge>
                            )}
                            {getRouteDate(route) && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-50 border-slate-200 text-slate-700">
                                📅 {format(getRouteDate(route), 'EEE dd/MM', { locale: ptBR })}
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
                          className="h-7 text-xs gap-1"
                          title="Otimizar percurso via IA"
                          disabled={isOptimizing}
                          onClick={() => handleOpenOptimize(route)}
                        >
                          {isOptimizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-violet-500" />}
                          IA
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          title="Editar rota / paradas"
                          onClick={() => handleOpenEdit(route)}
                        >
                          <Edit className="h-3 w-3 text-blue-500" />
                          Editar
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 px-2"
                          title="Copiar/Duplicar rota"
                          disabled={isDuplicating === route.id}
                          onClick={() => handleDuplicateRoute(route)}
                        >
                          {isDuplicating === route.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3 text-amber-500" />}
                        </Button>

                        {route.isDraft ? (
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 flex-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={publishing}
                            onClick={() => handlePublish(route)}
                          >
                            {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Publicar
                          </Button>
                        ) : route.isActive ? (
                          <Badge variant="outline" className="h-7 text-xs gap-1 flex-1 justify-center bg-emerald-50 text-emerald-700 border-emerald-200">
                            ✓ Publicada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-7 text-xs gap-1 flex-1 justify-center bg-slate-100 text-slate-700 border-slate-300">
                            ✓ Inativa
                          </Badge>
                        )}

                        <Button
                          size="sm"
                          variant={route.isActive ? "outline" : "destructive"}
                          className={cn("h-7 text-xs px-2", route.isActive && "opacity-40 cursor-not-allowed")}
                          disabled={route.isActive}
                          title={route.isActive ? "Rotas já publicadas não podem ser excluídas" : "Excluir rascunho"}
                          onClick={() => {
                            if (route.isActive) return;
                            setRouteToDelete(route);
                            setIsDeleteOpen(true);
                          }}
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

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={open => { setIsEditOpen(open); if (!open) setEditingRoute(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-blue-500" />
              Editar Rota — {editingRoute?.name}
            </DialogTitle>
            <DialogDescription>
              Altere os detalhes da rota ou cole/modifique as paradas e ordens de serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label>Nome da Rota *</Label>
                <Input placeholder="Nome da Rota" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Rota</Label>
                <Select value={editRouteType} onValueChange={(v: any) => setEditRouteType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capital">🏙️ Capital</SelectItem>
                    <SelectItem value="interior">🌿 Interior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data Planejada</Label>
                <Popover open={editCalOpen} onOpenChange={setEditCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {editPlannedDate ? format(editPlannedDate, 'dd/MM/yyyy') : 'Selecionar data...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={editPlannedDate}
                      onSelect={d => { setEditPlannedDate(d); setEditCalOpen(false); }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>Técnico</Label>
                <Select value={editTechnicianId} onValueChange={setEditTechnicianId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Motorista</Label>
                <Select value={editDriverId} onValueChange={setEditDriverId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Texto das Visitas e Paradas (Tabela/Planilha) *
                {editParsedPreview.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-emerald-600">✓ {editParsedPreview.length} OSs válidas</span>
                )}
              </Label>
              <Textarea
                placeholder="Cole ou edite o conteúdo das paradas..."
                className="min-h-[180px] font-mono text-xs"
                value={editText}
                onChange={e => handleEditTextChange(e.target.value)}
              />
              {editParsedPreview.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1.5">Paradas reconhecidas ({editParsedPreview.length}):</p>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {editParsedPreview.map((s, i) => (
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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={isUpdatingRoute || !editName.trim() || editParsedPreview.length === 0} className="gap-2 bg-blue-600 hover:bg-blue-700">
              {isUpdatingRoute ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
              Salvar Alterações
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
      {/* ── AI Optimization Preview Dialog ── */}
      <Dialog open={isOptimizeOpen} onOpenChange={setIsOptimizeOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-5 w-5" />
              Pré-visualização da Otimização por IA
            </DialogTitle>
            <DialogDescription>
              Revise a nova ordem geográfica sugerida antes de aplicar à rota <span className="font-bold text-foreground">"{optimizingRoute?.name}"</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Ponto de Saída / Base Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="font-bold text-foreground">Ponto de Saída & Retorno (Base):</span>
              </div>
              <Select value={originCity} onValueChange={handleOriginChange}>
                <SelectTrigger className="w-full sm:w-[220px] h-8 text-xs bg-background">
                  <SelectValue placeholder="Selecione a base..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aracaju">📍 Aracaju (Base Principal)</SelectItem>
                  <SelectItem value="Maceió">📍 Maceió</SelectItem>
                  <SelectItem value="Arapiraca">📍 Arapiraca</SelectItem>
                  <SelectItem value="Campina Grande">📍 Campina Grande</SelectItem>
                  <SelectItem value="João Pessoa">📍 João Pessoa</SelectItem>
                  <SelectItem value="Recife">📍 Recife</SelectItem>
                  <SelectItem value="Salvador">📍 Salvador</SelectItem>
                  {routeCities.map(c => (
                    <SelectItem key={c} value={c}>📍 {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Optimization Summary Banner */}
            {(() => {
              const movedCount = proposedStops.filter((stop, i) => {
                const origIdx = optimizingRoute?.stops.findIndex(s => s.serviceOrder === stop.serviceOrder) ?? -1;
                return origIdx !== -1 && origIdx !== i;
              }).length;
              const unchangedCount = proposedStops.length - movedCount;

              return (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 dark:border-violet-900/50 dark:bg-violet-955/20 p-3 text-xs text-violet-900 dark:text-violet-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">🤖</span>
                    <div>
                      <p className="font-bold">Resumo da Otimização por IA:</p>
                      <p className="mt-0.5 text-violet-700 dark:text-violet-300">{optimizationSummary}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] shrink-0 self-end sm:self-auto font-medium">
                    <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800 font-bold">
                      ⚡ {movedCount} alteradas
                    </span>
                    <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 font-medium">
                      ✓ {unchangedCount} mantidas
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ordem Atual */}
              <div className="border rounded-xl p-3 bg-muted/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                  <span>Ordem Atual</span>
                  <span className="text-[10px] font-normal">{optimizingRoute?.stops.length} paradas</span>
                </h4>
                <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                  {optimizingRoute?.stops.map((stop, i) => {
                    const newIdx = proposedStops.findIndex(s => s.serviceOrder === stop.serviceOrder);
                    const oldPos = i + 1;
                    const newPos = newIdx !== -1 ? newIdx + 1 : oldPos;
                    const isMoved = oldPos !== newPos;

                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border bg-background text-xs transition-colors",
                          isMoved && "border-slate-300/80 bg-slate-50/50 dark:bg-slate-900/40 dark:border-slate-800"
                        )}
                      >
                        <span className="font-bold text-muted-foreground w-6 text-center text-xs shrink-0">#{oldPos}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-mono font-semibold truncate">{stop.serviceOrder}</p>
                            {isMoved && (
                              <span className="text-[9px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                                Vai p/ #{newPos}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{stop.city} — {stop.neighborhood}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Ordem Sugerida pela IA */}
              <div className="border border-violet-200 dark:border-violet-900/50 rounded-xl p-3 bg-violet-50/20 dark:bg-violet-955/10">
                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-2 flex items-center justify-between">
                  <span>Sugerido pela IA</span>
                  <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400 font-bold">✨ Otimizado</span>
                </h4>
                <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                  {proposedStops.map((stop, i) => {
                    const origIdx = optimizingRoute?.stops.findIndex(s => s.serviceOrder === stop.serviceOrder) ?? -1;
                    const oldPos = origIdx !== -1 ? origIdx + 1 : i + 1;
                    const newPos = i + 1;
                    const isMoved = oldPos !== newPos;
                    const posDiff = oldPos - newPos; // positive = moved up (earlier in route), negative = moved down

                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border text-xs shadow-sm transition-all duration-200",
                          isMoved
                            ? posDiff > 0
                              ? "border-emerald-400/80 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-955/40"
                              : "border-amber-400/80 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-955/40"
                            : "border-violet-200 dark:border-violet-900/60 bg-background"
                        )}
                      >
                        <span className={cn(
                          "font-black w-6 text-center text-xs shrink-0 py-0.5 rounded",
                          isMoved
                            ? posDiff > 0 ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                            : "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950"
                        )}>
                          #{newPos}
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-mono font-bold truncate flex items-center gap-1.5">
                              {stop.serviceOrder}
                              {stop.warrantyType === 'LP' && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] px-1 rounded font-bold">LP</span>
                              )}
                            </p>
                            {/* Movement indicator badge */}
                            {isMoved ? (
                              posDiff > 0 ? (
                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 flex items-center gap-0.5 shrink-0">
                                  ▲ Subiu (#{oldPos} ➔ #{newPos})
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800 flex items-center gap-0.5 shrink-0">
                                  ▼ Desceu (#{oldPos} ➔ #{newPos})
                                </span>
                              )
                            ) : (
                              <span className="text-[9px] text-muted-foreground font-medium shrink-0">
                                Mantida #{newPos}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            <span className="font-medium text-foreground">{stop.city}</span> — {stop.neighborhood}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsOptimizeOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleApplyOptimization} 
              disabled={isOptimizing}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aplicar Otimização ✅
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
