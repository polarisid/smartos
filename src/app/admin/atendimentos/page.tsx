"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, ListChecks, PlusCircle, Search, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiFilter } from "@/components/MultiFilter";
import { RouteCodeTag } from "@/components/routes/RouteCodeTag";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAllRoutes, useServiceOrders } from "@/hooks/queries";
import { routeService } from "@/services/supabase/routeService";
import { downloadSpreadsheet, type SheetRow } from "@/lib/spreadsheetXml";
import { routeCode } from "@/lib/routeCode";
import { stateToUF } from "@/lib/brStates";
import { cn } from "@/lib/utils";
import type { Route, RouteStop, ServiceOrder } from "@/lib/data";

// ─── Atendimentos: todas as OS que estão em rotas, numa tabela só ───────────────────────────────
// Cada OS aparece uma vez, com a rota mais relevante (ativa > rascunho > rota de entrega > finalizada), a situação real
// (lançamentos dos técnicos) e dois prazos: TAT atual e TAT projetado (até o dia previsto de atendimento).

const DAY_MS = 24 * 60 * 60 * 1000;
// Faixas de atenção do TAT (dias): a partir de WARN fica âmbar, a partir de ALERT fica vermelho.
const TAT_WARN = 7;
const TAT_ALERT = 10;
const PAGE = 100;
const PREFS_KEY = "smartos_atendimentos_prefs";

const STATUS_ORDER = ["A programar", "Com dia", "Rascunho", "Em rota", "Sem lançamento", "Pendência", "Finalizada"];
type RouteKind = "Rota ativa" | "Rascunho" | "Rota de entrega" | "Rota finalizada";

type Item = {
    so: string;
    stop: RouteStop;
    route: Route;
    routeKind: RouteKind;
    deliveryRoute: Route | null;
    technician: string;
    requestMs: number;
    finalizedAt: Date | null;
    pendingAt: Date | null;
    plannedDay: string;        // AAAA-MM-DD ("" = sem dia previsto)
    status: string;
    tatNow: number | null;
    tatProjected: number | null;
    partsTotal: number;
    partsTracked: number;
};

type SortKey = "so" | "asc" | "name" | "city" | "neighborhood" | "uf" | "model" | "turn" | "ts" | "warranty" | "request" | "tatNow" | "planned" | "tatProj" | "status" | "route" | "kind" | "tech" | "delivery" | "parts";
type SortLevel = { key: SortKey; dir: "asc" | "desc" };

const parseBr = (text?: string): number => {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text || "");
    if (!m) return 0;
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (Number(m[1]) === 0 || Number(m[2]) === 0) return 0; // "00/00/0000"
    return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
};
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysBetween = (fromMs: number, toMs: number) => Math.max(0, Math.round((dayStart(toMs) - dayStart(fromMs)) / DAY_MS));
const toDayKey = (ms: number) => format(new Date(ms), "yyyy-MM-dd");
const dateMs = (d: unknown): number => (d instanceof Date ? d.getTime() : d ? new Date(d as any).getTime() : 0);

const kindOf = (r: Route): RouteKind => (r.kind === "delivery" ? "Rota de entrega" : r.isDraft ? "Rascunho" : r.isActive ? "Rota ativa" : "Rota finalizada");
const routeLabel = (r: Route) => (r.name || "Sem nome") + " · " + routeCode(r);
const kindRank: Record<RouteKind, number> = { "Rota ativa": 0, "Rascunho": 1, "Rota de entrega": 2, "Rota finalizada": 3 };

const tatClass = (n: number | null, muted = false) =>
    n === null ? "text-muted-foreground" : muted ? "" : n >= TAT_ALERT ? "font-bold text-red-600 dark:text-red-400" : n >= TAT_WARN ? "font-bold text-amber-600 dark:text-amber-400" : "font-semibold";

const COLUMNS: Array<{ key: SortKey; label: string; value: (i: Item) => string | number; className?: string }> = [
    { key: "so", label: "OS", value: i => i.so, className: "font-mono font-semibold" },
    { key: "asc", label: "ASC Job", value: i => i.stop.ascJobNumber || "", className: "font-mono" },
    { key: "name", label: "Cliente", value: i => i.stop.consumerName || "", className: "min-w-[180px]" },
    { key: "city", label: "Cidade", value: i => i.stop.city || "" },
    { key: "neighborhood", label: "Bairro", value: i => i.stop.neighborhood || "" },
    { key: "uf", label: "UF", value: i => stateToUF(i.stop.state) },
    { key: "model", label: "Modelo", value: i => i.stop.model || "", className: "font-mono text-[11px]" },
    { key: "turn", label: "Turno", value: i => i.stop.turn || "" },
    { key: "ts", label: "TS", value: i => i.stop.ts || "" },
    { key: "warranty", label: "OW/LP", value: i => i.stop.warrantyType || "" },
    { key: "request", label: "Solicitação", value: i => i.requestMs },
    { key: "tatNow", label: "TAT atual", value: i => i.tatNow ?? -1 },
    { key: "planned", label: "Dia previsto", value: i => i.plannedDay || "9999" },
    { key: "tatProj", label: "TAT projetado", value: i => i.tatProjected ?? -1 },
    { key: "status", label: "Situação", value: i => STATUS_ORDER.indexOf(i.status) },
    { key: "route", label: "Rota", value: i => i.route.name || "", className: "min-w-[200px]" },
    { key: "kind", label: "Tipo de rota", value: i => i.routeKind },
    { key: "tech", label: "Técnico", value: i => i.technician },
    { key: "delivery", label: "Rota de entrega", value: i => i.deliveryRoute?.name || "" },
    { key: "parts", label: "Peças", value: i => i.partsTotal },
];

type Prefs = { includeFinished: boolean; status: string[]; kind: string[]; route: string[]; tech: string[]; city: string[]; neighborhood: string[]; warranty: string[]; turn: string[]; tatMin: string; sorts: SortLevel[] };
function loadPrefs(): Partial<Prefs> {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
}

const statusBadge = (st: string) => {
    const cls =
        st === "Finalizada" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : st === "Pendência" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
        : st === "Em rota" ? "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        : st === "Com dia" || st === "Rascunho" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        : "text-muted-foreground";
    return <Badge variant="outline" className={cn("whitespace-nowrap px-1.5 py-0 text-[10px]", cls)}>{st}</Badge>;
};

export default function AtendimentosPage() {
    const { appUser, activeUnidadeId } = useAuth();
    const { toast } = useToast();
    const { data: regularRoutes = [], isLoading: loadingRoutes } = useAllRoutes();
    const { data: deliveryRoutes = [], isLoading: loadingDelivery } = useQuery({
        queryKey: ["delivery-routes", appUser?.uid, activeUnidadeId],
        queryFn: () => routeService.getDeliveryRoutes(activeUnidadeId),
        enabled: !!appUser?.uid,
    });
    const { data: serviceOrders = [], isLoading: loadingOs } = useServiceOrders(2000);

    const initial = useMemo(() => (typeof window === "undefined" ? {} : loadPrefs()), []);
    const [search, setSearch] = useState("");
    // Rotas finalizadas ficam de fora (milhares de OS antigas); dá para incluí-las.
    const [includeFinished, setIncludeFinished] = useState<boolean>(initial.includeFinished ?? false);
    const [fStatus, setFStatus] = useState<Set<string>>(new Set(initial.status || []));
    const [fKind, setFKind] = useState<Set<string>>(new Set(initial.kind || []));
    const [fRoute, setFRoute] = useState<Set<string>>(new Set(initial.route || []));
    const [fTech, setFTech] = useState<Set<string>>(new Set(initial.tech || []));
    const [fCity, setFCity] = useState<Set<string>>(new Set(initial.city || []));
    const [fNeighborhood, setFNeighborhood] = useState<Set<string>>(new Set(initial.neighborhood || []));
    const [fWarranty, setFWarranty] = useState<Set<string>>(new Set(initial.warranty || []));
    const [fTurn, setFTurn] = useState<Set<string>>(new Set(initial.turn || []));
    const [tatMin, setTatMin] = useState<string>(initial.tatMin || "");
    const [sorts, setSorts] = useState<SortLevel[]>(initial.sorts && initial.sorts.length > 0 ? initial.sorts : [{ key: "tatNow", dir: "desc" }]);
    const [shown, setShown] = useState(PAGE);

    // ── Uma linha por OS ──
    const items = useMemo<Item[]>(() => {
        const ordersByNumber = new Map<string, ServiceOrder[]>();
        serviceOrders.forEach(os => {
            const list = ordersByNumber.get(os.serviceOrderNumber);
            if (list) list.push(os); else ordersByNumber.set(os.serviceOrderNumber, [os]);
        });

        type Entry = { route: Route; stop: RouteStop };
        const byOrder = new Map<string, Entry[]>();
        [...regularRoutes, ...deliveryRoutes].filter(r => !r.isCanceled && (includeFinished || kindOf(r) !== "Rota finalizada")).forEach(route => {
            (route.stops || []).filter(st => !st.isReallocated && st.serviceOrder).forEach(stop => {
                const list = byOrder.get(stop.serviceOrder);
                if (list) list.push({ route, stop }); else byOrder.set(stop.serviceOrder, [{ route, stop }]);
            });
        });

        const out: Item[] = [];
        const now = Date.now();
        byOrder.forEach((entries, so) => {
            const primary = [...entries].sort((a, b) =>
                kindRank[kindOf(a.route)] - kindRank[kindOf(b.route)] || dateMs(b.route.createdAt) - dateMs(a.route.createdAt))[0];
            const routeKind = kindOf(primary.route);
            const deliveryEntry = entries.find(e => e.route.kind === "delivery");

            const requestMs = parseBr(primary.stop.requestDate) || parseBr(deliveryEntry?.stop.requestDate);
            const sinceMs = requestMs || dateMs(primary.route.createdAt);
            const related = (ordersByNumber.get(so) || []).filter(os => !os.ignoreInRoute && os.date.getTime() >= sinceMs);
            const last = related.length ? related.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a)) : null;
            const finalizedAt = last && last.isFinalized !== false ? last.date : null;
            const pendingAt = last && last.isFinalized === false ? last.date : null;

            const plannedMs = deliveryEntry?.stop.plannedDay
                ? new Date(deliveryEntry.stop.plannedDay + "T12:00:00").getTime()
                : parseBr(primary.stop.firstVisitDate);
            const plannedDay = plannedMs ? toDayKey(plannedMs) : "";

            let status: string;
            if (finalizedAt) status = "Finalizada";
            else if (pendingAt) status = "Pendência";
            else if (routeKind === "Rota ativa") status = "Em rota";
            else if (routeKind === "Rascunho") status = "Rascunho";
            else if (routeKind === "Rota de entrega") status = plannedDay ? "Com dia" : "A programar";
            else status = "Sem lançamento";

            const parts = primary.stop.parts || [];
            out.push({
                so,
                stop: primary.stop,
                route: primary.route,
                routeKind,
                deliveryRoute: deliveryEntry && deliveryEntry.route.id !== primary.route.id ? deliveryEntry.route : null,
                technician: primary.route.technicianName || "",
                requestMs,
                finalizedAt,
                pendingAt,
                plannedDay,
                status,
                tatNow: requestMs ? daysBetween(requestMs, finalizedAt ? finalizedAt.getTime() : now) : null,
                tatProjected: requestMs && plannedMs && !finalizedAt ? daysBetween(requestMs, plannedMs) : null,
                partsTotal: parts.length,
                partsTracked: parts.filter(p => (p.trackingCode || "").trim() !== "").length,
            });
        });
        return out;
    }, [regularRoutes, deliveryRoutes, serviceOrders, includeFinished]);

    // ── Filtros ──
    const options = useMemo(() => {
        const count = (get: (i: Item) => string) => {
            const m = new Map<string, number>();
            items.forEach(i => { const v = get(i); if (v) m.set(v, (m.get(v) || 0) + 1); });
            return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([value, n]) => ({ value, count: n }));
        };
        const statusCounts = new Map<string, number>();
        items.forEach(i => statusCounts.set(i.status, (statusCounts.get(i.status) || 0) + 1));
        return {
            status: STATUS_ORDER.map(value => ({ value, count: statusCounts.get(value) || 0 })).filter(o => o.count > 0),
            kind: count(i => i.routeKind),
            route: count(i => routeLabel(i.route)),
            tech: count(i => i.technician),
            city: count(i => i.stop.city || ""),
            neighborhood: count(i => i.stop.neighborhood || ""),
            warranty: count(i => i.stop.warrantyType || ""),
            turn: count(i => i.stop.turn || ""),
        };
    }, [items]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const min = Number(tatMin);
        const list = items.filter(i => {
            if (fStatus.size && !fStatus.has(i.status)) return false;
            if (fKind.size && !fKind.has(i.routeKind)) return false;
            if (fRoute.size && !fRoute.has(routeLabel(i.route))) return false;
            if (fTech.size && !fTech.has(i.technician)) return false;
            if (fCity.size && !fCity.has(i.stop.city || "")) return false;
            if (fNeighborhood.size && !fNeighborhood.has(i.stop.neighborhood || "")) return false;
            if (fWarranty.size && !fWarranty.has(i.stop.warrantyType || "")) return false;
            if (fTurn.size && !fTurn.has(i.stop.turn || "")) return false;
            if (tatMin.trim() !== "" && Number.isFinite(min) && (i.tatNow ?? -1) < min) return false;
            if (!q) return true;
            const hay = [i.so, i.stop.ascJobNumber, i.stop.consumerName, i.stop.city, i.stop.neighborhood, i.stop.model, i.route.name, routeCode(i.route), i.deliveryRoute ? routeCode(i.deliveryRoute) : "", i.technician, ...(i.stop.parts || []).map(p => p.code + " " + (p.trackingCode || ""))].join(" ").toLowerCase();
            return hay.includes(q);
        });
        const valueOf = (key: SortKey, i: Item) => COLUMNS.find(c => c.key === key)!.value(i);
        return [...list].sort((a, b) => {
            for (const level of sorts) {
                const dir = level.dir === "asc" ? 1 : -1;
                const va = valueOf(level.key, a), vb = valueOf(level.key, b);
                const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
                if (c !== 0) return c * dir;
            }
            return 0;
        });
    }, [items, search, fStatus, fKind, fRoute, fTech, fCity, fNeighborhood, fWarranty, fTurn, tatMin, sorts]);

    const clearFilters = () => {
        setSearch(""); setFStatus(new Set()); setFKind(new Set()); setFRoute(new Set()); setFTech(new Set()); setFCity(new Set());
        setFNeighborhood(new Set()); setFWarranty(new Set()); setFTurn(new Set()); setTatMin(""); setShown(PAGE);
    };
    const hasFilters = search.trim() !== "" || fStatus.size + fKind.size + fRoute.size + fTech.size + fCity.size + fNeighborhood.size + fWarranty.size + fTurn.size > 0 || tatMin.trim() !== "";

    const savePrefs = () => {
        try {
            const prefs: Prefs = { includeFinished, status: [...fStatus], kind: [...fKind], route: [...fRoute], tech: [...fTech], city: [...fCity], neighborhood: [...fNeighborhood], warranty: [...fWarranty], turn: [...fTurn], tatMin, sorts };
            localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
            toast({ title: "Visualização padrão salva", description: "Filtros e ordenação serão aplicados sempre que abrir esta tela neste navegador." });
        } catch {
            toast({ variant: "destructive", title: "Não foi possível salvar o padrão neste navegador." });
        }
    };
    const resetPrefs = () => {
        try { localStorage.removeItem(PREFS_KEY); } catch { /* ok */ }
        clearFilters(); setIncludeFinished(false); setSorts([{ key: "tatNow", dir: "desc" }]);
        toast({ title: "Visualização restaurada" });
    };

    // ── Ordenação combinada (clique = só esta coluna; Shift/Ctrl+clique soma) ──
    const toggleSort = (key: SortKey, additive = false) => setSorts(cur => {
        const i = cur.findIndex(l => l.key === key);
        if (additive) {
            if (i < 0) return [...cur, { key, dir: "asc" }];
            if (cur[i].dir === "asc") return cur.map((l, k) => (k === i ? { ...l, dir: "desc" } : l));
            return cur.length > 1 ? cur.filter((_, k) => k !== i) : [{ key, dir: "asc" }];
        }
        if (cur.length === 1 && cur[0].key === key) return [{ key, dir: cur[0].dir === "asc" ? "desc" : "asc" }];
        return [{ key, dir: key === "tatNow" || key === "tatProj" ? "desc" : "asc" }];
    });
    const sortIcon = (key: SortKey) => {
        const i = sorts.findIndex(l => l.key === key);
        if (i < 0) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
        return (
            <span className="inline-flex items-center gap-0.5">
                {sorts[i].dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {sorts.length > 1 && <span className="rounded-full bg-white/25 px-1 py-0.5 text-[9px] font-bold leading-none">{i + 1}</span>}
            </span>
        );
    };

    // ── Exportar (o que está filtrado, na ordem da tela) ──
    const handleExport = () => {
        if (visible.length === 0) { toast({ title: "Nada para exportar" }); return; }
        const fmt = (ms: number) => (ms ? format(new Date(ms), "dd/MM/yyyy") : "");
        const toneOf = (st: string): SheetRow["tone"] => (st === "Finalizada" ? "green" : st === "Pendência" ? "red" : st === "Em rota" ? "blue" : st === "Com dia" || st === "Rascunho" ? "amber" : "default");
        const rows: SheetRow[] = visible.map(i => ({
            tone: toneOf(i.status),
            values: [
                /^\d+$/.test(i.so) ? Number(i.so) : i.so, i.stop.ascJobNumber || "", i.stop.consumerName || "", i.stop.city || "", i.stop.neighborhood || "", stateToUF(i.stop.state),
                i.stop.model || "", i.stop.turn || "", i.stop.ts || "", i.stop.warrantyType || "", fmt(i.requestMs), i.tatNow ?? "", i.plannedDay ? fmt(new Date(i.plannedDay + "T12:00:00").getTime()) : "",
                i.tatProjected ?? "", i.status, i.route.name, routeCode(i.route), i.routeKind, i.technician, i.deliveryRoute ? i.deliveryRoute.name + " (" + routeCode(i.deliveryRoute) + ")" : "",
                i.finalizedAt ? format(i.finalizedAt, "dd/MM/yyyy HH:mm") : "", i.pendingAt ? format(i.pendingAt, "dd/MM/yyyy HH:mm") : "",
                i.partsTotal, i.partsTracked, (i.stop.parts || []).map(p => p.code + (p.trackingCode ? ": " + p.trackingCode : "")).join(" | "),
            ],
        }));
        downloadSpreadsheet("Atendimentos - " + format(new Date(), "yyyy-MM-dd"), [{
            name: "Atendimentos",
            headers: ["OS Nro.", "ASC Job", "Cliente", "Cidade", "Bairro", "UF", "Modelo", "Turno", "TS", "OW/LP", "Solicitação", "TAT atual", "Dia previsto", "TAT projetado", "Situação", "Rota", "Código da rota", "Tipo de rota", "Técnico", "Rota de entrega", "Finalizada em", "Pendência em", "Peças", "Peças com rastreio", "Códigos das peças"],
            rows,
            widths: [14, 16, 26, 16, 18, 6, 18, 7, 6, 7, 12, 8, 12, 9, 13, 30, 14, 14, 16, 30, 16, 16, 7, 9, 44],
        }]);
        toast({ title: "Planilha exportada", description: visible.length + " atendimentos." });
    };

    const isLoading = loadingRoutes || loadingDelivery || loadingOs;
    const summary = useMemo(() => {
        const c = (st: string) => visible.filter(i => i.status === st).length;
        const proj = visible.filter(i => i.tatProjected !== null);
        return {
            total: visible.length, emRota: c("Em rota"), comDia: c("Com dia") + c("Rascunho"), aProgramar: c("A programar"), pendencia: c("Pendência"), finalizada: c("Finalizada"),
            alerta: visible.filter(i => !i.finalizedAt && (i.tatProjected ?? i.tatNow ?? 0) >= TAT_ALERT).length,
            projMedio: proj.length ? Math.round(proj.reduce((a, i) => a + (i.tatProjected || 0), 0) / proj.length) : null,
        };
    }, [visible]);

    const renderCell = (i: Item, key: SortKey) => {
        switch (key) {
            case "uf": return stateToUF(i.stop.state);
            case "request": return i.requestMs ? format(new Date(i.requestMs), "dd/MM/yyyy") : "—";
            case "tatNow": return <span className={cn("tabular-nums", i.finalizedAt ? "" : tatClass(i.tatNow))} title={i.finalizedAt ? "Dias da solicitação até a finalização" : "Dias da solicitação até hoje"}>{i.tatNow ?? "—"}</span>;
            case "planned": return i.plannedDay ? format(new Date(i.plannedDay + "T12:00:00"), "dd/MM/yyyy") : <span className="text-muted-foreground">—</span>;
            case "tatProj": return <span className={cn("tabular-nums", tatClass(i.tatProjected))} title="Dias da solicitação até o dia previsto de atendimento">{i.tatProjected ?? "—"}</span>;
            case "status": return statusBadge(i.status);
            case "route": return (
                <div className="flex flex-col items-start gap-0.5">
                    <span className="max-w-[260px] truncate" title={i.route.name}>{i.route.name}</span>
                    <RouteCodeTag route={i.route} />
                </div>
            );
            case "delivery": return i.deliveryRoute ? (
                <div className="flex flex-col items-start gap-0.5">
                    <span className="max-w-[200px] truncate" title={i.deliveryRoute.name}>{i.deliveryRoute.name}</span>
                    <RouteCodeTag route={i.deliveryRoute} />
                </div>
            ) : <span className="text-muted-foreground">—</span>;
            case "parts": return i.partsTotal === 0 ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums" title="Peças com rastreio / total">{i.partsTracked}/{i.partsTotal}</span>;
            default: return COLUMNS.find(c => c.key === key)!.value(i) || "";
        }
    };

    if (isLoading) {
        return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando os atendimentos…</div>;
    }

    return (
        <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold"><ListChecks className="h-6 w-6" /> Atendimentos</h1>
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        As OS das rotas em andamento (ativas, rascunhos e rotas de entrega), uma linha por OS, com a situação real, o TAT atual e o TAT projetado até o dia previsto.
                    </p>
                </div>
                <Button variant="outline" onClick={handleExport}><Download className="mr-2 h-4 w-4" /> Exportar planilha</Button>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
                {[
                    { label: "Atendimentos", value: summary.total },
                    { label: "Em rota", value: summary.emRota },
                    { label: "Com dia / rascunho", value: summary.comDia },
                    { label: "A programar", value: summary.aProgramar },
                    { label: "Pendência", value: summary.pendencia },
                    { label: "Finalizadas", value: summary.finalizada },
                    { label: "TAT projetado médio", value: summary.projMedio === null ? "—" : summary.projMedio + " d" },
                    { label: "Em alerta (≥" + TAT_ALERT + " d)", value: summary.alerta },
                ].map(c => (
                    <div key={c.label} className="rounded-lg border px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                        <p className="text-lg font-semibold tabular-nums">{c.value}</p>
                    </div>
                ))}
            </div>

            <div className="space-y-2 rounded-lg border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input className="h-8 w-full pl-7 text-xs sm:w-[260px]" placeholder="Buscar OS, cliente, cidade, modelo, peça, rota ou código…" value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE); }} />
                    </div>
                    <MultiFilter label="Situação" options={options.status} selected={fStatus} onChange={s => { setFStatus(s); setShown(PAGE); }} />
                    <MultiFilter label="Tipo de rota" options={options.kind} selected={fKind} onChange={s => { setFKind(s); setShown(PAGE); }} />
                    <MultiFilter label="Rotas" options={options.route} selected={fRoute} onChange={s => { setFRoute(s); setShown(PAGE); }} searchable />
                    <MultiFilter label="Técnico" options={options.tech} selected={fTech} onChange={s => { setFTech(s); setShown(PAGE); }} />
                    <MultiFilter label="Cidade" options={options.city} selected={fCity} onChange={s => { setFCity(s); setShown(PAGE); }} searchable />
                    <MultiFilter label="Bairro" options={options.neighborhood} selected={fNeighborhood} onChange={s => { setFNeighborhood(s); setShown(PAGE); }} searchable />
                    <MultiFilter label="Garantia" options={options.warranty} selected={fWarranty} onChange={s => { setFWarranty(s); setShown(PAGE); }} />
                    <MultiFilter label="Turno" options={options.turn} selected={fTurn} onChange={s => { setFTurn(s); setShown(PAGE); }} />
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">TAT atual ≥</span>
                        <Input type="number" min={0} className="h-8 w-16 text-xs" value={tatMin} onChange={e => { setTatMin(e.target.value); setShown(PAGE); }} placeholder="dias" />
                    </div>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar{sorts.length > 1 ? " (" + sorts.length + ")" : ""}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-2 p-3">
                            <p className="text-xs text-muted-foreground">Combine critérios: o 2º desempata o 1º, e assim por diante. No computador, Shift+clique no cabeçalho também soma colunas.</p>
                            {sorts.map((l, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <span className="w-4 text-center text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                                    <select className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" value={l.key} onChange={e => setSorts(cur => cur.map((x, k) => (k === i ? { ...x, key: e.target.value as SortKey } : x)))}>
                                        {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                    <Button type="button" size="sm" variant="outline" className="h-8 w-[4.5rem] gap-1 px-2 text-xs" onClick={() => setSorts(cur => cur.map((x, k) => (k === i ? { ...x, dir: x.dir === "asc" ? "desc" : "asc" } : x)))}>
                                        {l.dir === "asc" ? <><ArrowUp className="h-3 w-3" /> A–Z</> : <><ArrowDown className="h-3 w-3" /> Z–A</>}
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={sorts.length === 1} onClick={() => setSorts(cur => cur.filter((_, k) => k !== i))}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between pt-1">
                                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={sorts.length >= COLUMNS.length} onClick={() => setSorts(cur => {
                                    const used = new Set(cur.map(l => l.key));
                                    const next = COLUMNS.find(c => !used.has(c.key));
                                    return next ? [...cur, { key: next.key, dir: "asc" }] : cur;
                                })}>
                                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Adicionar critério
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSorts([{ key: "tatNow", dir: "desc" }])}>Limpar</Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={savePrefs} title="Guarda filtros e ordenação como padrão ao abrir"><Star className="h-3.5 w-3.5" /> Salvar como padrão</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetPrefs}>Restaurar</Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <label className="flex cursor-pointer items-center gap-1.5">
                        <input type="checkbox" checked={includeFinished} onChange={e => { setIncludeFinished(e.target.checked); setShown(PAGE); }} />
                        Incluir rotas finalizadas
                    </label>
                    {hasFilters && <button type="button" onClick={clearFilters} className="text-primary hover:underline">Limpar filtros</button>}
                    <span className="ml-auto">{visible.length} de {items.length} atendimentos</span>
                </div>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-lg border">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                        <tr>
                            {COLUMNS.map(c => (
                                <th
                                    key={c.key}
                                    className={cn("cursor-pointer select-none whitespace-nowrap px-2 py-1.5 text-left font-semibold hover:bg-slate-800", c.key === "so" && "sticky left-0 z-30 bg-slate-900")}
                                    onClick={(e) => toggleSort(c.key, e.shiftKey || e.ctrlKey || e.metaKey)}
                                    title="Clique para ordenar. Shift+clique soma esta coluna à ordenação atual."
                                >
                                    <span className="inline-flex items-center gap-1">{c.label} {sortIcon(c.key)}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.slice(0, shown).map(i => (
                            <tr key={i.so} className="border-t hover:bg-muted/40">
                                {COLUMNS.map(c => (
                                    <td key={c.key} className={cn("whitespace-nowrap px-2 py-1.5 align-middle", c.className, c.key === "so" && "sticky left-0 z-10 bg-background")}>
                                        {renderCell(i, c.key)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {visible.length === 0 && (
                            <tr><td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum atendimento com esses filtros.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            {visible.length > shown && (
                <div className="flex justify-center">
                    <Button variant="outline" onClick={() => setShown(n => n + PAGE)}>Mostrar mais {Math.min(PAGE, visible.length - shown)} ({visible.length - shown} restantes)</Button>
                </div>
            )}
        </div>
    );
}
