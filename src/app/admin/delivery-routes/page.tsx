"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarPlus, CheckCircle2, ChevronDown, Columns3, ExternalLink, Loader2, Package, PlusCircle, RefreshCw, Route as RouteIcon, Search, Star, Trash2, Truck, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useServiceOrders } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { HelpTip } from "@/components/HelpTip";
import { parseRouteText } from "@/lib/parseRouteText";
import { optimizeRouteStopsAsync, prewarmStopCoordinates } from "@/lib/routeOptimizer";
import { RouteEndpointsFields } from "@/components/routes/RouteEndpointsFields";
import type { Route, RoutePoint, RouteStop } from "@/lib/data";
import { routeService } from "@/services/supabase/routeService";

// ─── Rota de entrega ("rota mãe") ───────────────────────────────────────────────────────────────
// Controla o envio das peças e das OS. Daqui saem rotas filhas por dia, só com as OS ainda não
// finalizadas. Não aparece para os técnicos.

type Row = {
    stop: RouteStop;
    finalizedAt: Date | null;     // OS lançada como finalizada depois da criação da rota de entrega
    pendingAt: Date | null;       // última visita ficou com pendência
    childName: string | null;     // rota filha que já leva esta OS
    day: string;                  // AAAA-MM-DD programado ("" = sem dia)
    partsTotal: number;
    partsTracked: number;
};

type SortKey = "so" | "asc" | "name" | "city" | "neighborhood" | "uf" | "model" | "turn" | "tat" | "request" | "visit" | "ts" | "warranty" | "day" | "status";

const parseBrDate = (text?: string): number => {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text || "");
    if (!m) return 0;
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
};

const statusOf = (r: Row) => (r.finalizedAt ? "Finalizada" : r.childName ? "Programada" : r.pendingAt ? "Pendência" : r.day ? "Com dia" : "A programar");

const COLUMNS: Array<{ key: SortKey; label: string; value: (r: Row) => string | number; className?: string }> = [
    { key: "so", label: "SO Nro.", value: r => r.stop.serviceOrder, className: "font-mono font-semibold" },
    { key: "asc", label: "ASC Job No.", value: r => r.stop.ascJobNumber || "" },
    { key: "name", label: "Nome Consumidor", value: r => r.stop.consumerName || "", className: "min-w-[180px]" },
    { key: "city", label: "Cidade", value: r => r.stop.city || "" },
    { key: "neighborhood", label: "Bairro", value: r => r.stop.neighborhood || "" },
    { key: "uf", label: "UF", value: r => r.stop.state || "" },
    { key: "model", label: "Modelo", value: r => r.stop.model || "", className: "font-mono text-[11px]" },
    { key: "turn", label: "Turno", value: r => r.stop.turn || "" },
    { key: "tat", label: "TAT", value: r => Number(String(r.stop.tat || "").replace(/\D/g, "")) || 0 },
    { key: "request", label: "Data Solicitação", value: r => parseBrDate(r.stop.requestDate) },
    { key: "visit", label: "1st Visit Date", value: r => parseBrDate(r.stop.firstVisitDate) },
    { key: "ts", label: "TS", value: r => r.stop.ts || "" },
    { key: "warranty", label: "OW/LP", value: r => r.stop.warrantyType || "" },
];

const STATUS_ORDER = ["A programar", "Com dia", "Programada", "Pendência", "Finalizada"];

// Colunas que podem ser escondidas (SO, Dia e Situação ficam sempre).
const TOGGLEABLE_COLUMNS: Array<{ key: string; label: string }> = [
    ...COLUMNS.filter(c => c.key !== "so").map(c => ({ key: c.key as string, label: c.label })),
    { key: "parts", label: "Peças" },
];

type Prefs = {
    status: string[]; warranty: string[]; city: string[]; neighborhood: string[]; turn: string[];
    hidden: string[]; sort: { key: SortKey; dir: "asc" | "desc" }; sorts: Array<{ key: SortKey; dir: "asc" | "desc" }>; dense: boolean;
};
const PREFS_KEY = "smartos_delivery_table_prefs";
function loadPrefs(): Partial<Prefs> {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; }
}

// Filtro de múltipla escolha: marca quantos valores quiser (OU dentro do filtro; os filtros se combinam em E).
function MultiFilter({ label, options, selected, onChange, searchable }: {
    label: string;
    options: Array<{ value: string; count: number }>;
    selected: Set<string>;
    onChange: (s: Set<string>) => void;
    searchable?: boolean;
}) {
    const [q, setQ] = useState("");
    const shown = options.filter(o => !q.trim() || o.value.toLowerCase().includes(q.trim().toLowerCase()));
    const toggle = (v: string) => { const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n); };
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", selected.size > 0 && "border-primary bg-primary/5")}>
                    {label}{selected.size > 0 ? " (" + selected.size + ")" : ""} <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
                {searchable && <Input className="h-8 text-xs mb-1.5" placeholder={"Buscar " + label.toLowerCase() + "…"} value={q} onChange={e => setQ(e.target.value)} />}
                <div className="max-h-64 overflow-y-auto grid gap-0.5">
                    {shown.map(o => (
                        <label key={o.value} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer">
                            <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                            <span className="flex-1 truncate">{o.value}</span>
                            <span className="text-muted-foreground tabular-nums">{o.count}</span>
                        </label>
                    ))}
                    {shown.length === 0 && <p className="text-xs text-muted-foreground px-1.5 py-2">Nada encontrado.</p>}
                </div>
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t">
                    <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onChange(new Set(shown.map(o => o.value)))}>Marcar visíveis</button>
                    <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(new Set())}>Limpar</button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default function DeliveryRoutesPage() {
    const { appUser, activeUnidadeId } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const isMaster = appUser?.role === "master";
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const { data: routes = [], isLoading: loadingRoutes } = useQuery({
        queryKey: ["delivery-routes", appUser?.uid, activeUnidadeId],
        queryFn: () => routeService.getDeliveryRoutes(activeUnidadeId),
        enabled: !!appUser?.uid,
        refetchInterval: 30000,
    });

    // ── Excluir rota de entrega ──
    const [toDelete, setToDelete] = useState<Route | null>(null);
    const [deleting, setDeleting] = useState(false);
    const handleDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await routeService.removeDeliveryRoute(toDelete.id);
            await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            toast({ title: "Rota de entrega excluída", description: toDelete.name });
            setToDelete(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível excluir", description: e?.message });
        } finally {
            setDeleting(false);
        }
    };

    // ── Criar rota de entrega ──
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newText, setNewText] = useState("");
    const [creating, setCreating] = useState(false);
    const parsed = useMemo(() => parseRouteText(newText), [newText]);

    const handleCreate = async () => {
        if (!newName.trim() || parsed.length === 0) {
            toast({ variant: "destructive", title: "Preencha o nome e cole as OS da planilha." });
            return;
        }
        if (isMaster && !activeUnidadeId) {
            toast({ variant: "destructive", title: "Selecione uma unidade", description: "Escolha uma unidade no seletor no topo antes de criar." });
            return;
        }
        setCreating(true);
        try {
            // Sem a coluna 'kind' (migração 25) a rota nasceria como rota comum e iria para os técnicos.
            if (!(await routeService.supportsDeliveryRoutes())) {
                toast({ variant: "destructive", title: "Recurso ainda não ativado", description: "O banco precisa da migração 25 (rotas de entrega) antes de criar a primeira." });
                return;
            }
            const id = await routeService.create({
                name: newName.trim(),
                stops: parsed,
                kind: "delivery",
                isActive: true,
                isDraft: false,
                createdAt: new Date(),
            } as Omit<Route, "id">, activeUnidadeId);
            await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
            toast({ title: "Rota de entrega criada", description: parsed.length + " OS importadas." });
            setCreateOpen(false);
            setNewName("");
            setNewText("");
            setSelectedId(id);
        } catch (e: any) {
            console.error(e);
            toast({ variant: "destructive", title: "Não foi possível criar", description: e?.message });
        } finally {
            setCreating(false);
        }
    };

    if (selectedId) {
        return <DeliveryRouteDetail routeId={selectedId} onBack={() => setSelectedId(null)} />;
    }

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Rotas de Entrega <HelpTip topic="rota-entrega" /></h1>
                    <p className="text-sm text-muted-foreground max-w-2xl">
                        Controle do envio de peças e ordens de serviço. A partir de cada rota de entrega você cria as rotas por dia com as OS ainda não finalizadas.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Nova Rota de Entrega</Button>
            </div>

            {loadingRoutes ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
            ) : routes.length === 0 ? (
                <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma rota de entrega ainda. Crie a primeira colando a planilha de OS.</CardContent></Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {routes.map(r => (
                        <Card key={r.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setSelectedId(r.id)}>
                            <CardHeader className="pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <CardTitle className="text-base">{r.name}</CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 -mt-1 -mr-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        title="Excluir esta rota de entrega"
                                        onClick={(e) => { e.stopPropagation(); setToDelete(r); }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <CardDescription>Criada em {format(new Date(r.createdAt), "dd/MM/yyyy")} · {r.stops.length} OS</CardDescription>
                            </CardHeader>
                            <CardContent className="text-xs text-muted-foreground">
                                {r.stops.filter(s => s.plannedDay).length} com dia programado
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o && !deleting) setToDelete(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a rota de entrega?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>{toDelete?.name}</strong> será apagada por completo, junto com os rastreios de peças e os dias programados nela.
                            As rotas filhas já criadas continuam em Rotas (apenas perdem o vínculo). Isso não pode ser desfeito.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleting} onClick={(e) => { e.preventDefault(); void handleDelete(); }}>
                            {deleting ? "Excluindo..." : "Sim, excluir"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Nova Rota de Entrega</DialogTitle>
                        <DialogDescription>Cole a planilha de OS (com o cabeçalho). Ela serve só para controle; as rotas dos técnicos saem dela por dia.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>Nome *</Label>
                            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex.: Entrega W43 - Recife" />
                        </div>
                        <div className="space-y-1">
                            <Label>
                                Planilha de OS *
                                {parsed.length > 0 && <span className="ml-2 text-xs font-normal text-emerald-600">✓ {parsed.length} OS detectadas</span>}
                            </Label>
                            <Textarea className="min-h-[200px] font-mono text-xs" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Cole aqui o conteúdo da planilha (Ctrl+A → Ctrl+C no Excel)…" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreate} disabled={creating}>{creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Criar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DeliveryRouteDetail({ routeId, onBack }: { routeId: string; onBack: () => void }) {
    const { appUser, activeUnidadeId } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: serviceOrders = [] } = useServiceOrders(2000);

    const { data: route, isLoading } = useQuery({
        queryKey: ["delivery-route", appUser?.uid, routeId],
        queryFn: () => routeService.getById(routeId),
        enabled: !!appUser?.uid,
        refetchInterval: 15000,
    });
    const { data: children = [] } = useQuery({
        queryKey: ["delivery-children", appUser?.uid, routeId],
        queryFn: () => routeService.getChildRoutes(routeId),
        enabled: !!appUser?.uid,
        refetchInterval: 15000,
    });

    const initialPrefs = useMemo(() => loadPrefs(), []);
    // Ordenação combinada: vários critérios em sequência (o 2º desempata o 1º, e assim por diante).
    const [sorts, setSorts] = useState<Array<{ key: SortKey; dir: "asc" | "desc" }>>(
        initialPrefs.sorts && initialPrefs.sorts.length > 0 ? initialPrefs.sorts : initialPrefs.sort ? [initialPrefs.sort] : [{ key: "so", dir: "asc" }]
    );
    const [search, setSearch] = useState("");
    // Filtros múltiplos: vários valores por filtro (OU) e todos os filtros juntos (E). Vazio = sem filtro.
    const [fStatus, setFStatus] = useState<Set<string>>(new Set(initialPrefs.status || []));
    const [fWarranty, setFWarranty] = useState<Set<string>>(new Set(initialPrefs.warranty || []));
    const [fCity, setFCity] = useState<Set<string>>(new Set(initialPrefs.city || []));
    const [fNeighborhood, setFNeighborhood] = useState<Set<string>>(new Set(initialPrefs.neighborhood || []));
    const [fTurn, setFTurn] = useState<Set<string>>(new Set(initialPrefs.turn || []));
    const [hidden, setHidden] = useState<Set<string>>(new Set(initialPrefs.hidden || []));
    const [dense, setDense] = useState<boolean>(initialPrefs.dense ?? true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkDay, setBulkDay] = useState("");
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [optimize, setOptimize] = useState(true);
    const [creatingChildren, setCreatingChildren] = useState(false);
    const [createProgress, setCreateProgress] = useState("");

    // Base padrão de saída e retorno desta rota de entrega: fica gravada na rota e vale para todas as rotas dos dias
    // criadas a partir dela. Vazio = base da unidade.
    const [startPt, setStartPt] = useState<RoutePoint | null>(null);
    const [endPt, setEndPt] = useState<RoutePoint | null>(null);
    const endpointsLoadedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!route || endpointsLoadedFor.current === route.id) return;
        endpointsLoadedFor.current = route.id;
        setStartPt(route.startPoint || null);
        setEndPt(route.endPoint || null);
    }, [route]);
    const saveEndpoints = async (patch: { startPoint?: RoutePoint | null; endPoint?: RoutePoint | null }, what: string) => {
        try {
            await routeService.update(routeId, patch);
            const dropped = routeService.consumeSchemaWarnings();
            toast(dropped.some(c => c === "start_point" || c === "end_point")
                ? { variant: "destructive", title: "O banco ainda não tem as colunas de saída/chegada", description: "Aplique as migrações pendentes. Por enquanto vale só até fechar esta tela." }
                : { title: what + " salva", description: "As próximas rotas dos dias partem e terminam nesse ponto." });
            queryClient.invalidateQueries({ queryKey: ["delivery-route"] });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message });
        }
    };
    const [syncing, setSyncing] = useState(false);
    // Rastreio da rota de entrega e das filhas em dia (o que só existe de um lado é copiado pro outro).
    const handleSyncTracking = async () => {
        setSyncing(true);
        try {
            const r = await routeService.syncDeliveryTracking(routeId);
            await refresh();
            toast({
                title: r.toChildren + r.toParent > 0 ? "Rastreios sincronizados" : "Tudo em dia",
                description: r.toChildren + r.toParent > 0
                    ? r.toChildren + " código(s) levado(s) para as rotas filhas e " + r.toParent + " trazido(s) delas para esta rota."
                    : "A rota de entrega e as rotas filhas já têm os mesmos rastreios.",
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível sincronizar", description: e?.message });
        } finally {
            setSyncing(false);
        }
    };
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const handleDeleteRoute = async () => {
        setDeleting(true);
        try {
            await routeService.removeDeliveryRoute(routeId);
            await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            toast({ title: "Rota de entrega excluída" });
            onBack();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível excluir", description: e?.message });
            setDeleting(false);
        }
    };

    const rows: Row[] = useMemo(() => {
        if (!route) return [];
        const createdMs = new Date(route.createdAt).getTime();
        const activeChildren = children.filter(c => !c.isCanceled);
        return (route.stops || []).filter(s => !s.isReallocated).map(stop => {
            // Concluída = a OS foi lançada depois da SOLICITAÇÃO (ciclo desta planilha), mesmo antes de a rota de
            // entrega ser criada: muita OS da planilha já foi atendida. Sem data de solicitação, vale a criação da rota.
            const sinceMs = parseBrDate(stop.requestDate) || createdMs;
            const related = serviceOrders.filter(os => os.serviceOrderNumber === stop.serviceOrder && !os.ignoreInRoute && os.date.getTime() >= sinceMs);
            const last = related.length ? related.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a)) : null;
            const child = activeChildren.find(c => (c.stops || []).some(cs => cs.serviceOrder === stop.serviceOrder));
            const parts = stop.parts || [];
            return {
                stop,
                finalizedAt: last && last.isFinalized !== false ? last.date : null,
                pendingAt: last && last.isFinalized === false ? last.date : null,
                childName: child ? child.name : null,
                day: stop.plannedDay || "",
                partsTotal: parts.length,
                partsTracked: parts.filter(p => (p.trackingCode || "").trim() !== "").length,
            };
        });
    }, [route, serviceOrders, children]);

    const options = useMemo(() => {
        const count = (f: (r: Row) => string) => {
            const m = new Map<string, number>();
            rows.forEach(r => { const v = f(r); if (v) m.set(v, (m.get(v) || 0) + 1); });
            return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([value, n]) => ({ value, count: n }));
        };
        const statusCounts = new Map<string, number>();
        rows.forEach(r => statusCounts.set(statusOf(r), (statusCounts.get(statusOf(r)) || 0) + 1));
        return {
            cities: count(r => r.stop.city || ""),
            neighborhoods: count(r => r.stop.neighborhood || ""),
            turns: count(r => r.stop.turn || ""),
            warranties: count(r => r.stop.warrantyType || ""),
            statuses: STATUS_ORDER.map(value => ({ value, count: statusCounts.get(value) || 0 })),
        };
    }, [rows]);

    const currentPrefs = (): Prefs => ({
        status: [...fStatus], warranty: [...fWarranty], city: [...fCity], neighborhood: [...fNeighborhood], turn: [...fTurn],
        hidden: [...hidden], sort: sorts[0] || { key: "so", dir: "asc" }, sorts, dense,
    });
    const clearFilters = () => { setFStatus(new Set()); setFWarranty(new Set()); setFCity(new Set()); setFNeighborhood(new Set()); setFTurn(new Set()); setSearch(""); };
    const saveDefaultView = () => {
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify(currentPrefs()));
            toast({ title: "Visualização padrão salva", description: "Filtros, ordenação, colunas e densidade serão aplicados sempre que abrir uma rota de entrega neste navegador." });
        } catch {
            toast({ variant: "destructive", title: "Não foi possível salvar o padrão neste navegador." });
        }
    };
    const resetView = () => {
        try { localStorage.removeItem(PREFS_KEY); } catch { /* ok */ }
        clearFilters(); setSorts([{ key: "so", dir: "asc" }]); setHidden(new Set()); setDense(true);
        toast({ title: "Visualização restaurada", description: "O padrão salvo foi apagado." });
    };
    const drop = (set: Set<string>, v: string) => { const n = new Set(set); n.delete(v); return n; };
    const activeChips: Array<{ label: string; value: string; remove: () => void }> = [
        ...[...fStatus].map(v => ({ label: "Situação", value: v, remove: () => setFStatus(s => drop(s, v)) })),
        ...[...fWarranty].map(v => ({ label: "Garantia", value: v, remove: () => setFWarranty(s => drop(s, v)) })),
        ...[...fCity].map(v => ({ label: "Cidade", value: v, remove: () => setFCity(s => drop(s, v)) })),
        ...[...fNeighborhood].map(v => ({ label: "Bairro", value: v, remove: () => setFNeighborhood(s => drop(s, v)) })),
        ...[...fTurn].map(v => ({ label: "Turno", value: v, remove: () => setFTurn(s => drop(s, v)) })),
    ];

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = rows.filter(r => {
            if (fStatus.size && !fStatus.has(statusOf(r))) return false;
            if (fWarranty.size && !fWarranty.has(r.stop.warrantyType || "")) return false;
            if (fCity.size && !fCity.has(r.stop.city || "")) return false;
            if (fNeighborhood.size && !fNeighborhood.has(r.stop.neighborhood || "")) return false;
            if (fTurn.size && !fTurn.has(r.stop.turn || "")) return false;
            if (!q) return true;
            const hay = [r.stop.serviceOrder, r.stop.ascJobNumber, r.stop.consumerName, r.stop.city, r.stop.neighborhood, r.stop.model, ...(r.stop.parts || []).map(p => p.code)].join(" ").toLowerCase();
            return hay.includes(q);
        });
        const valueOf = (key: SortKey, r: Row): string | number => {
            const col = COLUMNS.find(c => c.key === key);
            if (col) return col.value(r);
            if (key === "day") return r.day || "9999";
            return STATUS_ORDER.indexOf(statusOf(r) as any);
        };
        return [...list].sort((a, b) => {
            for (const level of sorts) {
                const dir = level.dir === "asc" ? 1 : -1;
                const va = valueOf(level.key, a), vb = valueOf(level.key, b);
                const c = (typeof va === "number" && typeof vb === "number")
                    ? va - vb
                    : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
                if (c !== 0) return c * dir;
            }
            return 0;
        });
    }, [rows, search, fStatus, fWarranty, fCity, fNeighborhood, fTurn, sorts]);

    const summary = useMemo(() => ({
        total: rows.length,
        finalized: rows.filter(r => r.finalizedAt).length,
        scheduled: rows.filter(r => !r.finalizedAt && r.childName).length,
        withDay: rows.filter(r => !r.finalizedAt && !r.childName && r.day).length,
        open: rows.filter(r => !r.finalizedAt && !r.childName && !r.day).length,
        parts: rows.reduce((a, r) => a + r.partsTotal, 0),
        tracked: rows.reduce((a, r) => a + r.partsTracked, 0),
    }), [rows]);

    const toggleSort = (key: SortKey, additive = false) => setSorts(cur => {
        const i = cur.findIndex(l => l.key === key);
        if (additive) {
            if (i < 0) return [...cur, { key, dir: "asc" }];
            // Já está na combinação: asc -> desc -> sai da combinação (se não for o único critério).
            if (cur[i].dir === "asc") return cur.map((l, k) => (k === i ? { ...l, dir: "desc" } : l));
            return cur.length > 1 ? cur.filter((_, k) => k !== i) : [{ key, dir: "asc" }];
        }
        if (cur.length === 1 && cur[0].key === key) return [{ key, dir: cur[0].dir === "asc" ? "desc" : "asc" }];
        return [{ key, dir: "asc" }];
    });
    const setSortLevel = (index: number, patch: Partial<{ key: SortKey; dir: "asc" | "desc" }>) => setSorts(cur => cur.map((l, k) => (k === index ? { ...l, ...patch } : l)));
    const removeSortLevel = (index: number) => setSorts(cur => (cur.length > 1 ? cur.filter((_, k) => k !== index) : cur));
    const addSortLevel = () => setSorts(cur => {
        const used = new Set(cur.map(l => l.key));
        const next = COLUMNS.map(c => c.key as SortKey).concat(["day", "status"] as SortKey[]).find(k => !used.has(k));
        return next ? [...cur, { key: next, dir: "asc" }] : cur;
    });
    const sortIcon = (key: SortKey) => {
        const i = sorts.findIndex(l => l.key === key);
        if (i < 0) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
        return (
            <span className="inline-flex items-center gap-0.5">
                {sorts[i].dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {sorts.length > 1 && <span className="rounded-full bg-white/25 px-1 text-[9px] font-bold leading-none py-0.5">{i + 1}</span>}
            </span>
        );
    };

    const allColumns: Array<{ key: string; label: string; sortable: boolean }> = [
        ...COLUMNS.map(c => ({ key: c.key as string, label: c.label, sortable: true })),
        { key: "parts", label: "Peças", sortable: false },
        { key: "day", label: "Dia", sortable: true },
        { key: "status", label: "Situação", sortable: true },
    ];
    const shownColumns = allColumns.filter(c => !hidden.has(c.key));

    const selectable = (r: Row) => !r.finalizedAt && !r.childName;
    const allVisibleSelected = visible.filter(selectable).length > 0 && visible.filter(selectable).every(r => selected.has(r.stop.serviceOrder));
    const toggleAllVisible = () => {
        setSelected(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) visible.forEach(r => next.delete(r.stop.serviceOrder));
            else visible.filter(selectable).forEach(r => next.add(r.stop.serviceOrder));
            return next;
        });
    };

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ["delivery-route"] });
        await queryClient.invalidateQueries({ queryKey: ["delivery-children"] });
        await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
    };

    const setDays = async (serviceOrders: string[], day: string) => {
        if (serviceOrders.length === 0) return;
        setSaving(true);
        try {
            await routeService.patchStopFields(routeId, serviceOrders.map(so => ({ serviceOrder: so, fields: { plannedDay: day } })));
            await refresh();
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível salvar o dia", description: e?.message });
        } finally {
            setSaving(false);
        }
    };

    // Dias com OS programadas e ainda sem rota filha.
    const pendingDays = useMemo(() => {
        const map = new Map<string, Row[]>();
        rows.filter(r => !r.finalizedAt && !r.childName && r.day).forEach(r => map.set(r.day, [...(map.get(r.day) || []), r]));
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [rows]);

    const handleCreateChildren = async () => {
        if (!route || pendingDays.length === 0) return;
        setCreatingChildren(true);
        try {
            // 1) Endereços: geocodifica uma vez só os endereços distintos de todos os dias.
            const prepared = pendingDays.map(([day, list]) => {
                const [y, m, d] = day.split("-").map(Number);
                const dayDate = new Date(y, m - 1, d, 8, 0, 0);
                const label = format(dayDate, "dd/MM/yyyy");
                return { dayDate, stops: list.map(r => ({ ...r.stop, firstVisitDate: label })) as RouteStop[] };
            });
            if (optimize) {
                setCreateProgress("Localizando os endereços…");
                await prewarmStopCoordinates(prepared.flatMap(p => p.stops), "Aracaju");
            }

            // 2) Roteirização dos dias, 3 por vez (antes um dia depois do outro).
            let done = 0;
            const optimizedDays: RouteStop[][] = new Array(prepared.length);
            let nextDay = 0;
            const workers = Array.from({ length: Math.min(3, prepared.length) }, async () => {
                while (nextDay < prepared.length) {
                    const i = nextDay++;
                    let stops = prepared[i].stops;
                    if (optimize && stops.length > 2) {
                        try { stops = (await optimizeRouteStopsAsync(stops, "Aracaju", activeUnidadeId, { start: startPt, end: endPt })).stops; } catch (e) { console.warn("Otimização falhou, mantendo a ordem da tabela", e); }
                    }
                    optimizedDays[i] = stops;
                    done++;
                    setCreateProgress("Roteirizando os dias: " + done + " de " + prepared.length);
                }
            });
            await Promise.all(workers);

            // 3) Gravação das rotas (em ordem).
            let created = 0;
            for (let i = 0; i < prepared.length; i++) {
                setCreateProgress("Salvando as rotas: " + (i + 1) + " de " + prepared.length);
                await routeService.create({
                    name: route.name + " — " + format(prepared[i].dayDate, "dd/MM"),
                    stops: optimizedDays[i],
                    routeType: route.routeType,
                    plannedDate: prepared[i].dayDate,
                    departureDate: prepared[i].dayDate,
                    isActive: false,
                    isDraft: true,
                    parentRouteId: route.id,
                    ...(startPt ? { startPoint: startPt } : {}),
                    ...(endPt ? { endPoint: endPt } : {}),
                    createdAt: new Date(),
                } as Omit<Route, "id">, activeUnidadeId);
                created++;
            }
            const dropped = routeService.consumeSchemaWarnings();
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            await refresh();
            setCreateOpen(false);
            setSelected(new Set());
            toast({
                title: created === 1 ? "1 rota criada como rascunho" : created + " rotas criadas como rascunho",
                description: dropped.includes("parent_route_id")
                    ? "Atenção: o banco ainda não tem a coluna do vínculo (migração 25); as rotas foram criadas, mas sem ligação com esta rota de entrega."
                    : "Abra em Rotas para definir técnico, motorista e publicar.",
            });
        } catch (e: any) {
            console.error(e);
            toast({ variant: "destructive", title: "Não foi possível criar as rotas", description: e?.message });
        } finally {
            setCreatingChildren(false);
            setCreateProgress("");
        }
    };

    if (isLoading) return <p className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;
    if (!route) return <div className="p-6"><Button variant="outline" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button><p className="mt-4 text-sm">Rota não encontrada.</p></div>;

    const statusBadge = (r: Row) => {
        const st = statusOf(r);
        const cls = st === "Finalizada" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : st === "Programada" ? "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            : st === "Pendência" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            : st === "Com dia" ? "border-violet-300 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
            : "text-muted-foreground";
        return (
            <div className="flex flex-col items-start gap-0.5">
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 whitespace-nowrap", cls)}>{st}</Badge>
                {r.finalizedAt && <span className="text-[10px] text-muted-foreground tabular-nums">{format(r.finalizedAt, "dd/MM HH:mm")}</span>}
                {!r.finalizedAt && r.pendingAt && <span className="text-[10px] text-muted-foreground tabular-nums">{format(r.pendingAt, "dd/MM HH:mm")}</span>}
                {r.childName && <span className="text-[10px] text-muted-foreground max-w-[150px] truncate" title={r.childName}>{r.childName}</span>}
            </div>
        );
    };

    const renderCell = (r: Row, key: string): ReactNode => {
        const so = r.stop.serviceOrder;
        switch (key) {
            case "tat": return r.stop.tat || "";
            case "request": return r.stop.requestDate || "";
            case "visit": return r.stop.firstVisitDate || "";
            case "warranty": {
                const v = (r.stop.warrantyType || "").trim();
                if (!v) return "";
                return (
                    <span className={cn("text-[10px] font-bold px-1 rounded", v.toUpperCase() === "LP" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}>{v}</span>
                );
            }
            case "parts":
                return (
                    <span className="font-mono text-[10px] inline-flex flex-wrap gap-x-1.5 max-w-[260px] whitespace-normal">
                        {(r.stop.parts || []).map(p => {
                            const tracked = (p.trackingCode || "").trim() !== "";
                            return (
                                <span
                                    key={p.code}
                                    className={cn("inline-flex items-center gap-0.5", tracked ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}
                                    title={(p.description || "") + (tracked ? " — rastreio " + p.trackingCode : " — sem rastreio")}
                                >
                                    {tracked ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}{p.code}{p.quantity > 1 ? " x" + p.quantity : ""}
                                </span>
                            );
                        })}
                    </span>
                );
            case "day":
                return selectable(r) ? (
                    <Input
                        type="date"
                        className="h-6 w-[112px] text-[10px] px-1"
                        value={r.day}
                        onChange={e => setDays([so], e.target.value)}
                        title={r.day ? format(new Date(r.day + "T12:00:00"), "EEEE", { locale: ptBR }) : "Definir o dia"}
                    />
                ) : (
                    <span className="text-muted-foreground">{r.day ? format(new Date(r.day + "T12:00:00"), "dd/MM") : "—"}</span>
                );
            case "status": return statusBadge(r);
            default: {
                const c = COLUMNS.find(x => x.key === key);
                return c ? String(c.value(r)) : "";
            }
        }
    };

    return (
        <div className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> Rotas de Entrega</Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> {route.name}</h1>
                        <p className="text-xs text-muted-foreground">Criada em {format(new Date(route.createdAt), "dd/MM/yyyy")} · rota de controle (não vai para os técnicos)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="text-muted-foreground hover:text-destructive" title="Excluir esta rota de entrega" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={handleSyncTracking} disabled={syncing || children.length === 0} title="Copia rastreios entre esta rota e as rotas filhas">
                        {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Sincronizar rastreios
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/admin/part-separation"><Package className="mr-2 h-4 w-4" /> Rastreio das peças</Link>
                    </Button>
                    <Button onClick={() => setCreateOpen(true)} disabled={pendingDays.length === 0}>
                        <CalendarPlus className="mr-2 h-4 w-4" /> Criar rotas dos dias ({pendingDays.length})
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {[
                    { label: "OS na rota", value: summary.total },
                    { label: "Finalizadas", value: summary.finalized },
                    { label: "Em rota filha", value: summary.scheduled },
                    { label: "Com dia, sem rota", value: summary.withDay },
                    { label: "A programar", value: summary.open },
                    { label: "Peças com rastreio", value: summary.parts > 0 ? summary.tracked + "/" + summary.parts : "—" },
                ].map(c => (
                    <div key={c.label} className="rounded-lg border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{c.label}</p>
                        <p className="text-lg font-semibold">{c.value}</p>
                    </div>
                ))}
            </div>

            <RouteEndpointsFields
                start={startPt}
                end={endPt}
                onStartChange={p => { setStartPt(p); void saveEndpoints({ startPoint: p }, "Saída"); }}
                onEndChange={p => { setEndPt(p); void saveEndpoints({ endPoint: p }, "Chegada"); }}
                title="Base padrão de saída e retorno"
                help="Fica gravada nesta rota de entrega. As rotas dos dias criadas aqui saem do ponto de saída e terminam no de retorno; o planejamento e o mapa também usam esses pontos."
            />

            {children.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rotas filhas</p>
                    <div className="flex flex-wrap gap-2">
                        {children.map(c => (
                            <Link key={c.id} href="/admin/routes" className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted" title="Abrir em Rotas">
                                <RouteIcon className="h-3 w-3" /> {c.name} · {(() => {
                                    const cMs = new Date(c.createdAt).getTime();
                                    const done = c.stops.filter(st => serviceOrders.some(os => os.serviceOrderNumber === st.serviceOrder && !os.ignoreInRoute && os.date.getTime() >= cMs)).length;
                                    return done + "/" + c.stops.length + " OS atendidas";
                                })()}
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{c.isCanceled ? "Cancelada" : c.isDraft ? "Rascunho" : c.isActive ? "Ativa" : "Finalizada"}</Badge>
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="rounded-lg border p-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-auto">
                        <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input className="h-8 w-full sm:w-[230px] pl-7 text-xs" placeholder="Buscar OS, cliente, cidade, modelo, peça…" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <MultiFilter label="Situação" options={options.statuses} selected={fStatus} onChange={setFStatus} />
                    <MultiFilter label="Garantia" options={options.warranties} selected={fWarranty} onChange={setFWarranty} />
                    <MultiFilter label="Cidade" options={options.cities} selected={fCity} onChange={setFCity} searchable />
                    <MultiFilter label="Bairro" options={options.neighborhoods} selected={fNeighborhood} onChange={setFNeighborhood} searchable />
                    <MultiFilter label="Turno" options={options.turns} selected={fTurn} onChange={setFTurn} />
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar{sorts.length > 1 ? " (" + sorts.length + ")" : ""}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Combine critérios: o 2º desempata o 1º, e assim por diante. No computador, Shift+clique no cabeçalho também soma colunas.</p>
                            {sorts.map((l, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <span className="w-4 text-center text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                                    <select
                                        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
                                        value={l.key}
                                        onChange={e => setSortLevel(i, { key: e.target.value as SortKey })}
                                    >
                                        {allColumns.filter(c => c.sortable).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                    <Button type="button" size="sm" variant="outline" className="h-8 w-[4.5rem] gap-1 px-2 text-xs" onClick={() => setSortLevel(i, { dir: l.dir === "asc" ? "desc" : "asc" })}>
                                        {l.dir === "asc" ? <><ArrowUp className="h-3 w-3" /> A–Z</> : <><ArrowDown className="h-3 w-3" /> Z–A</>}
                                    </Button>
                                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={sorts.length === 1} onClick={() => removeSortLevel(i)} title="Remover este critério">
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between pt-1">
                                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addSortLevel} disabled={sorts.length >= allColumns.filter(c => c.sortable).length}>
                                    <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Adicionar critério
                                </Button>
                                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSorts([{ key: "so", dir: "asc" }])}>Limpar</Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                <Columns3 className="h-3.5 w-3.5" /> Colunas{hidden.size > 0 ? " (" + (TOGGLEABLE_COLUMNS.length - hidden.size) + "/" + TOGGLEABLE_COLUMNS.length + ")" : ""}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2">
                            <div className="grid grid-cols-1 gap-0.5 max-h-72 overflow-y-auto">
                                {TOGGLEABLE_COLUMNS.map(c => (
                                    <label key={c.key} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer">
                                        <Checkbox checked={!hidden.has(c.key)} onCheckedChange={() => setHidden(prev => { const n = new Set(prev); if (n.has(c.key)) n.delete(c.key); else n.add(c.key); return n; })} />
                                        {c.label}
                                    </label>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDense(d => !d)} title="Altura das linhas">{dense ? "Linhas maiores" : "Linhas compactas"}</Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={saveDefaultView} title="Guarda filtros, ordenação, colunas e densidade como padrão ao abrir">
                            <Star className="h-3.5 w-3.5" /> Salvar como padrão
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetView} title="Volta ao visual de fábrica e apaga o padrão salvo">Restaurar</Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
                    {activeChips.map(c => (
                        <button key={c.label + c.value} type="button" onClick={c.remove} className="inline-flex items-center gap-1 rounded-full border bg-primary/10 px-2 py-0.5 text-[11px] hover:bg-primary/20" title="Remover este filtro">
                            <span className="text-muted-foreground">{c.label}:</span> {c.value} <X className="h-3 w-3" />
                        </button>
                    ))}
                    {(activeChips.length > 0 || search) && <button type="button" onClick={clearFilters} className="text-[11px] text-primary hover:underline">Limpar filtros</button>}
                    <span className="ml-auto text-xs text-muted-foreground">{visible.length} de {rows.length} OS</span>
                </div>
            </div>

            {/* Programar dia nas selecionadas */}
            <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition-colors", selected.size > 0 ? "bg-primary/5 border-primary/40" : "bg-muted/30")}>
                <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
                <Input type="date" className="h-8 w-full sm:w-[160px] text-xs" value={bulkDay} onChange={e => setBulkDay(e.target.value)} />
                <Button size="sm" disabled={selected.size === 0 || !bulkDay || saving} onClick={async () => { await setDays(Array.from(selected), bulkDay); setSelected(new Set()); }}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />} Programar para este dia
                </Button>
                <Button size="sm" variant="ghost" disabled={selected.size === 0 || saving} onClick={async () => { await setDays(Array.from(selected), ""); setSelected(new Set()); }}>Limpar dia</Button>
                <span className="text-[11px] text-muted-foreground">Só OS não finalizadas e sem rota filha podem ser selecionadas.</span>
            </div>

            {/* Tabela */}
            <div className="rounded-lg border overflow-auto max-h-[70vh]">
                <table className={cn("w-full border-collapse", dense ? "text-[11px]" : "text-xs")}>
                    <thead className="sticky top-0 z-20 bg-slate-900 text-white">
                        <tr>
                            <th className="px-2 py-1.5 w-8 sticky left-0 z-30 bg-slate-900">
                                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} className="border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-900" />
                            </th>
                            {shownColumns.map(c => (
                                <th
                                    key={c.key}
                                    className={cn("px-2 py-1.5 text-left font-semibold whitespace-nowrap", c.sortable && "cursor-pointer select-none hover:bg-slate-800", c.key === "so" && "sticky left-8 z-30 bg-slate-900")}
                                    onClick={c.sortable ? (e) => toggleSort(c.key as SortKey, e.shiftKey || e.ctrlKey || e.metaKey) : undefined}
                                    title={c.sortable ? "Clique para ordenar. Shift+clique soma esta coluna à ordenação atual." : undefined}
                                >
                                    <span className="inline-flex items-center gap-1">{c.label} {c.sortable && sortIcon(c.key as SortKey)}</span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((r, i) => {
                            const so = r.stop.serviceOrder;
                            const done = !!r.finalizedAt;
                            const pad = dense ? "py-0.5" : "py-2";
                            return (
                                <tr key={so} className={cn("border-b hover:bg-muted/50", i % 2 ? "bg-muted/20" : "", done && "!bg-emerald-50 dark:!bg-emerald-950/20", selected.has(so) && "!bg-primary/10")}>
                                    <td className={cn("px-2 sticky left-0 z-10 bg-background", pad)}>
                                        <Checkbox
                                            checked={selected.has(so)}
                                            disabled={!selectable(r)}
                                            onCheckedChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(so)) n.delete(so); else n.add(so); return n; })}
                                        />
                                    </td>
                                    {shownColumns.map(c => (
                                        <td key={c.key} className={cn("px-2 whitespace-nowrap", pad, c.key === "so" && "sticky left-8 z-10 bg-background font-mono font-semibold", c.key === "name" && "whitespace-normal min-w-[160px]", c.key === "model" && "font-mono text-[10px]")}>
                                            {renderCell(r, c.key)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                        {visible.length === 0 && (
                            <tr><td colSpan={shownColumns.length + 1} className="text-center text-muted-foreground py-8">Nenhuma OS com esses filtros.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={(o) => { if (!deleting) setConfirmDelete(o); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a rota de entrega?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <strong>{route.name}</strong> será apagada por completo, junto com os rastreios de peças e os dias programados nela.
                            {children.length > 0 ? " As " + children.length + " rota(s) filha(s) já criadas continuam em Rotas (apenas perdem o vínculo)." : ""} Isso não pode ser desfeito.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={deleting} onClick={(e) => { e.preventDefault(); void handleDeleteRoute(); }}>
                            {deleting ? "Excluindo..." : "Sim, excluir"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Criar rotas filhas */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Criar rotas dos dias</DialogTitle>
                        <DialogDescription>Uma rota (rascunho) por dia programado, só com as OS ainda não finalizadas e sem rota filha.</DialogDescription>
                    </DialogHeader>
                    <ul className="space-y-1.5">
                        {pendingDays.map(([day, list]) => (
                            <li key={day} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                <span className="capitalize">{format(new Date(day + "T12:00:00"), "EEEE dd/MM", { locale: ptBR })}</span>
                                <span className="text-muted-foreground">{list.length} OS</span>
                            </li>
                        ))}
                    </ul>
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        <strong>Sai de:</strong> {startPt ? startPt.address : "base da unidade"} · <strong>Volta para:</strong> {endPt ? endPt.address : "base da unidade"}
                    </p>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={optimize} onChange={e => setOptimize(e.target.checked)} />
                        <span>Roteirizar cada dia (melhor ordem de atendimento saindo da base)</span>
                    </label>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateChildren} disabled={creatingChildren}>
                            {creatingChildren ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {creatingChildren ? (createProgress || "Criando…") : "Criar " + pendingDays.length + " rota(s)"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
