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
import { optimizeRouteStops, optimizeRouteStopsAsync, describeOptimization } from "@/lib/routeOptimizer";
import { optimizeRouteWithGeminiAI } from "@/services/aiRouteService";
import { parseFullAddress, validateCepWithCityState, getCoordinates } from "@/lib/geocode";
import { copyRouteEmailToClipboard } from "@/lib/emailExport";
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Trash2, CheckCircle2,
  Sparkles, Download, MapPin, Calendar, Users, Truck,
  Eye, Loader2, List, Edit, Copy
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";

const DynamicalRouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });

// ─── Haversine fallback (used only when OSRM is unavailable) ──
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function geocodeStop(stop: RouteStop): Promise<[number, number] | null> {
  return getCoordinates(
    stop.city,
    stop.neighborhood,
    stop.state || 'Sergipe',
    stop.addressDetails,
    stop.zipCode
  );
}

async function geocodeBase(baseAddress: string): Promise<[number, number] | null> {
  const { city, state, street } = parseFullAddress(baseAddress);
  return getCoordinates(
    city || 'Aracaju',
    '',
    state || 'Sergipe',
    street || baseAddress
  );
}

/**
 * Busca distâncias REAIS de rodovia via OSRM Table API com suporte a múltiplos servidores e fallback.
 * Retorna km por trecho: [base→p1, p1→p2, ..., pN→base]
 */
async function fetchOsrmRoadDistances(
  stops: RouteStop[],
  baseAddress: string
): Promise<number[]> {
  const DEFAULT: [number, number] = [-10.9142, -37.0545]; // Base Aracaju

  const [baseCoord, ...stopCoords] = await Promise.all([
    geocodeBase(baseAddress),
    ...stops.map(geocodeStop),
  ]);

  const base = baseCoord ?? DEFAULT;
  const points: [number, number][] = [
    base,
    ...stopCoords.map(c => c ?? base),
    base,
  ];

  if (points.length < 2) return [];
  const n = points.length - 1;

  const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const sources = Array.from({ length: n }, (_, i) => i).join(';');
  const dests   = Array.from({ length: n }, (_, i) => i + 1).join(';');

  const osrmEndpoints = [
    process.env.NEXT_PUBLIC_OSRM_URL ? `${process.env.NEXT_PUBLIC_OSRM_URL.replace(/\/$/, '')}/table/v1/driving/` : null,
    `https://router.project-osrm.org/table/v1/driving/`,
    `https://routing.openstreetmap.de/routed-car/table/v1/driving/`
  ].filter(Boolean) as string[];

  for (const baseUrl of osrmEndpoints) {
    try {
      const url = `${baseUrl}${coordStr}?sources=${sources}&destinations=${dests}&annotations=distance`;
      const res  = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.code === 'Ok' && json.distances) {
          const resultKm = (json.distances as number[][]).map(row => Math.round(((row[0] ?? 0) / 1000) * 10) / 10);
          if (resultKm.some(km => km > 0)) {
            return resultKm;
          }
        }
      }
    } catch { /* try next endpoint */ }
  }

  // Fallback Haversine caso OSRM esteja indisponível no momento
  return Array.from({ length: n }, (_, i) => Math.round(haversineKm(points[i], points[i + 1]) * 10) / 10);
}


// ─── formatStopsToText (converts RouteStops back to TSV text format for editing) ──
function formatStopsToText(stops: RouteStop[]): string {
  if (!stops || stops.length === 0) return "";

  // Determine maximum number of parts across all stops (minimum 8 columns)
  let maxParts = 8;
  stops.forEach(s => {
    if (s.parts && s.parts.length > maxParts) {
      maxParts = s.parts.length;
    }
  });

  const baseHeaders = [
    "SO Nro.", "ASC Job No.", "Nome Consumidor", "Cidade", "Bairro", "UF", "CEP", "Modelo", "TURNO", "TAT", 
    "Data de Solicitação", "1st Visit Date", "TS", "OW/LP", "SPD", "Status comment"
  ];
  
  const partHeaders: string[] = [];
  for (let i = 0; i < maxParts; i++) {
    partHeaders.push("COD", "DESCRICAO", "QTD");
  }

  const header = [...baseHeaders, ...partHeaders].join("\t");

  const rows = stops.map(s => {
    const baseCols = [
      s.serviceOrder || "",
      s.ascJobNumber || "",
      s.consumerName || "",
      s.city || "",
      s.neighborhood || "",
      s.state || "",
      s.zipCode || "",
      s.model || "",
      s.turn || "",
      s.tat || "",
      s.requestDate || "",
      s.firstVisitDate || "",
      s.ts || "",
      s.warrantyType || "",
      s.productType || "",
      s.statusComment || ""
    ];

    const partCols: string[] = [];
    for (let i = 0; i < maxParts; i++) {
      const p = s.parts?.[i];
      partCols.push(
        p?.code || "",
        p?.description || "",
        p?.quantity != null ? String(p.quantity) : ""
      );
    }

    return [...baseCols, ...partCols].join("\t");
  });

  return [header, ...rows].join("\n");
}

// ─── getRouteDayInfo (calculates start/end and stops per day for minimal kanban cards) ──
function getRouteDayInfo(route: Route, day: Date) {
  const dayStr = format(day, 'dd/MM/yyyy');
  const dayStrAlt = format(day, 'yyyy-MM-dd');
  const dayStrShort = format(day, 'dd/MM/yy');

  const stopsForThisDay = route.stops.filter(s => {
    const fvd = (s.firstVisitDate || '').trim();
    return fvd === dayStr || fvd === dayStrAlt || fvd === dayStrShort;
  });

  const dates: Date[] = [];
  if (route.plannedDate) dates.push(new Date(route.plannedDate));
  if (route.departureDate) dates.push(new Date(route.departureDate));

  route.stops.forEach(s => {
    if (s.firstVisitDate) {
      const parts = s.firstVisitDate.trim().split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y >= 2020 && m >= 0 && m <= 11) {
          dates.push(new Date(y, m, d));
        }
      } else if (s.firstVisitDate.includes('-')) {
        const p = parseISO(s.firstVisitDate);
        if (!isNaN(p.getTime()) && p.getFullYear() >= 2020) dates.push(p);
      }
    }
  });

  if (dates.length === 0) {
    const base = route.plannedDate || route.departureDate || route.createdAt;
    if (base) dates.push(new Date(base));
  }

  const timestamps = dates.map(d => d.getTime());
  const minDate = new Date(Math.min(...timestamps));
  const maxDate = new Date(Math.max(...timestamps));

  const isSameMinMax = isSameDay(minDate, maxDate);
  const isStartDay = isSameDay(minDate, day);
  const isEndDay = isSameDay(maxDate, day);

  return {
    stopsTodayCount: stopsForThisDay.length,
    totalStopsCount: route.stops.length,
    isStartDay,
    isEndDay,
    isMultiDay: !isSameMinMax,
    minDate,
    maxDate
  };
}

// ─── parseRouteText (supports multiple parts COD/COD2/COD3... and flexible turn headers) ──
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

  const getIndex = (names: string | string[]) => {
    const nameList = Array.isArray(names) ? names : [names];
    for (const n of nameList) {
      const i = headers.indexOf(n.toLowerCase());
      if (i !== -1) return i;
    }
    for (const n of nameList) {
      const i = headers.findIndex(h => h.includes(n.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };

  const hi = {
    soNro: getIndex(['so nro.', 'so nro', 'ordem de servico', 'os', 'nro os', 'so']),
    ascJobNo: getIndex(['asc job no.', 'asc job no', 'asc job']),
    consumerName: getIndex(['nome consumidor', 'consumidor', 'cliente', 'nome cliente']),
    city: getIndex(['cidade', 'city']),
    neighborhood: getIndex(['bairro', 'bairro/distrito']),
    state: getIndex(['uf', 'estado', 'st']),
    zipCode: getIndex(['cep', 'codigo postal', 'zip', 'zip code', 'zipcode']),
    model: getIndex(['modelo', 'model']),
    turn: getIndex(['turno', 'turno atendimento', 'turno atend.', 'periodo', 'período', 'horario', 'horário']),
    tat: getIndex(['tat']),
    requestDate: getIndex(['data de solicitação', 'data solicitacao', 'data sol']),
    firstVisitDate: getIndex(['1st visit date', 'primeira visita', 'data visita', 'agendamento']),
    ts: getIndex(['ts']),
    warrantyType: getIndex(['ow/lp', 'garantia', 'tipo garantia']),
    productType: getIndex(['spd', 'produto', 'tipo produto']),
    statusComment: getIndex(['status comment', 'status', 'comentario']),
  };

  const partColumns: { codeIndex: number; qtyIndex?: number; descIndex?: number }[] = [];

  headers.forEach((header, index) => {
    const cleanHeader = header.replace(/[^a-z0-9]/g, '');
    const isCodHeader = cleanHeader.startsWith('cod') || cleanHeader.startsWith('codigo');

    if (isCodHeader) {
      const codeIndex = index;
      let qtyIndex: number | undefined = undefined;
      let descIndex: number | undefined = undefined;

      for (let offset = 1; offset <= 3; offset++) {
        const nextHeader = (headers[index + offset] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!nextHeader) break;

        if (nextHeader.startsWith('desc')) {
          descIndex = index + offset;
        } else if (nextHeader.startsWith('qtd') || nextHeader.startsWith('quant')) {
          qtyIndex = index + offset;
        }
      }

      partColumns.push({ codeIndex, qtyIndex, descIndex });
    }
  });

  return lines.map(line => {
    const cols = getColumns(line);
    const so = hi.soNro !== -1 ? cols[hi.soNro]?.trim() : cols[0]?.trim();
    if (!so || so.toLowerCase().includes('so nro')) return null;

    const parts: RoutePart[] = [];
    partColumns.forEach(pc => {
      const code = cols[pc.codeIndex]?.trim();
      if (!code) return;

      let quantity = 1;
      if (pc.qtyIndex !== undefined) {
        const rawQty = parseInt(cols[pc.qtyIndex]?.trim() || '', 10);
        if (!isNaN(rawQty) && rawQty > 0) {
          quantity = rawQty;
        }
      }

      const description = pc.descIndex !== undefined ? (cols[pc.descIndex]?.trim() || '') : '';

      if (!parts.some(p => p.code === code)) {
        parts.push({
          code,
          description,
          quantity,
          trackingCode: ''
        });
      }
    });

    return {
      serviceOrder: so,
      ascJobNumber: hi.ascJobNo !== -1 ? (cols[hi.ascJobNo]?.trim() || '') : '',
      consumerName: hi.consumerName !== -1 ? (cols[hi.consumerName]?.trim() || '') : '',
      city: hi.city !== -1 ? (cols[hi.city]?.trim() || '') : '',
      neighborhood: hi.neighborhood !== -1 ? (cols[hi.neighborhood]?.trim() || '') : '',
      state: hi.state !== -1 ? (cols[hi.state]?.trim() || '') : '',
      zipCode: hi.zipCode !== -1 ? (cols[hi.zipCode]?.trim() || '') : '',
      model: hi.model !== -1 ? (cols[hi.model]?.trim() || '') : '',
      turn: hi.turn !== -1 ? (cols[hi.turn]?.trim() || '') : '',
      tat: hi.tat !== -1 ? (cols[hi.tat]?.trim() || '') : '',
      requestDate: hi.requestDate !== -1 ? (cols[hi.requestDate]?.trim() || '') : '',
      firstVisitDate: hi.firstVisitDate !== -1 ? (cols[hi.firstVisitDate]?.trim() || '') : '',
      ts: hi.ts !== -1 ? (cols[hi.ts]?.trim() || '') : '',
      warrantyType: hi.warrantyType !== -1 ? (cols[hi.warrantyType]?.trim() || '') : '',
      productType: hi.productType !== -1 ? (cols[hi.productType]?.trim() || '') : '',
      statusComment: hi.statusComment !== -1 ? (cols[hi.statusComment]?.trim() || '') : '',
      parts,
      stopType: 'padrao' as const,
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
    'SO Nro.', 'MSG', 'LIG', 'ASC Job No.', 'Nome Consumidor', 'Cidade', 'Bairro', 'UF', 'CEP', 'Modelo', 'TURNO', 'TAT', 
    'Data de Solicitação', '1st Visit Date', 'TS', 'OW/LP', 'SPD', 'Status comment',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD',
    'COD', 'DESCRICAO', 'QTD',
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
        const p5 = stop.parts?.[5];
        const p6 = stop.parts?.[6];
        const p7 = stop.parts?.[7];

        const rowVals = [
          stop.serviceOrder || '',
          stop.confirmedByMessage ? 'OK' : '',
          stop.confirmedByCall ? 'OK' : '',
          stop.ascJobNumber || '',
          stop.consumerName || '',
          stop.city || '',
          stop.neighborhood || '',
          stop.state || '',
          stop.zipCode || '',
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
          p5?.code || '', p5?.description || '', p5?.quantity != null ? p5.quantity : '',
          p6?.code || '', p6?.description || '', p6?.quantity != null ? p6.quantity : '',
          p7?.code || '', p7?.description || '', p7?.quantity != null ? p7.quantity : '',
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
  const [copiedDayIndex, setCopiedDayIndex] = useState<number | null>(null);
  const [isTracksExpanded, setIsTracksExpanded] = useState(false);

  // Selected route for preview
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Header template
  const HEADER_TEMPLATE = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tCEP\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD";
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
  const [optimizeViewTab, setOptimizeViewTab] = useState<'list' | 'map'>('list');

  // Real OSRM road distances state
  const [origSegsKm, setOrigSegsKm] = useState<number[]>([]);
  const [propSegsKm, setPropSegsKm] = useState<number[]>([]);
  const [segsLoading, setSegsLoading] = useState(false);

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
        const { city } = parseFullAddress(base);
        setOriginCity(city || base);
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
  const [editDepartureDate, setEditDepartureDate] = useState<Date | undefined>(undefined);
  const [editArrivalDate, setEditArrivalDate] = useState<Date | undefined>(undefined);
  const [editLicensePlate, setEditLicensePlate] = useState("");
  const [editFuelAvgKml, setEditFuelAvgKml] = useState<number>(10);
  const [editCalOpen, setEditCalOpen] = useState(false);
  const [editDepCalOpen, setEditDepCalOpen] = useState(false);
  const [editArrCalOpen, setEditArrCalOpen] = useState(false);
  const [editParsedPreview, setEditParsedPreview] = useState<RouteStop[]>([]);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);

  // Helper: Get true operational date of route (plannedDate → departureDate → firstVisitDate → createdAt)
  const getRouteDate = useCallback((r: Route): Date => {
    if (r.plannedDate) return new Date(r.plannedDate);
    if (r.departureDate) return new Date(r.departureDate);

    if (r.stops && r.stops.length > 0) {
      for (const s of r.stops) {
        if (s.firstVisitDate) {
          const parts = s.firstVisitDate.trim().split('/');
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;
            if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year >= 2020 && month >= 0 && month <= 11) {
              return new Date(year, month, day);
            }
          } else if (s.firstVisitDate.includes('-')) {
            try {
              const d = parseISO(s.firstVisitDate);
              if (!isNaN(d.getTime())) return d;
            } catch {}
          }
        }
      }
    }

    return new Date(r.createdAt);
  }, []);

  // ── Filter ALL routes (Drafts + Active + Inactive) for current week ──
  const routesForWeek = useMemo(() => {
    const start = weekStart;
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);

    const parseFvd = (fvd: string): Date | null => {
      const parts = fvd.trim().split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return new Date(year, month, day);
      }
      if (fvd.includes('-')) {
        try { const d = parseISO(fvd); if (!isNaN(d.getTime())) return d; } catch {}
      }
      return null;
    };

    return allRoutes.filter(r => {
      const routeDate = getRouteDate(r);
      // Check if route's own planned/departure date is in the week
      if (routeDate && routeDate >= start && routeDate <= end) return true;
      // Check if any stop's firstVisitDate falls in the week
      if (r.stops?.some(s => {
        if (!s.firstVisitDate) return false;
        const d = parseFvd(s.firstVisitDate);
        return d && d >= start && d <= end;
      })) return true;
      // Fallback: current week shows routes without any date
      if (!routeDate && weekOffset === 0) return true;
      return false;
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

    // 1. Collect operational dates ONLY (do NOT use createdAt!)
    if (selectedRoute.plannedDate) dates.push(new Date(selectedRoute.plannedDate));
    if (selectedRoute.departureDate) dates.push(new Date(selectedRoute.departureDate));
    if (selectedRoute.arrivalDate) dates.push(new Date(selectedRoute.arrivalDate));

    selectedRoute.stops.forEach(s => {
      if (s.firstVisitDate) {
        const parts = s.firstVisitDate.trim().split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          let year = parseInt(parts[2], 10);
          if (year < 100) year += 2000;
          if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year >= 2026 && month >= 0 && month <= 11) {
            dates.push(new Date(year, month, day));
          }
        } else if (s.firstVisitDate.includes('-')) {
          const p = parseISO(s.firstVisitDate);
          if (!isNaN(p.getTime()) && p.getFullYear() >= 2026) dates.push(p);
        }
      }
    });

    if (dates.length === 0) return null;

    const timestamps = dates.map(d => d.getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const minDate = new Date(minTime);
    const maxDate = new Date(maxTime);

    const isSameDayStartEnd = isSameDay(minDate, maxDate);

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

      const isExactDateMatch = (selectedRoute.plannedDate && isSameDay(new Date(selectedRoute.plannedDate), day)) ||
                               (selectedRoute.departureDate && isSameDay(new Date(selectedRoute.departureDate), day));

      let isCovered = false;

      if (isSameDayStartEnd) {
        // Single day route: only cover if exact date match or has stops for this day
        isCovered = stopsForThisDay.length > 0 || isExactDateMatch || isSameDay(minDate, day);
      } else {
        // Multi-day route: cover days in the range minDate -> maxDate
        isCovered = stopsForThisDay.length > 0 || (dayStart >= minDayStart && dayStart <= maxDayStart);
      }

      if (isCovered) {
        coveredIndices.push(idx);
        stopsCountPerDay[idx] = stopsForThisDay.length;
      }
    });

    const isMultiDay = coveredIndices.length > 1 && !isSameDayStartEnd;

    return {
      minDate,
      maxDate,
      coveredIndices,
      stopsCountPerDay,
      totalDays: coveredIndices.length,
      isMultiDay,
      formattedRange: isSameDayStartEnd
        ? format(minDate, "EEE, dd/MM", { locale: ptBR })
        : `${format(minDate, "EEE dd/MM", { locale: ptBR })} ➔ ${format(maxDate, "EEE dd/MM", { locale: ptBR })}`
    };
  }, [selectedRoute, weekDays]);

  // ── List of multi-day routes in current week, sorted by total stops descending ──
  const multiDayRoutes = useMemo(() => {
    return activeAndDraftRoutesForWeek
      .filter(r => getRouteDayInfo(r, weekDays[0]).isMultiDay)
      .sort((a, b) => b.stops.length - a.stops.length);
  }, [activeAndDraftRoutesForWeek, weekDays]);

  // ── Parse text preview & validate CEP vs City/UF ──
  const handleTextChange = useCallback(async (v: string) => {
    setFormText(v);
    const stops = parseRouteText(v);
    setParsedPreview(stops);

    // Asynchronously validate CEP mismatch for each stop
    const validatedStops = await Promise.all(stops.map(async (stop) => {
      if (stop.zipCode) {
        const val = await validateCepWithCityState(stop.zipCode, stop.city, stop.state);
        if (val.mismatch) {
          return {
            ...stop,
            zipMismatch: true,
            zipMismatchDetails: val.details,
            suggestedCityState: `${val.suggestedCity}-${val.suggestedState}`
          };
        }
      }
      return stop;
    }));

    setParsedPreview(validatedStops);
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
  const handleOpenEdit = async (route: Route) => {
    setEditingRoute(route);
    setEditName(route.name);
    setEditTechnicianId(route.technicianId || "");
    setEditDriverId(route.driverId || "");
    setEditRouteType(route.routeType || "capital");
    const d = getRouteDate(route);
    setEditPlannedDate(d);
    setEditDepartureDate(route.departureDate || d);
    setEditArrivalDate(route.arrivalDate || route.departureDate || d);
    setEditLicensePlate(route.licensePlate || "TEM8E13");
    setEditFuelAvgKml(route.fuelAvgKml || 10);
    const formatted = formatStopsToText(route.stops);
    setEditText(formatted);
    setEditParsedPreview(route.stops);
    setIsEditOpen(true);

    // Validate stops on open
    const validatedStops = await Promise.all(route.stops.map(async (stop) => {
      if (stop.zipCode) {
        const val = await validateCepWithCityState(stop.zipCode, stop.city, stop.state);
        if (val.mismatch) {
          return {
            ...stop,
            zipMismatch: true,
            zipMismatchDetails: val.details,
            suggestedCityState: `${val.suggestedCity}-${val.suggestedState}`
          };
        }
      }
      return stop;
    }));
    setEditParsedPreview(validatedStops);
  };

  const handleEditTextChange = async (v: string) => {
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
        departureDate: editDepartureDate || editPlannedDate,
        arrivalDate: editArrivalDate || editDepartureDate || editPlannedDate,
        licensePlate: editLicensePlate.trim(),
        fuelAvgKml: editFuelAvgKml || 10,
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
          departureDate: editDepartureDate || editPlannedDate,
          arrivalDate: editArrivalDate || editDepartureDate || editPlannedDate,
          licensePlate: editLicensePlate.trim(),
          fuelAvgKml: editFuelAvgKml || 10,
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

  // ── Open AI Optimization Preview Modal with Persistent Caching ──
  const handleOpenOptimize = async (route: Route, forceRefresh = false) => {
    setOptimizingRoute(route);
    const initialOrigin = defaultBaseAddress || "Aracaju";
    setOriginCity(initialOrigin);

    const cacheKey = `opt_saved_${route.id}_${initialOrigin}`;

    // 1. Check persistent cache unless user explicitly requested forceRefresh
    if (!forceRefresh && typeof window !== 'undefined') {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.stops && parsed.origKm && parsed.propKm && parsed.stops.length === route.stops.length) {
            setProposedStops(parsed.stops);
            setOptimizationSummary(parsed.summary || "Circuito rodoviário otimizado (carregado da última salvação).");
            setOrigSegsKm(parsed.origKm);
            setPropSegsKm(parsed.propKm);
            setIsOptimizeOpen(true);
            return;
          }
        } catch (e) {}
      }
    }

    // 2. Initialize modal with current stops to avoid blank states
    setProposedStops(route.stops);
    setOptimizationSummary("Calculando circuito rodoviário ideal via OSRM e IA...");
    setOrigSegsKm([]);
    setPropSegsKm([]);
    setIsOptimizeOpen(true);

    setSegsLoading(true);
    try {
      const osrmResult = await optimizeRouteStopsAsync(route.stops, initialOrigin);
      let finalStops = osrmResult.stops;
      let finalSummary = osrmResult.summary;

      const [origKm, propKm] = await Promise.all([
        fetchOsrmRoadDistances(route.stops, initialOrigin),
        fetchOsrmRoadDistances(osrmResult.stops, initialOrigin),
      ]);

      let finalPropKm = propKm;

      const aiResult = await optimizeRouteWithGeminiAI(route.stops, initialOrigin);
      if (aiResult) {
        finalStops = aiResult.stops;
        finalSummary = aiResult.summary;
        finalPropKm = await fetchOsrmRoadDistances(aiResult.stops, initialOrigin);
      }

      setProposedStops(finalStops);
      setOptimizationSummary(finalSummary);
      setOrigSegsKm(origKm);
      setPropSegsKm(finalPropKm);

      // Save permanently to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify({
          stops: finalStops,
          summary: finalSummary,
          origKm,
          propKm: finalPropKm
        }));
      }
    } finally {
      setSegsLoading(false);
    }
  };

  // ── Handle Origin Base Change ──
  const handleOriginChange = async (newOrigin: string) => {
    setOriginCity(newOrigin);
    if (!optimizingRoute) return;

    const osrmResult = await optimizeRouteStopsAsync(optimizingRoute.stops, newOrigin);
    setProposedStops(osrmResult.stops);
    setOptimizationSummary(osrmResult.summary);

    // Re-fetch distances with new base
    setSegsLoading(true);
    try {
      const [origKm, propKm] = await Promise.all([
        fetchOsrmRoadDistances(optimizingRoute.stops, newOrigin),
        fetchOsrmRoadDistances(osrmResult.stops, newOrigin),
      ]);
      setOrigSegsKm(origKm);
      setPropSegsKm(propKm);
    } finally {
      setSegsLoading(false);
    }

    const aiResult = await optimizeRouteWithGeminiAI(optimizingRoute.stops, newOrigin);
    if (aiResult) {
      setProposedStops(aiResult.stops);
      setOptimizationSummary(aiResult.summary);
      setSegsLoading(true);
      try {
        const propKm2 = await fetchOsrmRoadDistances(aiResult.stops, newOrigin);
        setPropSegsKm(propKm2);
      } finally {
        setSegsLoading(false);
      }
    }
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

        {/* ── Multi-Day Route Linear Tracks Matrix (Gantt View) ── */}
        {multiDayRoutes.length > 0 && (
          <Card className="border-border/60 bg-card p-3 overflow-hidden shadow-xs">
            <div
              onClick={() => setIsTracksExpanded(v => !v)}
              className="flex items-center justify-between cursor-pointer group select-none"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🛤️</span>
                <div>
                  <h3 className="font-extrabold text-xs tracking-tight text-foreground uppercase group-hover:text-primary transition-colors flex items-center gap-2">
                    Linhas de Percurso Multi-dia ({multiDayRoutes.length})
                    <span className="text-[9px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full normal-case">
                      {isTracksExpanded ? "Recolher visão linear" : "Clique para expandir visão linear"}
                    </span>
                  </h3>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 font-bold">
                {isTracksExpanded ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Minimizar</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Expandir Visão Linear</>
                )}
              </Button>
            </div>

            {isTracksExpanded && (
              <div className="mt-3 pt-3 border-t border-border/40 overflow-x-auto animate-in fade-in duration-200">
                <div className="min-w-[850px] space-y-2">
                  {/* Header Days Row */}
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-extrabold text-muted-foreground px-2">
                    <div className="col-span-3">ROTA / TÉCNICO</div>
                    <div className="col-span-9 grid grid-cols-7 gap-1 text-center">
                      {weekDays.map((d, idx) => (
                        <span key={idx} className={cn("text-[9px] uppercase tracking-wider", isSameDay(d, new Date()) && "text-primary font-black")}>
                          {format(d, 'EEE d', { locale: ptBR })}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Route Tracks */}
                  {multiDayRoutes.map((r) => {
                    const isSelected = selectedRoute?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRoute(isSelected ? null : r)}
                        className={cn(
                          "grid grid-cols-12 gap-2 items-center p-2 rounded-xl border transition-all cursor-pointer",
                          isSelected
                            ? "bg-violet-500/15 border-violet-500 shadow-md ring-2 ring-violet-500/40"
                            : "bg-muted/20 hover:bg-muted/40 border-border/40"
                        )}
                      >
                        {/* Left Title */}
                        <div className="col-span-3 min-w-0 pr-1">
                          <div className="flex items-center gap-1 mb-0.5">
                            <p className="font-extrabold text-[11px] text-foreground truncate">{r.name}</p>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {r.technicianName && <span className="truncate">👤 {r.technicianName.split(' ')[0]}</span>}
                            <span className="font-extrabold text-primary shrink-0">{r.stops.length} OS total</span>
                          </div>
                        </div>

                        {/* Right 7-Day Linear Segment Track */}
                        <div className="col-span-9 grid grid-cols-7 gap-1">
                          {weekDays.map((d, idx) => {
                            const dayInfo = getRouteDayInfo(r, d);
                            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                            const minDayStart = new Date(dayInfo.minDate.getFullYear(), dayInfo.minDate.getMonth(), dayInfo.minDate.getDate()).getTime();
                            const maxDayStart = new Date(dayInfo.maxDate.getFullYear(), dayInfo.maxDate.getMonth(), dayInfo.maxDate.getDate()).getTime();

                            const isCovered = dayStart >= minDayStart && dayStart <= maxDayStart;
                            const isStart = isSameDay(dayInfo.minDate, d);
                            const isEnd = isSameDay(dayInfo.maxDate, d);

                            if (!isCovered) {
                              return (
                                <div key={idx} className="h-7 rounded-md bg-muted/10 border border-dashed border-border/20 flex items-center justify-center opacity-30">
                                  <span className="text-[8px] text-muted-foreground">·</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "h-7 rounded-md flex flex-col items-center justify-center px-1 text-[9px] font-bold transition-all relative border",
                                  isStart
                                    ? "bg-violet-600 text-white border-violet-500 shadow-xs"
                                    : isEnd
                                    ? "bg-emerald-600 text-white border-emerald-500 shadow-xs"
                                    : "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/30"
                                )}
                              >
                                <span className="font-black text-[9px] leading-tight">
                                  {dayInfo.stopsTodayCount > 0 ? `${dayInfo.stopsTodayCount} OS` : 'Trânsito'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        )}

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
              const dayStr = format(day, 'dd/MM/yyyy');
              const dayStrAlt = format(day, 'yyyy-MM-dd');
              const dayStrShort = format(day, 'dd/MM/yy');

              const unfilteredDayRoutes = activeAndDraftRoutesForWeek.filter(r => {
                const dayInfo = getRouteDayInfo(r, day);
                if (dayInfo.isStartDay || dayInfo.stopsTodayCount > 0) return true;
                if (dayInfo.isMultiDay) {
                  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
                  const minDayStart = new Date(dayInfo.minDate.getFullYear(), dayInfo.minDate.getMonth(), dayInfo.minDate.getDate()).getTime();
                  const maxDayStart = new Date(dayInfo.maxDate.getFullYear(), dayInfo.maxDate.getMonth(), dayInfo.maxDate.getDate()).getTime();
                  return dayStart >= minDayStart && dayStart <= maxDayStart;
                }
                return false;
              });

              // Sort multi-day routes to top of columns to align horizontal tracks cleanly
              const dayRoutes = [...unfilteredDayRoutes].sort((a, b) => {
                const infoA = getRouteDayInfo(a, day);
                const infoB = getRouteDayInfo(b, day);

                if (infoA.isMultiDay && !infoB.isMultiDay) return -1;
                if (!infoA.isMultiDay && infoB.isMultiDay) return 1;

                if (infoA.isMultiDay && infoB.isMultiDay) {
                  if (b.stops.length !== a.stops.length) return b.stops.length - a.stops.length;
                  return (a.name || '').localeCompare(b.name || '');
                }

                return (a.name || '').localeCompare(b.name || '');
              });

              let dayStopsCount = 0;
              activeAndDraftRoutesForWeek.forEach(r => {
                const rDate = getRouteDate(r);
                const routeIsOnThisDay = rDate && isSameDay(rDate, day);

                r.stops.forEach(s => {
                  const fvd = (s.firstVisitDate || '').trim();
                  if (fvd === dayStr || fvd === dayStrAlt || fvd === dayStrShort) {
                    dayStopsCount++;
                  } else if (!fvd && routeIsOnThisDay) {
                    dayStopsCount++;
                  }
                });
              });

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
                    ) : dayStopsCount > 0 || dayRoutes.length > 0 ? (
                      <p className={cn("text-[10px] mt-0.5", isToday ? "opacity-80" : "text-muted-foreground")}>
                        {dayRoutes.length > 0 ? `${dayRoutes.length} rota${dayRoutes.length !== 1 ? 's' : ''} · ` : ''}{dayStopsCount} par.
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
                        const dayInfo = getRouteDayInfo(route, day);
                        const isSelected = selectedRoute?.id === route.id;
                        const publishing = isPublishing === route.id;
                        const lpCount = route.stops.filter(s => s.warrantyType === 'LP').length;

                        {/* ── Minimal Continuation Chip for multi-day route ── */}
                        if (dayInfo.isMultiDay && !dayInfo.isStartDay) {
                          return (
                            <div
                              key={route.id}
                              onClick={() => setSelectedRoute(isSelected ? null : route)}
                              className={cn(
                                "rounded-lg border-2 border-l-4 cursor-pointer transition-all duration-150 p-2 text-xs overflow-hidden",
                                dayInfo.isEndDay
                                  ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                                  : "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40",
                                isSelected
                                  ? "ring-2 ring-violet-500 border-violet-500 shadow-md bg-violet-500/15"
                                  : "hover:border-primary/40 hover:shadow-xs"
                              )}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className={cn(
                                  "text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1",
                                  dayInfo.isEndDay
                                    ? "bg-emerald-600 text-white"
                                    : "bg-blue-600 text-white"
                                )}>
                                  {dayInfo.isEndDay ? "🏁 Término" : "🔄 Percurso"}
                                </span>
                                <span className="text-[10px] font-black text-foreground">
                                  {dayInfo.stopsTodayCount > 0 ? `${dayInfo.stopsTodayCount} OS hoje` : 'Em trânsito'}
                                </span>
                              </div>

                              <p className="font-bold text-[11px] leading-tight truncate text-foreground mb-1">
                                {route.name}
                              </p>

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
                                {route.technicianName && (
                                  <span className="flex items-center gap-0.5 truncate max-w-[100px]">
                                    <Users className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">{route.technicianName.split(' ')[0]}</span>
                                  </span>
                                )}
                                <span className="text-[9px] opacity-70">
                                  ({route.stops.length} total)
                                </span>
                              </div>
                            </div>
                          );
                        }

                        {/* ── Primary Full Card (start day or single day) ── */}
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
                              {/* Multi-day Start Banner */}
                              {dayInfo.isMultiDay && (
                                <div className="-mx-2.5 -mt-2 mb-2 px-2 py-0.5 bg-violet-600/15 border-b border-violet-500/30 flex items-center justify-between gap-1">
                                  <span className="text-[8px] font-black text-violet-700 dark:text-violet-300 uppercase tracking-wider">
                                    🚩 Início Rota Multi-dia
                                  </span>
                                  <span className="text-[8px] font-bold text-violet-600 dark:text-violet-400">
                                    {format(dayInfo.minDate, 'dd/MM')} ➔ {format(dayInfo.maxDate, 'dd/MM')}
                                  </span>
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
                                  <p className="text-lg font-black text-primary leading-none">
                                    {dayInfo.stopsTodayCount > 0 && dayInfo.isMultiDay ? dayInfo.stopsTodayCount : route.stops.length}
                                  </p>
                                  <p className="text-[8px] text-muted-foreground uppercase">
                                    {dayInfo.isMultiDay ? `par. hoje (${route.stops.length} total)` : 'paradas'}
                                  </p>
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
                        <div className="flex items-center justify-between gap-1 mb-1.5 pb-1 border-b border-primary/10">
                          <p className="font-bold text-[10px] text-primary uppercase tracking-wider">
                            {format(day, "EEEE dd/MM", { locale: ptBR })} — {stopsForDay.length} OS{stopsForDay.length !== 1 ? 's' : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              const textToCopy = stopsForDay.map(item => item.stop.serviceOrder).filter(Boolean).join('\n');
                              navigator.clipboard.writeText(textToCopy).then(() => {
                                setCopiedDayIndex(i);
                                toast({ title: "OSs copiadas!", description: `${stopsForDay.length} ordens de serviço copiadas (uma por linha).` });
                                setTimeout(() => setCopiedDayIndex(null), 2000);
                              });
                            }}
                            className={cn(
                              "flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded transition-all shrink-0 border",
                              copiedDayIndex === i
                                ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-primary/10 hover:bg-primary/20 text-primary border-primary/20"
                            )}
                            title="Copiar lista de OSs (uma por linha)"
                          >
                            {copiedDayIndex === i ? (
                              <><CheckCircle2 className="h-2.5 w-2.5" /> OSs Copiadas!</>
                            ) : (
                              <><Copy className="h-2.5 w-2.5" /> Copiar OSs</>
                            )}
                          </button>
                        </div>
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
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">1st Visit Date 📅</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Modelo</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Turno</th>
                      <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Peças</th>
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
                          <p className="font-medium text-foreground">{stop.city}{stop.state ? ` (${stop.state.toUpperCase()})` : ''}</p>
                          {stop.neighborhood && <p className="text-[10px] opacity-60">{stop.neighborhood}</p>}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={stop.firstVisitDate || ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              const newStops = selectedRoute.stops.map((s, idx) => idx === i ? { ...s, firstVisitDate: val } : s);
                              setSelectedRoute({ ...selectedRoute, stops: newStops });
                              try {
                                await routeService.update(selectedRoute.id, { stops: newStops });
                                await queryClient.invalidateQueries({ queryKey: ['routes'] });
                              } catch (err) {
                                console.error("Erro ao atualizar 1st Visit Date:", err);
                              }
                            }}
                            className="w-24 text-[11px] font-mono font-semibold text-primary px-1.5 py-0.5 rounded border border-border/60 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[100px]">
                          <span className="block truncate">{stop.model}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {stop.turn ? (
                            <span className="text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 rounded">
                              {stop.turn}
                            </span>
                          ) : (
                            <span className="text-[10px] opacity-40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {stop.parts && stop.parts.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {stop.parts.map((p, pi) => (
                                <span key={pi} className="text-[9px] font-mono font-bold bg-muted/80 px-1 py-0.5 rounded border border-border/40 truncate">
                                  {p.code} <span className="text-primary font-black">x{p.quantity}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] opacity-40">—</span>
                          )}
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
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Pré-visualização das paradas ({parsedPreview.length}):</p>
                    {parsedPreview.some(s => s.zipMismatch) && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.5 rounded border border-red-300">
                        ⚠️ Inconsistência de CEP detectada
                      </span>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {parsedPreview.map((s, i) => (
                      <div key={i} className={cn(
                        "flex items-center flex-wrap gap-1.5 text-xs py-1 px-1 rounded border-b border-border/20 last:border-0 transition-colors",
                        s.zipMismatch && "bg-red-500/10 border-red-500/30"
                      )}>
                        <span className="text-muted-foreground w-5 text-right font-bold">{i+1}.</span>
                        <span className="font-mono font-bold">{s.serviceOrder}</span>
                        <span className="text-muted-foreground truncate max-w-[110px]">{s.consumerName}</span>
                        <span className="text-muted-foreground font-medium">{s.city}{s.state ? `-${s.state}` : ''}</span>
                        {s.zipCode && (
                          <span className="font-mono text-[9px] text-muted-foreground bg-muted px-1 rounded">
                            {s.zipCode}
                          </span>
                        )}
                        {s.zipMismatch && (
                          <span className="text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1.5 py-0.2 rounded border border-red-300 flex items-center gap-1" title={s.zipMismatchDetails}>
                            ⚠️ CEP de {s.suggestedCityState}
                          </span>
                        )}
                        {s.turn && (
                          <span className="text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.2 rounded">
                            {s.turn}
                          </span>
                        )}
                        {s.parts && s.parts.length > 0 && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded">
                            📦 {s.parts.length} peça{s.parts.length > 1 ? 's' : ''}: {s.parts.map(p => `${p.code}${p.quantity > 1 ? ` x${p.quantity}` : ''}`).join(', ')}
                          </span>
                        )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
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
                <Label>Placa do Veículo 🚗</Label>
                <Input placeholder="Ex: TEM8E13" value={editLicensePlate} onChange={e => setEditLicensePlate(e.target.value)} className="uppercase font-mono font-bold" />
              </div>

              <div className="space-y-1.5">
                <Label>Data Planejada 📅</Label>
                <Popover open={editCalOpen} onOpenChange={setEditCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-xs">
                      <Calendar className="mr-2 h-3.5 w-3.5" />
                      {editPlannedDate ? format(editPlannedDate, 'dd/MM/yyyy') : 'Data...'}
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
                <Label className="text-emerald-700 dark:text-emerald-400 font-bold">Data de Saída 🛫</Label>
                <Popover open={editDepCalOpen} onOpenChange={setEditDepCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-semibold text-xs border-emerald-300 dark:border-emerald-800">
                      <Calendar className="mr-2 h-3.5 w-3.5 text-emerald-600" />
                      {editDepartureDate ? format(editDepartureDate, 'dd/MM/yyyy') : 'Data de Saída'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={editDepartureDate}
                      onSelect={d => { setEditDepartureDate(d); setEditDepCalOpen(false); }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-blue-700 dark:text-blue-400 font-bold">Data de Retorno 🛬</Label>
                <Popover open={editArrCalOpen} onOpenChange={setEditArrCalOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-semibold text-xs border-blue-300 dark:border-blue-800">
                      <Calendar className="mr-2 h-3.5 w-3.5 text-blue-600" />
                      {editArrivalDate ? format(editArrivalDate, 'dd/MM/yyyy') : 'Data de Retorno'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComp
                      mode="single"
                      selected={editArrivalDate}
                      onSelect={d => { setEditArrivalDate(d); setEditArrCalOpen(false); }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label>Consumo Médio ⛽</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="50"
                    value={editFuelAvgKml}
                    onChange={e => setEditFuelAvgKml(parseFloat(e.target.value) || 10)}
                    className="font-mono text-xs"
                  />
                  <span className="text-[10px] font-bold text-muted-foreground shrink-0">km/L</span>
                </div>
              </div>

              <div className="space-y-1.5 col-span-2 sm:col-span-2">
                <Label>Técnico</Label>
                <Select value={editTechnicianId} onValueChange={setEditTechnicianId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-2">
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
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-955/20 p-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Paradas reconhecidas ({editParsedPreview.length}):</p>
                    {editParsedPreview.some(s => s.zipMismatch) && (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-955 dark:text-red-300 px-1.5 py-0.5 rounded border border-red-300">
                        ⚠️ Inconsistência de CEP detectada
                      </span>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {editParsedPreview.map((s, i) => (
                      <div key={i} className={cn(
                        "flex items-center flex-wrap gap-1.5 text-xs py-1 px-1 rounded border-b border-border/20 last:border-0 transition-colors",
                        s.zipMismatch ? "bg-red-50/60 dark:bg-red-955/20" : "hover:bg-muted/40"
                      )}>
                        <span className="font-mono text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                        <span className="font-mono font-bold text-foreground shrink-0">{s.serviceOrder}</span>
                        <span className="font-medium text-foreground truncate max-w-[120px]">{s.consumerName}</span>
                        <span className="text-muted-foreground">{s.city}-{s.state}</span>
                        {s.zipCode && <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{s.zipCode}</span>}
                        {s.turn && <span className="font-bold text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950 px-1 rounded text-[10px]">{s.turn}</span>}
                        {s.parts && s.parts.length > 0 && (
                          <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-955 dark:text-amber-300 px-1.5 py-0.2 rounded">
                            📦 {s.parts.length} peça{s.parts.length > 1 ? 's' : ''}: {s.parts.map(p => `${p.code}${p.quantity > 1 ? ` x${p.quantity}` : ''}`).join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!editingRoute) return;
                const tech = technicians.find(t => t.id === editTechnicianId);
                const driver = drivers.find(d => d.id === editDriverId);
                const routeDataToExport: Route = {
                  ...editingRoute,
                  name: editName,
                  stops: editParsedPreview,
                  plannedDate: editPlannedDate,
                  departureDate: editDepartureDate || editPlannedDate,
                  arrivalDate: editArrivalDate || editDepartureDate || editPlannedDate,
                  licensePlate: editLicensePlate || "TEM8E13",
                  fuelAvgKml: editFuelAvgKml || 10,
                  technicianName: tech?.name || editingRoute.technicianName,
                  driverName: driver?.name || editingRoute.driverName,
                };

                const legKm = await fetchOsrmRoadDistances(editParsedPreview, defaultBaseAddress || "Aracaju");
                const totalKm = legKm.reduce((a, b) => a + b, 0);

                const ok = await copyRouteEmailToClipboard({
                  route: routeDataToExport,
                  legKm,
                  totalKm,
                  fuelAvgKml: editFuelAvgKml || 10,
                });

                if (ok) {
                  toast({
                    title: "📧 Rota Copiada no Formato de E-mail!",
                    description: "Você já pode colar (Ctrl+V) no seu Outlook, Gmail ou Word. Tabela formatada e resumo anexados!"
                  });
                } else {
                  toast({ variant: "destructive", title: "Erro ao copiar para a área de transferência." });
                }
              }}
              className="gap-1.5 border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-955 font-bold"
            >
              <Copy className="h-4 w-4 text-emerald-600" />
              Copiar p/ E-mail 📧
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveEdit} disabled={isUpdatingRoute || !editName.trim() || editParsedPreview.length === 0} className="gap-2 bg-blue-600 hover:bg-blue-700">
                {isUpdatingRoute ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit className="h-4 w-4" />}
                Salvar Alterações
              </Button>
            </div>
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
        <DialogContent className="max-w-[95vw] w-[1400px] max-h-[92vh] h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-5 w-5" />
              Pré-visualização da Otimização por IA
            </DialogTitle>
            <DialogDescription>
              Revise a nova ordem geográfica sugerida antes de aplicar à rota <span className="font-bold text-foreground">"{optimizingRoute?.name}"</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            {/* Ponto de Saída / Base Display + Reotimizar button */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/40 p-3 rounded-xl border border-border/50">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="font-bold text-foreground">Ponto de Saída & Retorno (Base):</span>
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-bold text-primary flex items-center gap-1.5 ml-1">
                  📍 {defaultBaseAddress || originCity || "Aracaju"}
                </span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => optimizingRoute && handleOpenOptimize(optimizingRoute, true)}
                  disabled={segsLoading || isOptimizing}
                  className="h-8 text-xs gap-1.5 border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-950 font-bold"
                  title="Forçar recálculo da rota via IA e OSRM"
                >
                  <Sparkles className={cn("w-3.5 h-3.5 text-violet-600", segsLoading && "animate-spin")} />
                  🔄 Reotimizar Rota
                </Button>
              </div>
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

            {/* View Mode Toggle: Lista vs Mapa */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/40">
                <button
                  type="button"
                  onClick={() => setOptimizeViewTab('map')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all",
                    optimizeViewTab === 'map'
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MapPin className="h-3.5 w-3.5" /> 🗺️ Ver no Mapa (Antes / Depois)
                </button>
                <button
                  type="button"
                  onClick={() => setOptimizeViewTab('list')}
                  className={cn(
                    "px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all",
                    optimizeViewTab === 'list'
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" /> 📋 Comparativo em Lista & Editar Turnos
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
                {optimizeViewTab === 'map' ? 'Vermelho = Ordem Atual · Verde = Otimizado por CEP/Geolocalização' : 'Organize posições e defina os turnos'}
              </span>
            </div>

            {optimizeViewTab === 'map' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[560px]">
                {/* Mapa Antes (Ordem Atual) */}
                <div className="flex flex-col border border-red-200 dark:border-red-900/50 rounded-xl p-3 bg-red-50/20 dark:bg-red-950/10 h-full">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      Percurso Atual (Antes)
                    </h4>
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full">
                      🔴 Linha Vermelha
                    </span>
                  </div>
                  <div className="flex-1 rounded-lg overflow-hidden border border-red-200/60 dark:border-red-900/40">
                    {optimizingRoute && (
                      <DynamicalRouteMap
                        routes={[optimizingRoute]}
                        activeStops={optimizingRoute.stops.map(s => ({
                          stop: s,
                          route: optimizingRoute,
                          status: 'todo' as const
                        }))}
                        showPolyline={true}
                        polylineColor="#ef4444"
                        baseAddress={defaultBaseAddress || originCity}
                        height="100%"
                      />
                    )}
                  </div>
                </div>

                {/* Mapa Depois (Sugerido pela IA) */}
                <div className="flex flex-col border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-3 bg-emerald-50/20 dark:bg-emerald-955/10 h-full">
                  <div className="flex items-center justify-between mb-2 shrink-0">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      Sugerido pela IA por CEP/Geolocalização (Depois)
                    </h4>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                      🟢 Linha Verde
                    </span>
                  </div>
                  <div className="flex-1 rounded-lg overflow-hidden border border-emerald-200/60 dark:border-emerald-900/40">
                    {optimizingRoute && (
                      <DynamicalRouteMap
                        routes={[optimizingRoute]}
                        activeStops={proposedStops.map(s => ({
                          stop: s,
                          route: optimizingRoute,
                          status: 'todo' as const
                        }))}
                        showPolyline={true}
                        polylineColor="#10b981"
                        baseAddress={defaultBaseAddress || originCity}
                        height="100%"
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Ordem Atual */}
                {(() => {
                  const origStops = optimizingRoute?.stops || [];
                  const origTotal = origSegsKm.reduce((a, b) => a + b, 0);
                  const hasData = origSegsKm.length > 0;

                  return (
                    <div className="border rounded-xl p-3 bg-muted/20">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                        <span>Ordem Atual</span>
                        <span className="text-[10px] font-normal">{origStops.length} paradas</span>
                      </h4>

                      {/* BASE */}
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-primary">
                        <span className="text-base">🏢</span>
                        <span>{defaultBaseAddress || originCity || 'Base'}</span>
                      </div>

                      <div className="space-y-0 max-h-[520px] overflow-y-auto pr-1">
                        {origStops.map((stop, i) => {
                          const newIdx = proposedStops.findIndex(s => s.serviceOrder === stop.serviceOrder);
                          const oldPos = i + 1;
                          const newPos = newIdx !== -1 ? newIdx + 1 : oldPos;
                          const isMoved = oldPos !== newPos;
                          const segKm = origSegsKm[i];

                          return (
                            <div key={i}>
                              {/* Arrow + KM badge */}
                              <div className="flex items-center gap-1 pl-2 my-0.5">
                                <span className="text-[9px] text-muted-foreground/60">↓</span>
                                {segsLoading && !hasData ? (
                                  <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando…</span>
                                ) : segKm !== undefined ? (
                                  <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                                    {segKm.toFixed(1)} km
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className={cn(
                                  "flex items-center gap-2 p-2.5 rounded-lg border bg-background text-xs transition-colors",
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
                                  <p className="text-[10px] text-muted-foreground truncate flex items-center flex-wrap gap-1 mt-0.5">
                                    <span className="font-medium text-foreground">{stop.city}</span>
                                    {stop.state && (
                                      <span className="text-[9px] font-extrabold uppercase text-slate-700 bg-slate-200/80 dark:text-slate-300 dark:bg-slate-800 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                                        {stop.state.toUpperCase()}
                                      </span>
                                    )}
                                    <span>— {stop.neighborhood}</span>
                                    {stop.zipCode && (
                                      <span className="font-mono text-[9px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1 py-0.2 rounded border border-slate-200">
                                        {stop.zipCode}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Return-to-base leg */}
                        <div className="flex items-center gap-1 pl-2 my-0.5">
                          <span className="text-[9px] text-muted-foreground/60">↓</span>
                          {segsLoading && !hasData ? (
                            <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando…</span>
                          ) : origSegsKm.length > 0 ? (
                            <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                              {origSegsKm[origSegsKm.length - 1]?.toFixed(1)} km (retorno)
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-primary pl-2">
                          <span className="text-base">🏢</span>
                          <span>{defaultBaseAddress || originCity || 'Base'}</span>
                        </div>
                      </div>

                      {/* Total */}
                      <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          Total percurso
                          {hasData && <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400">🌐 rodovia real</span>}
                        </span>
                        {segsLoading && !hasData ? (
                          <span className="text-xs text-muted-foreground animate-pulse">Calculando via OSRM…</span>
                        ) : hasData ? (
                          <span className="text-sm font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-1 rounded-full border border-red-200 dark:border-red-800">
                            🔴 {origTotal.toFixed(1)} km
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })()}

                {/* Ordem Sugerida pela IA */}
                {(() => {
                  const propTotal = propSegsKm.reduce((a, b) => a + b, 0);
                  const origTotal2 = origSegsKm.reduce((a, b) => a + b, 0);
                  const savings = origTotal2 - propTotal;
                  const hasData = propSegsKm.length > 0;

                  return (
                    <div className="border border-violet-200 dark:border-violet-900/50 rounded-xl p-3 bg-violet-50/20 dark:bg-violet-955/10">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300 mb-2 flex items-center justify-between">
                        <span>Sugerido pela IA</span>
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✨ Otimizado</span>
                      </h4>

                      {/* BASE */}
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-primary">
                        <span className="text-base">🏢</span>
                        <span>{defaultBaseAddress || originCity || 'Base'}</span>
                      </div>

                      <div className="space-y-0 max-h-[520px] overflow-y-auto pr-1">
                        {proposedStops.map((stop, i) => {
                          const origIdx = optimizingRoute?.stops.findIndex(s => s.serviceOrder === stop.serviceOrder) ?? -1;
                          const oldPos = origIdx !== -1 ? origIdx + 1 : i + 1;
                          const newPos = i + 1;
                          const isMoved = oldPos !== newPos;
                          const posDiff = oldPos - newPos;
                          const segKm = propSegsKm[i];

                          return (
                            <div key={i}>
                              {/* Arrow + KM badge */}
                              <div className="flex items-center gap-1 pl-2 my-0.5">
                                <span className="text-[9px] text-muted-foreground/60">↓</span>
                                {segsLoading && !hasData ? (
                                  <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando…</span>
                                ) : segKm !== undefined ? (
                                  <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                    {segKm.toFixed(1)} km
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className={cn(
                                  "flex flex-col gap-1.5 p-2.5 rounded-lg border text-xs shadow-xs transition-all duration-200",
                                  isMoved
                                    ? posDiff > 0
                                      ? "border-emerald-400/80 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-955/40"
                                      : "border-amber-400/80 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-955/40"
                                    : "border-violet-200 dark:border-violet-900/60 bg-background"
                                )}
                              >
                                <div className="flex items-center gap-2">
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
                                      {isMoved ? (
                                        posDiff > 0 ? (
                                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-955 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800 flex items-center gap-0.5 shrink-0">
                                            ▲ #{oldPos} ➔ #{newPos}
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-955 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800 flex items-center gap-0.5 shrink-0">
                                            ▼ #{oldPos} ➔ #{newPos}
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-[9px] text-muted-foreground font-medium shrink-0">
                                          Mantida #{newPos}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground truncate flex items-center flex-wrap gap-1 mt-0.5">
                                      <span className="font-medium text-foreground">{stop.city}</span>
                                      {stop.state && (
                                        <span className="text-[9px] font-extrabold uppercase text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-955 px-1 py-0.5 rounded border border-violet-300 dark:border-violet-800">
                                          {stop.state.toUpperCase()}
                                        </span>
                                      )}
                                      <span>— {stop.neighborhood}</span>
                                      {stop.zipCode && (
                                        <span className="font-mono text-[9px] bg-violet-100/80 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 px-1 py-0.2 rounded border border-violet-200 font-semibold">
                                          CEP: {stop.zipCode}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>

                                {/* Quick Turn & Customer Confirmation Editor in Modal */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/40 mt-1">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase mr-1">Turno:</span>
                                    {['M', 'T', 'C'].map(turnPill => (
                                      <button
                                        key={turnPill}
                                        type="button"
                                        onClick={() => {
                                          setProposedStops(prev => prev.map((st, idx) => idx === i ? { ...st, turn: turnPill } : st));
                                        }}
                                        className={cn(
                                          "px-2 py-0.5 rounded text-[10px] font-bold transition-all border",
                                          stop.turn === turnPill
                                            ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                                            : "bg-muted/60 hover:bg-muted text-muted-foreground border-border/50"
                                        )}
                                      >
                                        {turnPill}
                                      </button>
                                    ))}
                                    <input
                                      type="text"
                                      value={stop.turn || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setProposedStops(prev => prev.map((st, idx) => idx === i ? { ...st, turn: val } : st));
                                      }}
                                      placeholder="Outro"
                                      className="h-5 text-[10px] px-1.5 rounded border border-input bg-background w-16 font-medium focus:ring-1 focus:ring-primary focus:outline-hidden ml-1"
                                    />
                                  </div>

                                  {/* Customer Confirmation Buttons */}
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProposedStops(prev => prev.map((st, idx) => idx === i ? { ...st, confirmedByCall: !st.confirmedByCall } : st));
                                      }}
                                      className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold transition-all border flex items-center gap-1",
                                        stop.confirmedByCall
                                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                                          : "bg-muted/40 hover:bg-muted text-slate-600 dark:text-slate-400 border-border/50"
                                      )}
                                      title="Confirmação por Ligação Telefônica"
                                    >
                                      ☎️ Ligação {stop.confirmedByCall ? "✓" : ""}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProposedStops(prev => prev.map((st, idx) => idx === i ? { ...st, confirmedByMessage: !st.confirmedByMessage } : st));
                                      }}
                                      className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold transition-all border flex items-center gap-1",
                                        stop.confirmedByMessage
                                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                          : "bg-muted/40 hover:bg-muted text-slate-600 dark:text-slate-400 border-border/50"
                                      )}
                                      title="Confirmação por Mensagem / WhatsApp"
                                    >
                                      💬 Mensagem {stop.confirmedByMessage ? "✓" : ""}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Return-to-base leg */}
                        <div className="flex items-center gap-1 pl-2 my-0.5">
                          <span className="text-[9px] text-muted-foreground/60">↓</span>
                          {segsLoading && !hasData ? (
                            <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando…</span>
                          ) : propSegsKm.length > 0 ? (
                            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              {propSegsKm[propSegsKm.length - 1]?.toFixed(1)} km (retorno)
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-primary pl-2">
                          <span className="text-base">🏢</span>
                          <span>{defaultBaseAddress || originCity || 'Base'}</span>
                        </div>
                      </div>

                      {/* Total + Savings */}
                      <div className="mt-3 pt-2 border-t border-border/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            Total percurso
                            {hasData && <span className="text-[9px] font-normal text-emerald-600 dark:text-emerald-400">🌐 rodovia real</span>}
                          </span>
                          {segsLoading && !hasData ? (
                            <span className="text-xs text-muted-foreground animate-pulse">Calculando via OSRM…</span>
                          ) : hasData ? (
                            <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
                              🟢 {propTotal.toFixed(1)} km
                            </span>
                          ) : null}
                        </div>
                        {hasData && savings > 0.5 && origTotal2 > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-violet-600 uppercase tracking-wide">Economia estimada</span>
                            <span className="text-[11px] font-black text-violet-700 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60 px-3 py-1 rounded-full border border-violet-300 dark:border-violet-800">
                              ✂️ −{savings.toFixed(1)} km ({Math.round((savings / origTotal2) * 100)}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
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
