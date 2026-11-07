"use client";

import { useMemo, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Truck, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteCodeTag } from "@/components/routes/RouteCodeTag";
import { cn } from "@/lib/utils";
import type { Route } from "@/lib/data";
import {
    EMPTY_ROUTE_FILTERS, NO_DRIVER, NO_TECHNICIAN, ROUTE_GROUP_LABEL, ROUTE_GROUP_ORDER,
    distinctNames, filterRoutes, groupRoutes, hasActiveRouteFilters, routeDayOf, routeGroupOf, sortRoutes,
    type RouteGroup, type RouteListFilters, type RouteSort, type RouteSortKey,
} from "@/lib/routeList";

const ALL = "__all__";
const PREFS_KEY = "smartos:routes-list-prefs";

const GROUP_STYLE: Record<RouteGroup, { dot: string; chip: string; badge: string }> = {
    rascunho: { dot: "bg-amber-500", chip: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300", badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
    ativa: { dot: "bg-primary", chip: "border-primary/40 bg-primary/10 text-primary", badge: "" },
    finalizada: { dot: "bg-muted-foreground/60", chip: "border-border bg-muted text-foreground", badge: "" },
    cancelada: { dot: "bg-destructive", chip: "border-destructive/40 bg-destructive/10 text-destructive", badge: "" },
};

type RouteProgress = { done: number; total: number };

const loadPrefs = (): { grouped: boolean; sort: RouteSort } => {
    try {
        const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
        if (raw && typeof raw.grouped === "boolean") return { grouped: raw.grouped, sort: raw.sort?.key ? raw.sort : { key: "data", dir: "asc" } };
    } catch { /* sem preferências guardadas */ }
    return { grouped: true, sort: { key: "data", dir: "asc" } };
};

/**
 * Lista de rotas cadastradas: seções por situação (rascunhos, ativas, finalizadas) com os dias dentro, filtros por
 * técnico/motorista/situação/atrasadas, ordenação pelas colunas e linha compacta (dia, progresso numa barra fina).
 */
export function RoutesListView({ routes, progressOf, delays, renderActions, renderDelay }: {
    routes: Route[];
    progressOf: (route: Route) => RouteProgress;
    /** Rotas atrasadas (id → minutos). Vem das etiquetas de atraso das linhas ativas. */
    delays: Record<string, number>;
    renderActions: (route: Route) => ReactNode;
    /** Etiqueta "Atrasada +…" (só para rotas ativas em andamento). */
    renderDelay: (route: Route) => ReactNode;
}) {
    const [filters, setFilters] = useState<RouteListFilters>(EMPTY_ROUTE_FILTERS);
    const [prefs, setPrefs] = useState(loadPrefs);
    const [collapsed, setCollapsed] = useState<Set<RouteGroup>>(new Set<RouteGroup>(["rascunho", "finalizada", "cancelada"]));
    // Dias abertos, chave "situação|dia". A lista abre com todos os dias recolhidos (só as faixas); o clique abre o dia.
    const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
    const { grouped, sort } = prefs;

    const savePrefs = (next: { grouped: boolean; sort: RouteSort }) => {
        setPrefs(next);
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ok */ }
    };

    const technicians = useMemo(() => distinctNames(routes.map(r => r.technicianName)), [routes]);
    const drivers = useMemo(() => distinctNames(routes.map(r => r.driverName)), [routes]);
    const countByGroup = useMemo(() => {
        const c: Record<RouteGroup, number> = { rascunho: 0, ativa: 0, finalizada: 0, cancelada: 0 };
        routes.forEach(r => { c[routeGroupOf(r)]++; });
        return c;
    }, [routes]);
    const lateCount = useMemo(() => routes.filter(r => delays[r.id] !== undefined).length, [routes, delays]);

    const percentOf = (r: Route) => { const p = progressOf(r); return p.total > 0 ? (p.done / p.total) * 100 : 0; };
    const visible = useMemo(
        () => sortRoutes(filterRoutes(routes, filters, delays), sort, percentOf),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [routes, filters, delays, sort, progressOf],
    );
    const todayKey = format(new Date(), "yyyy-MM-dd");
    const reverseDays = sort.key === "data" && sort.dir === "desc";
    const blocks = useMemo(() => groupRoutes(visible, reverseDays), [visible, reverseDays]);

    const toggleGroupFilter = (g: RouteGroup) => setFilters(f => ({ ...f, groups: f.groups.includes(g) ? f.groups.filter(x => x !== g) : [...f.groups, g] }));
    const dayId = (g: RouteGroup, dayKey: string) => g + "|" + dayKey;
    const toggleDay = (g: RouteGroup, dayKey: string) => setExpandedDays(prev => { const n = new Set(prev); const id = dayId(g, dayKey); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleCollapsed = (g: RouteGroup) => setCollapsed(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; });
    const sortBy = (key: RouteSortKey) => savePrefs({ grouped, sort: sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "progresso" || key === "paradas" ? "desc" : "asc" } });

    const dayLabel = (dayKey: string) => {
        if (!dayKey) return "Sem data";
        const d = new Date(dayKey + "T12:00:00");
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
        const rel = dayKey === todayKey ? "Hoje · " : dayKey === format(tomorrow, "yyyy-MM-dd") ? "Amanhã · " : "";
        return rel + format(d, "EEEE, dd/MM", { locale: ptBR });
    };

    // Cabeçalho do dia: destaque do dia (hoje em azul, dia que já passou e segue aberto em vermelho), total de rotas e de paradas.
    const DayHeader = ({ dayKey, dayRoutes, group, mobile }: { dayKey: string; dayRoutes: Route[]; group: RouteGroup; mobile?: boolean }) => {
        const dayCollapsed = !expandedDays.has(dayId(group, dayKey));
        const open = group === "rascunho" || group === "ativa";
        const past = !!dayKey && dayKey < todayKey;
        const isToday = dayKey === todayKey;
        const totals = dayRoutes.reduce((acc, r) => { const p = progressOf(r); return { done: acc.done + p.done, total: acc.total + p.total }; }, { done: 0, total: 0 });
        const tone = open && past ? "red" : isToday ? "blue" : "gray";
        return (
            <div
                role="button"
                tabIndex={0}
                title={dayCollapsed ? "Mostrar as rotas deste dia" : "Recolher as rotas deste dia"}
                onClick={() => toggleDay(group, dayKey)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDay(group, dayKey); } }}
                className={cn(
                "flex cursor-pointer select-none flex-wrap items-center gap-x-3 gap-y-1 border-l-4 px-3 py-2",
                tone === "red" && "border-l-red-500 bg-red-50/70 dark:bg-red-950/20",
                tone === "blue" && "border-l-primary bg-primary/5",
                tone === "gray" && "border-l-border bg-muted/30",
                mobile && "rounded-md",
            )}>
                {dayCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                <span className={cn("text-sm font-semibold capitalize", tone === "red" && "text-red-700 dark:text-red-300", tone === "blue" && "text-primary")}>{dayLabel(dayKey)}</span>
                {open && past && <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">Dia que já passou</span>}
                <span className="text-xs text-muted-foreground tabular-nums">{dayRoutes.length} {dayRoutes.length === 1 ? "rota" : "rotas"}</span>
                {totals.total > 0 && <span className="text-xs text-muted-foreground tabular-nums">· {totals.done}/{totals.total} paradas concluídas</span>}
            </div>
        );
    };

    const SortHead = ({ k, children, className }: { k: RouteSortKey; children: ReactNode; className?: string }) => (
        <TableHead className={className}>
            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
                {children}
                {sort.key === k ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
            </button>
        </TableHead>
    );

    const statusBadge = (route: Route) => {
        const g = routeGroupOf(route);
        return (
            <Badge variant={g === "rascunho" ? "outline" : g === "ativa" ? "default" : g === "cancelada" ? "destructive" : "secondary"} className={GROUP_STYLE[g].badge || undefined}>
                {g === "rascunho" ? "Rascunho" : g === "ativa" ? "Ativa" : g === "cancelada" ? "Cancelada" : "Finalizada"}
            </Badge>
        );
    };

    const nameCell = (route: Route) => (
        <>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{route.name}</span>
                {(route.parentRouteId || route.kind === "delivery") && (
                    <Badge variant="outline" className="gap-1 border-teal-300 bg-teal-50 px-1.5 py-0 text-[10px] font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                        <Truck className="h-3 w-3" /> Entrega
                    </Badge>
                )}
                <RouteCodeTag route={route} />
            </div>
        </>
    );

    const progressCell = (route: Route) => {
        const p = progressOf(route);
        const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
        const complete = p.total > 0 && p.done >= p.total;
        return (
            <div className="flex min-w-[130px] flex-col gap-1">
                <div className="flex items-center gap-2">
                    <Progress value={pct} className="h-1.5 w-24" />
                    <span className={cn("text-xs tabular-nums", complete ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{p.done}/{p.total}</span>
                </div>
                {renderDelay(route)}
            </div>
        );
    };

    const dayShort = (route: Route) => {
        const d = routeDayOf(route);
        return d ? format(d, "dd/MM", { locale: ptBR }) : "—";
    };

    const filtersActive = hasActiveRouteFilters(filters);

    return (
        <div className="space-y-3">
            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
                <Select value={filters.technician || ALL} onValueChange={v => setFilters(f => ({ ...f, technician: v === ALL ? "" : v }))}>
                    <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Técnico" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Todos os técnicos</SelectItem>
                        <SelectItem value={NO_TECHNICIAN}>Sem técnico</SelectItem>
                        {technicians.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.driver || ALL} onValueChange={v => setFilters(f => ({ ...f, driver: v === ALL ? "" : v }))}>
                    <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Motorista" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>Todos os motoristas</SelectItem>
                        <SelectItem value={NO_DRIVER}>Sem motorista</SelectItem>
                        {drivers.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="flex flex-wrap items-center gap-1.5">
                    {ROUTE_GROUP_ORDER.filter(g => countByGroup[g] > 0).map(g => (
                        <button
                            key={g}
                            type="button"
                            onClick={() => toggleGroupFilter(g)}
                            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", filters.groups.includes(g) ? GROUP_STYLE[g].chip : "border-border text-muted-foreground hover:bg-muted")}
                        >
                            <span className={cn("h-1.5 w-1.5 rounded-full", GROUP_STYLE[g].dot)} />
                            {ROUTE_GROUP_LABEL[g]} <span className="tabular-nums opacity-70">{countByGroup[g]}</span>
                        </button>
                    ))}
                    {lateCount > 0 && (
                        <button
                            type="button"
                            onClick={() => setFilters(f => ({ ...f, lateOnly: !f.lateOnly }))}
                            className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", filters.lateOnly ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" : "border-border text-muted-foreground hover:bg-muted")}
                        >
                            <AlarmClock className="h-3 w-3" /> Atrasadas <span className="tabular-nums opacity-70">{lateCount}</span>
                        </button>
                    )}
                </div>
                {filtersActive && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setFilters(EMPTY_ROUTE_FILTERS)}>
                        <X className="h-3 w-3" /> Limpar filtros
                    </Button>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{visible.length} de {routes.length} rotas</span>
                    <Switch id="routes-grouped" checked={grouped} onCheckedChange={v => savePrefs({ grouped: v, sort })} />
                    <Label htmlFor="routes-grouped" className="text-xs">Agrupar por situação e dia</Label>
                </div>
            </div>

            {visible.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                    <p>Nenhuma rota com esses filtros.</p>
                    {filtersActive && <Button type="button" variant="link" onClick={() => setFilters(EMPTY_ROUTE_FILTERS)}>Limpar filtros</Button>}
                </div>
            ) : (
                <>
                    {/* Desktop */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <SortHead k="nome">Rota</SortHead>
                                    <SortHead k="data" className="w-[80px]">Dia</SortHead>
                                    <SortHead k="tecnico">Técnico</SortHead>
                                    <SortHead k="motorista">Motorista</SortHead>
                                    <SortHead k="progresso" className="w-[190px]">Progresso</SortHead>
                                    {!grouped && <TableHead>Status</TableHead>}
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {grouped ? blocks.map(block => {
                                    const isCollapsed = collapsed.has(block.group);
                                    return [
                                        <TableRow key={"g-" + block.group} className="cursor-pointer bg-muted/40 hover:bg-muted/60" onClick={() => toggleCollapsed(block.group)}>
                                            <TableCell colSpan={6} className="py-2">
                                                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                    <span className={cn("h-2 w-2 rounded-full", GROUP_STYLE[block.group].dot)} />
                                                    {block.label}
                                                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{block.count}</span>
                                                </span>
                                            </TableCell>
                                        </TableRow>,
                                        ...block.days.flatMap(day => [
                                            <TableRow key={`d-${block.group}-${day.dayKey}`} className={cn("border-t-2 hover:bg-transparent", isCollapsed && "hidden")}>
                                                <TableCell colSpan={6} className="p-0">
                                                    <DayHeader dayKey={day.dayKey} dayRoutes={day.routes} group={block.group} />
                                                </TableCell>
                                            </TableRow>,
                                            ...day.routes.map(route => (
                                                <TableRow key={route.id} className={cn((isCollapsed || !expandedDays.has(dayId(block.group, day.dayKey))) && "hidden", (block.group === "finalizada" || block.group === "cancelada") && "text-muted-foreground")}>
                                                    <TableCell className="pl-8">{nameCell(route)}</TableCell>
                                                    <TableCell className="tabular-nums text-muted-foreground">{dayShort(route)}</TableCell>
                                                    <TableCell><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />{route.technicianName || <span className="text-muted-foreground">—</span>}</span></TableCell>
                                                    <TableCell><span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-muted-foreground" />{route.driverName || <span className="text-muted-foreground">—</span>}</span></TableCell>
                                                    <TableCell>{progressCell(route)}</TableCell>
                                                    <TableCell className="text-right">{renderActions(route)}</TableCell>
                                                </TableRow>
                                            )),
                                        ]),
                                    ];
                                }) : visible.map(route => (
                                    <TableRow key={route.id} className={cn(!route.isActive && "text-muted-foreground")}>
                                        <TableCell>{nameCell(route)}</TableCell>
                                        <TableCell className="tabular-nums text-muted-foreground">{dayShort(route)}</TableCell>
                                        <TableCell><span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />{route.technicianName || <span className="text-muted-foreground">—</span>}</span></TableCell>
                                        <TableCell><span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-muted-foreground" />{route.driverName || <span className="text-muted-foreground">—</span>}</span></TableCell>
                                        <TableCell>{progressCell(route)}</TableCell>
                                        <TableCell>{statusBadge(route)}</TableCell>
                                        <TableCell className="text-right">{renderActions(route)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Celular: cartões compactos, também por seção */}
                    <div className="space-y-3 md:hidden">
                        {(grouped ? blocks : [{ group: null as RouteGroup | null, label: "", count: visible.length, days: [{ dayKey: "", routes: visible }] }]).map(block => {
                            const isCollapsed = block.group ? collapsed.has(block.group) : false;
                            return (
                                <div key={block.group || "all"} className="space-y-2">
                                    {block.group && (
                                        <button type="button" className="flex w-full items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm font-semibold" onClick={() => toggleCollapsed(block.group as RouteGroup)}>
                                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                            <span className={cn("h-2 w-2 rounded-full", GROUP_STYLE[block.group].dot)} />
                                            {block.label}
                                            <span className="text-xs font-normal text-muted-foreground tabular-nums">{block.count}</span>
                                        </button>
                                    )}
                                    <div className={cn("space-y-2", isCollapsed && "hidden")}>
                                        {block.days.flatMap(day => [
                                            ...(block.group ? [<DayHeader key={"d-" + day.dayKey} dayKey={day.dayKey} dayRoutes={day.routes} group={block.group} mobile />] : []),
                                            ...day.routes.map(route => (
                                            <div key={route.id} className={cn("space-y-2 rounded-lg border p-3", !route.isActive && "bg-muted/40", block.group && !expandedDays.has(dayId(block.group, day.dayKey)) && "hidden")}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">{nameCell(route)}</div>
                                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                                        {!grouped && statusBadge(route)}
                                                        <span className="text-xs tabular-nums text-muted-foreground">{dayShort(route)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{route.technicianName || "—"}</span>
                                                    <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" />{route.driverName || "—"}</span>
                                                </div>
                                                {progressCell(route)}
                                                <div>{renderActions(route)}</div>
                                            </div>
                                            )),
                                        ])}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
