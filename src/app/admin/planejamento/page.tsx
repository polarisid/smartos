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

  // Ignorar rotas canceladas no export da planilha
  const validRoutes = routes.filter(r => !r.isCanceled);

  const capitalRoutes = validRoutes.filter(isCapital);
  const interiorRoutes = validRoutes.filter(r => !isCapital(r));

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
  // Expanded day OS panel (index of weekDay)
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(null);

  // Selected route for preview
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Header template
  const HEADER_TEMPLATE = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tDESCRICAO\tQTD";
  const [headerCopied, setHeaderCopied] = useState(false);
  const handleCopyHeader = () => {
    navigator.clipboard.writeText(HEADER_TEMPLATE).then(() => {
      setHeaderCopied(true);
      setTimeout(() => setHeaderCopied(false), 2000);
    });
  };

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

  // ── Date span calculation for selected route ──
  const selectedRouteSpan = useMemo(() => {
    if (!selectedRoute) return null;

    const dates: Date[] = [];
    const baseDate = getRouteDate(selectedRoute);
    if (baseDate) dates.push(new Date(baseDate));

    selectedRoute.stops.forEach(s => {
      if (s.firstVisitDate) {
        const parts = s.firstVisitDate.trim().split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
            dates.push(new Date(year, month, day));
          }
        } else if (s.firstVisitDate.includes('-')) {
          const p = parseISO(s.firstVisitDate);
          if (!isNaN(p.getTime())) dates.push(p);
        }
      }
    });

    if (dates.length === 0) return null;

    const timestamps = dates.map(d => d.getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const minDate = new Date(minTime);
    const maxDate = new Date(maxTime);

    const coveredIndices: number[] = [];
    const stopsCountPerDay: Record<number, number> = {};

    weekDays.forEach((day, idx) => {
      const dayStr = format(day, 'dd/MM/yyyy');
      const dayStrAlt = format(day, 'yyyy-MM-dd');
      const dayStrShort = format(day, 'dd/MM/yy');

      const stopsForThisDay = selectedRoute.stops.filter(s => {
        const fvd = (s.firstVisitDate || '').trim();
        return fvd === dayStr || fvd === dayStrAlt || fvd === dayStrShort;
      });

      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const minDayStart = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()).getTime();
      const maxDayStart = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()).getTime();

      const isInRange = dayStart >= minDayStart && dayStart <= maxDayStart;

      if (stopsForThisDay.length > 0 || isInRange) {
        coveredIndices.push(idx);
        stopsCountPerDay[idx] = stopsForThisDay.length;
      }
    });

    const isMultiDay = coveredIndices.length > 1 || !isSameDay(minDate, maxDate);

    return {
      minDate,
      maxDate,
      coveredIndices,
      stopsCountPerDay,
      totalDays: coveredIndices.length,
      isMultiDay,
      formattedRange: isSameDay(minDate, maxDate)
        ? format(minDate, "EEE, dd/MM", { locale: ptBR })
        : `${format(minDate, "EEE dd/MM", { locale: ptBR })} ➔ ${format(maxDate, "EEE dd/MM", { locale: ptBR })}`
    };
  }, [selectedRoute, weekDays, getRouteDate]);

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
    const validRoutes = routesForWeek.filter(r => !r.isCanceled);
    exportWeekToExcel(validRoutes, weekStart, weekEnd);
    toast({ title: "📥 Planilha gerada!", description: "O download foi iniciado." });
  };

  // ─── Derived week stats ────────────────────────────────────────────────────
  const weekStats = useMemo(() => ({
    total: activeAndDraftRoutesForWeek.length,
    published: activeAndDraftRoutesForWeek.filter(r => r.isActive).length,
    drafts: activeAndDraftRoutesForWeek.filter(r => r.isDraft).length,
    totalStops: activeAndDraftRoutesForWeek.reduce((s, r) => s + r.stops.length, 0),
  }), [activeAndDraftRoutesForWeek]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6 min-h-screen">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Planejamento de Rotas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Crie rascunhos e publique quando estiver pronto. As rotas ficam invisíveis aos técnicos até a publicação.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Baixar Semana (Excel)
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Rota
            </Button>
          </div>
        </div>

        {/* ── Week Stats Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/60 bg-card p-3.5 flex items-center gap-3 shadow-sm">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <MapPin className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-black text-foreground leading-none">{weekStats.total}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Rotas na semana</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/50 p-3.5 flex items-center gap-3 shadow-sm">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 leading-none">{weekStats.published}</p>
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">Publicadas</p>
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50 p-3.5 flex items-center gap-3 shadow-sm">
            <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Edit className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-amber-700 dark:text-amber-400 leading-none">{weekStats.drafts}</p>
              <p className="text-[11px] text-amber-600/80 dark:text-amber-500 mt-0.5">Rascunhos</p>
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900/50 p-3.5 flex items-center gap-3 shadow-sm">
            <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <Users className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-black text-blue-700 dark:text-blue-400 leading-none">{weekStats.totalStops}</p>
              <p className="text-[11px] text-blue-600/80 dark:text-blue-500 mt-0.5">Total de paradas</p>
            </div>
          </div>
        </div>

        {/* ── Week Navigator ── */}
        <Card className="border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setWeekOffset(w => w - 1); setSelectedDay(null); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="font-bold text-sm tracking-tight">
                {format(weekStart, "dd 'de' MMMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                {weekOffset === 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 uppercase tracking-wider">● Esta semana</span>}
                {weekOffset > 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-full px-2 py-0.5 uppercase tracking-wider">↑ Semana futura</span>}
                {weekOffset < 0 && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 rounded-full px-2 py-0.5 uppercase tracking-wider">↓ Semana passada</span>}
                {weekOffset !== 0 && (
                  <button onClick={() => { setWeekOffset(0); setSelectedDay(null); }} className="text-[10px] text-muted-foreground hover:text-primary underline ml-1">Hoje</button>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(null); }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* ── Route Extension Banner (shows when a route is clicked) ── */}
        {selectedRoute && selectedRouteSpan && (
          <div className="rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-indigo-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all animate-in fade-in duration-200 mb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs text-foreground truncate max-w-[300px]">
                    {selectedRoute.name}
                  </span>
                  {selectedRouteSpan.isMultiDay ? (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-600 text-white uppercase tracking-wider shadow-xs">
                      Multi-dia ({selectedRouteSpan.totalDays} dias na semana)
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 uppercase tracking-wider">
                      1 Dia
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Estende-se na semana de <strong className="text-foreground font-semibold">{selectedRouteSpan.formattedRange}</strong> · Total de {selectedRoute.stops.length} paradas
                </p>
              </div>
            </div>

            {/* Timeline Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              {weekDays.map((day, idx) => {
                const isCovered = selectedRouteSpan.coveredIndices.includes(idx);
                const stopsCount = selectedRouteSpan.stopsCountPerDay[idx] || 0;
                return (
                  <div
                    key={idx}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all border",
                      isCovered
                        ? "bg-violet-600 text-white border-violet-500 shadow-sm ring-2 ring-violet-400/40"
                        : "bg-muted/30 text-muted-foreground border-transparent opacity-40"
                    )}
                  >
                    <span>{format(day, 'EEE', { locale: ptBR }).slice(0, 3).toUpperCase()} {format(day, 'd')}</span>
                    {stopsCount > 0 && (
                      <span className="bg-white/20 text-white text-[9px] px-1.5 rounded-full font-black">
                        {stopsCount} OS
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Kanban Board: one column per day ── */}
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-cols-7 gap-3 min-w-[900px]">
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, new Date());
              const isWeekend = i >= 5;
              const dayRoutes = activeAndDraftRoutesForWeek.filter(r => {
                const d = getRouteDate(r);
                return d && isSameDay(d, day);
              });
              const totalStops = dayRoutes.reduce((s, r) => s + r.stops.length, 0);
              const isDayExpanded = expandedDayIndex === i;

              const isCoveredBySelected = selectedRouteSpan?.coveredIndices.includes(i);
              const stopsForSelectedOnDay = selectedRouteSpan?.stopsCountPerDay[i] || 0;

              return (
                <div key={i} className="flex flex-col gap-2 min-w-0">
                  {/* Day header — clickable to expand OS list */}
                  <button
                    onClick={() => setExpandedDayIndex(isDayExpanded ? null : i)}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-center border w-full transition-all duration-150 relative overflow-hidden",
                      isCoveredBySelected
                        ? "ring-2 ring-violet-500 border-violet-500 bg-violet-500/10 text-foreground shadow-md"
                        : isDayExpanded
                        ? "ring-2 ring-primary/40"
                        : isToday
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : isWeekend
                        ? "bg-muted/40 border-border/30 text-muted-foreground"
                        : "bg-card border-border/50 text-foreground hover:bg-muted/30"
                    )}
                  >
                    <p className={cn("text-[10px] uppercase tracking-widest font-bold opacity-70", (isToday || isCoveredBySelected) && "opacity-100")}>
                      {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                    </p>
                    <p className="text-xl font-black leading-tight">{format(day, 'd')}</p>
                    {isCoveredBySelected ? (
                      <p className="text-[9px] font-black text-violet-700 dark:text-violet-300 mt-0.5 bg-violet-500/20 py-0.5 rounded">
                        ⚡ Rota ativa ({stopsForSelectedOnDay} OS)
                      </p>
                    ) : dayRoutes.length > 0 ? (
                      <p className={cn("text-[10px] mt-0.5", isToday ? "opacity-80" : "text-muted-foreground")}>
                        {dayRoutes.length} rota{dayRoutes.length !== 1 ? 's' : ''} · {totalStops} par.
                      </p>
                    ) : (
                      <p className={cn("text-[10px] mt-0.5 opacity-40", isToday && "opacity-60")}>vazio</p>
                    )}
                  </button>

                  {/* Route mini-cards for this day */}
                  <div className="flex flex-col gap-2">
                    {dayRoutes.length === 0 ? (
                      <button
                        onClick={() => setIsCreateOpen(true)}
                        className="rounded-lg border-2 border-dashed border-border/30 py-5 text-center hover:border-primary/30 hover:bg-muted/20 transition-colors group"
                      >
                        <Plus className="h-4 w-4 mx-auto text-muted-foreground/40 group-hover:text-primary/50 transition-colors" />
                      </button>
                    ) : (
                      dayRoutes.map(route => {
                        const isSelected = selectedRoute?.id === route.id;
                        const publishing = isPublishing === route.id;
                        const lpCount = route.stops.filter(s => s.warrantyType === 'LP').length;
                        const isInterior = route.routeType === 'interior' || route.name?.toLowerCase().includes('interior');
                        const borderColor = route.isDraft
                          ? 'border-l-amber-400'
                          : route.isActive
                          ? 'border-l-emerald-500'
                          : 'border-l-slate-400';
                        return (
                          <div
                            key={route.id}
                            onClick={() => setSelectedRoute(isSelected ? null : route)}
                            className={cn(
                              "rounded-lg border border-l-4 cursor-pointer transition-all duration-150 overflow-hidden",
                              borderColor,
                              isSelected
                                ? "bg-violet-500/15 border-violet-500 shadow-md ring-2 ring-violet-500/50"
                                : "bg-card hover:shadow-sm hover:border-primary/20 border-border/40"
                            )}
                          >
                            <div className="px-2.5 pt-2 pb-2">
                              {/* Continuity banner for interior/multi-day routes */}
                              {isInterior && (
                                <div className="-mx-2.5 -mt-2 mb-2 px-2 py-0.5 bg-green-600/10 border-b border-green-500/20 flex items-center gap-1">
                                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                  <span className="text-[8px] font-bold text-green-700 dark:text-green-400 uppercase tracking-wider">Interior · multi-dia</span>
                                  <div className="ml-auto flex gap-0.5">
                                    {[0,1,2].map(d => <div key={d} className="h-1.5 w-1.5 rounded-full bg-green-400/60" />)}
                                    <div className="h-0.5 w-3 bg-green-400/40 rounded-full self-center" />
                                  </div>
                                </div>
                              )}
                              {/* Route name */}
                              <p className="font-bold text-[11px] leading-tight line-clamp-2 mb-1.5">{route.name}</p>

                              {/* Badges */}
                              <div className="flex flex-wrap gap-0.5 mb-2">
                                {route.isDraft ? (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">Rascunho</span>
                                ) : route.isActive ? (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">Publicada</span>
                                ) : (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Inativa</span>
                                )}
                                {route.routeType && (
                                  <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded",
                                    route.routeType === 'capital' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  )}>
                                    {route.routeType === 'capital' ? 'Capital' : 'Interior'}
                                  </span>
                                )}
                                {lpCount > 0 && (
                                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                                    ⚡{lpCount}LP
                                  </span>
                                )}
                              </div>

                              {/* Stats row */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex flex-col gap-0.5">
                                  {route.technicianName && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate max-w-[90px]">
                                      <Users className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{route.technicianName.split(' ')[0]}</span>
                                    </span>
                                  )}
                                  {route.driverName && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 truncate max-w-[90px]">
                                      <Truck className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{route.driverName.split(' ')[0]}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-lg font-black text-primary leading-none">{route.stops.length}</p>
                                  <p className="text-[8px] text-muted-foreground uppercase">par.</p>
                                </div>
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                <button
                                  className="flex-1 h-6 text-[9px] font-semibold rounded border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400 flex items-center justify-center gap-0.5 transition-colors"
                                  title="IA Otimizar"
                                  disabled={isOptimizing}
                                  onClick={() => handleOpenOptimize(route)}
                                >
                                  <Sparkles className="h-2.5 w-2.5" /> IA
                                </button>
                                <button
                                  className="flex-1 h-6 text-[9px] font-semibold rounded border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 flex items-center justify-center gap-0.5 transition-colors"
                                  onClick={() => handleOpenEdit(route)}
                                >
                                  <Edit className="h-2.5 w-2.5" /> Edit
                                </button>
                                <button
                                  className="h-6 w-6 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 flex items-center justify-center transition-colors"
                                  title="Duplicar"
                                  disabled={isDuplicating === route.id}
                                  onClick={() => handleDuplicateRoute(route)}
                                >
                                  {isDuplicating === route.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Copy className="h-2.5 w-2.5" />}
                                </button>
                                {!route.isActive && (
                                  <button
                                    className="h-6 w-6 rounded border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 flex items-center justify-center transition-colors"
                                    onClick={() => { setRouteToDelete(route); setIsDeleteOpen(true); }}
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                )}
                                {route.isDraft && (
                                  <button
                                    className="flex-1 h-6 text-[9px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-0.5 transition-colors"
                                    disabled={publishing}
                                    onClick={() => handlePublish(route)}
                                  >
                                    {publishing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                                    Pub.
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Expanded day OS panel — filtered by 1st Visit Date */}
                  {isDayExpanded && (() => {
                    const dayStr = format(day, 'dd/MM/yyyy');
                    const dayStrAlt = format(day, 'yyyy-MM-dd');
                    // Look across ALL week routes so multi-day interior routes are included
                    const stopsForDay: { routeName: string; stop: typeof activeAndDraftRoutesForWeek[0]['stops'][0] }[] = [];
                    activeAndDraftRoutesForWeek.forEach(r => {
                      r.stops.forEach(s => {
                        const fvd = (s.firstVisitDate || '').trim();
                        if (fvd === dayStr || fvd === dayStrAlt || fvd === format(day, 'dd/MM/yy')) {
                          stopsForDay.push({ routeName: r.name, stop: s });
                        }
                      });
                    });

                    if (stopsForDay.length === 0) return null;

                    // Group by route name for display
                    const grouped: Record<string, typeof stopsForDay> = {};
                    stopsForDay.forEach(item => {
                      if (!grouped[item.routeName]) grouped[item.routeName] = [];
                      grouped[item.routeName].push(item);
                    });

                    return (
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs">
                        <p className="font-bold text-[10px] text-primary uppercase tracking-wider mb-1.5">
                          {format(day, "EEEE dd/MM", { locale: ptBR })} — {stopsForDay.length} OS{stopsForDay.length !== 1 ? 's' : ''} programada{stopsForDay.length !== 1 ? 's' : ''}
                        </p>
                        {Object.entries(grouped).map(([routeName, items], gi) => (
                          <div key={gi} className="mb-2 last:mb-0">
                            <p className="font-semibold text-[10px] truncate text-foreground leading-tight mb-0.5 flex items-center gap-1">
                              <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                              {routeName}
                            </p>
                            <div className="space-y-0.5 pl-2">
                              {items.map(({ stop: s }, si) => (
                                <div key={si} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                  <span className="font-mono font-bold text-foreground shrink-0">{s.serviceOrder}</span>
                                  <span className="truncate">{s.consumerName}</span>
                                  {s.city && <span className="shrink-0 text-muted-foreground/60">· {s.city}</span>}
                                  {s.warrantyType === 'LP' && (
                                    <span className="shrink-0 font-bold text-orange-600">LP</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Route detail panel (shown when route is selected) ── */}
        {selectedRoute && (
          <div className="rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-border/40 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedRoute(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h3 className="font-bold text-sm leading-tight truncate">{selectedRoute.name}</h3>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5 ml-6">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{selectedRoute.stops.length} paradas
                  </span>
                  {selectedRoute.technicianName && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3" />{selectedRoute.technicianName}
                    </span>
                  )}
                  {selectedRoute.driverName && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3" />{selectedRoute.driverName}
                    </span>
                  )}
                  {selectedRoute.stops.filter(s => s.warrantyType === 'LP').length > 0 && (
                    <span className="text-[11px] font-bold text-orange-600 flex items-center gap-1">
                      ⚡ {selectedRoute.stops.filter(s => s.warrantyType === 'LP').length} LP
                    </span>
                  )}
                  {selectedRouteSpan && selectedRouteSpan.isMultiDay && (
                    <span className="text-[11px] font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {selectedRouteSpan.formattedRange} ({selectedRouteSpan.totalDays} dias)
                    </span>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs shrink-0 h-8" onClick={() => setShowMap(v => !v)}>
                {showMap ? <List className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                {showMap ? 'Lista' : 'Mapa'}
              </Button>
            </div>
            {showMap ? (
              <div className="h-72 overflow-hidden">
                <DynamicalRouteMap routes={[selectedRoute]} activeStops={[]} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm border-b border-border/40">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">OS</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Cliente</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Cidade / Bairro</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Modelo</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">TAT / Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {selectedRoute.stops.map((stop, i) => (
                      <tr key={i} className={cn("hover:bg-muted/30 transition-colors", i % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                        <td className="px-3 py-2">
                          <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-[11px] font-bold bg-muted/50 px-1.5 py-0.5 rounded">{stop.serviceOrder}</span>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium leading-tight max-w-[140px]">{stop.consumerName}</p>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <p className="font-medium text-foreground">{stop.city}</p>
                          {stop.neighborhood && <p className="text-[10px] opacity-60">{stop.neighborhood}</p>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[100px]">
                          <span className="block truncate">{stop.model}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5 items-start">
                            {stop.warrantyType && (
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md",
                                stop.warrantyType === 'LP'
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              )}>
                                {stop.warrantyType}
                              </span>
                            )}
                            {stop.tat && <span className="text-[10px] text-muted-foreground">{stop.tat}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
              <div className="flex items-center justify-between">
                <Label>
                  OSs da Planilha Samsung *
                  {parsedPreview.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">✓ {parsedPreview.length} OSs detectadas</span>
                  )}
                </Label>
                <button
                  type="button"
                  onClick={handleCopyHeader}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border transition-all duration-150",
                    headerCopied
                      ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {headerCopied ? (
                    <><CheckCircle2 className="h-3 w-3" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copiar cabeçalho padrão</>
                  )}
                </button>
              </div>
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
              <div className="flex items-center justify-between">
                <Label>
                  Texto das Visitas e Paradas (Tabela/Planilha) *
                  {editParsedPreview.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-emerald-600">✓ {editParsedPreview.length} OSs válidas</span>
                  )}
                </Label>
                <button
                  type="button"
                  onClick={handleCopyHeader}
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border transition-all duration-150",
                    headerCopied
                      ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                  )}
                >
                  {headerCopied ? (
                    <><CheckCircle2 className="h-3 w-3" /> Copiado!</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copiar cabeçalho padrão</>
                  )}
                </button>
              </div>
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
