"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarPlus, CheckCircle2, ExternalLink, Loader2, Package, PlusCircle, Route as RouteIcon, Search, Truck } from "lucide-react";
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
import { parseRouteText } from "@/lib/parseRouteText";
import { optimizeRouteStopsAsync } from "@/lib/routeOptimizer";
import type { Route, RouteStop } from "@/lib/data";
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
                    <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Rotas de Entrega</h1>
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
                                <CardTitle className="text-base">{r.name}</CardTitle>
                                <CardDescription>Criada em {format(new Date(r.createdAt), "dd/MM/yyyy")} · {r.stops.length} OS</CardDescription>
                            </CardHeader>
                            <CardContent className="text-xs text-muted-foreground">
                                {r.stops.filter(s => s.plannedDay).length} com dia programado
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

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

    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "so", dir: "asc" });
    const [search, setSearch] = useState("");
    const [fStatus, setFStatus] = useState("todas");
    const [fWarranty, setFWarranty] = useState("todas");
    const [fCity, setFCity] = useState("todas");
    const [fTurn, setFTurn] = useState("todas");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkDay, setBulkDay] = useState("");
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [optimize, setOptimize] = useState(true);
    const [creatingChildren, setCreatingChildren] = useState(false);

    const rows: Row[] = useMemo(() => {
        if (!route) return [];
        const createdMs = new Date(route.createdAt).getTime();
        const activeChildren = children.filter(c => !c.isCanceled);
        return (route.stops || []).filter(s => !s.isReallocated).map(stop => {
            const related = serviceOrders.filter(os => os.serviceOrderNumber === stop.serviceOrder && !os.ignoreInRoute && os.date.getTime() >= createdMs);
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
        const uniq = (f: (r: Row) => string) => Array.from(new Set(rows.map(f).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        return { cities: uniq(r => r.stop.city || ""), turns: uniq(r => r.stop.turn || ""), warranties: uniq(r => r.stop.warrantyType || "") };
    }, [rows]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = rows.filter(r => {
            if (fStatus !== "todas" && statusOf(r) !== fStatus) return false;
            if (fWarranty !== "todas" && (r.stop.warrantyType || "") !== fWarranty) return false;
            if (fCity !== "todas" && (r.stop.city || "") !== fCity) return false;
            if (fTurn !== "todas" && (r.stop.turn || "") !== fTurn) return false;
            if (!q) return true;
            const hay = [r.stop.serviceOrder, r.stop.ascJobNumber, r.stop.consumerName, r.stop.city, r.stop.neighborhood, r.stop.model, ...(r.stop.parts || []).map(p => p.code)].join(" ").toLowerCase();
            return hay.includes(q);
        });
        const col = COLUMNS.find(c => c.key === sort.key);
        const val = (r: Row): string | number => {
            if (col) return col.value(r);
            if (sort.key === "day") return r.day || "9999";
            return statusOf(r);
        };
        const dir = sort.dir === "asc" ? 1 : -1;
        return [...list].sort((a, b) => {
            const va = val(a), vb = val(b);
            if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
            return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
        });
    }, [rows, search, fStatus, fWarranty, fCity, fTurn, sort]);

    const summary = useMemo(() => ({
        total: rows.length,
        finalized: rows.filter(r => r.finalizedAt).length,
        scheduled: rows.filter(r => !r.finalizedAt && r.childName).length,
        withDay: rows.filter(r => !r.finalizedAt && !r.childName && r.day).length,
        open: rows.filter(r => !r.finalizedAt && !r.childName && !r.day).length,
        parts: rows.reduce((a, r) => a + r.partsTotal, 0),
        tracked: rows.reduce((a, r) => a + r.partsTracked, 0),
    }), [rows]);

    const toggleSort = (key: SortKey) => setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    const sortIcon = (key: SortKey) => (sort.key !== key ? <ArrowUpDown className="h-3 w-3 opacity-40" /> : sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />);

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
            let created = 0;
            for (const [day, list] of pendingDays) {
                const [y, m, d] = day.split("-").map(Number);
                const dayDate = new Date(y, m - 1, d, 8, 0, 0);
                const label = format(dayDate, "dd/MM/yyyy");
                let stops: RouteStop[] = list.map(r => ({ ...r.stop, firstVisitDate: label }));
                if (optimize && stops.length > 2) {
                    try { stops = (await optimizeRouteStopsAsync(stops, "Aracaju", activeUnidadeId)).stops; } catch (e) { console.warn("Otimização falhou, mantendo a ordem da tabela", e); }
                }
                await routeService.create({
                    name: route.name + " — " + format(dayDate, "dd/MM"),
                    stops,
                    routeType: route.routeType,
                    plannedDate: dayDate,
                    departureDate: dayDate,
                    isActive: false,
                    isDraft: true,
                    parentRouteId: route.id,
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

            {children.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rotas filhas</p>
                    <div className="flex flex-wrap gap-2">
                        {children.map(c => (
                            <Link key={c.id} href="/admin/routes" className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-muted" title="Abrir em Rotas">
                                <RouteIcon className="h-3 w-3" /> {c.name} · {c.stops.length} OS
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{c.isCanceled ? "Cancelada" : c.isDraft ? "Rascunho" : c.isActive ? "Ativa" : "Finalizada"}</Badge>
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-9 w-[240px] pl-7 text-sm" placeholder="Buscar OS, cliente, cidade, modelo, peça…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {([
                    { label: "Status", value: fStatus, set: setFStatus, items: ["Finalizada", "Programada", "Com dia", "Pendência", "A programar"] },
                    { label: "OW/LP", value: fWarranty, set: setFWarranty, items: options.warranties },
                    { label: "Cidade", value: fCity, set: setFCity, items: options.cities },
                    { label: "Turno", value: fTurn, set: setFTurn, items: options.turns },
                ]).map(f => (
                    <div key={f.label} className="space-y-0.5">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                        <Select value={f.value} onValueChange={f.set}>
                            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todas">Todos</SelectItem>
                                {f.items.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                ))}
                <p className="text-xs text-muted-foreground ml-auto self-center">{visible.length} de {rows.length} OS</p>
            </div>

            {/* Programar dia nas selecionadas */}
            <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 transition-colors", selected.size > 0 ? "bg-primary/5 border-primary/40" : "bg-muted/30")}>
                <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
                <Input type="date" className="h-8 w-[160px] text-xs" value={bulkDay} onChange={e => setBulkDay(e.target.value)} />
                <Button size="sm" disabled={selected.size === 0 || !bulkDay || saving} onClick={async () => { await setDays(Array.from(selected), bulkDay); setSelected(new Set()); }}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />} Programar para este dia
                </Button>
                <Button size="sm" variant="ghost" disabled={selected.size === 0 || saving} onClick={async () => { await setDays(Array.from(selected), ""); setSelected(new Set()); }}>Limpar dia</Button>
                <span className="text-[11px] text-muted-foreground">Só OS não finalizadas e sem rota filha podem ser selecionadas.</span>
            </div>

            {/* Tabela */}
            <div className="rounded-lg border overflow-auto max-h-[68vh]">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                        <tr>
                            <th className="px-2 py-2 w-8"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} className="border-white data-[state=checked]:bg-white data-[state=checked]:text-slate-900" /></th>
                            {COLUMNS.map(c => (
                                <th key={c.key} className="px-2 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort(c.key)}>
                                    <span className="inline-flex items-center gap-1">{c.label} {sortIcon(c.key)}</span>
                                </th>
                            ))}
                            <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">Peças</th>
                            <th className="px-2 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("day")}>
                                <span className="inline-flex items-center gap-1">Dia {sortIcon("day")}</span>
                            </th>
                            <th className="px-2 py-2 text-left font-semibold whitespace-nowrap cursor-pointer select-none" onClick={() => toggleSort("status")}>
                                <span className="inline-flex items-center gap-1">Situação {sortIcon("status")}</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((r, i) => {
                            const so = r.stop.serviceOrder;
                            const done = !!r.finalizedAt;
                            return (
                                <tr key={so} className={cn("border-b", i % 2 ? "bg-muted/20" : "", done && "opacity-60", selected.has(so) && "bg-primary/10")}>
                                    <td className="px-2 py-1.5">
                                        <Checkbox
                                            checked={selected.has(so)}
                                            disabled={!selectable(r)}
                                            onCheckedChange={() => setSelected(prev => { const n = new Set(prev); n.has(so) ? n.delete(so) : n.add(so); return n; })}
                                        />
                                    </td>
                                    {COLUMNS.map(c => {
                                        const v = c.key === "tat" ? (r.stop.tat || "") : c.key === "request" ? (r.stop.requestDate || "") : c.key === "visit" ? (r.stop.firstVisitDate || "") : c.value(r);
                                        return (
                                            <td key={c.key} className={cn("px-2 py-1.5 whitespace-nowrap", c.className, c.key === "name" && "whitespace-normal")}>
                                                {c.key === "warranty" && v ? (
                                                    <span className={cn("text-[10px] font-bold px-1 rounded", String(v).toUpperCase() === "LP" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}>{String(v)}</span>
                                                ) : String(v)}
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 py-1.5 font-mono text-[10px] max-w-[220px]">
                                        {(r.stop.parts || []).map(p => (
                                            <span key={p.code} className={cn("mr-1 inline-flex items-center gap-0.5", (p.trackingCode || "").trim() ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")} title={(p.description || "") + ((p.trackingCode || "").trim() ? " — rastreio " + p.trackingCode : " — sem rastreio")}>
                                                {(p.trackingCode || "").trim() ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}{p.code}{p.quantity > 1 ? " x" + p.quantity : ""}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        {selectable(r) ? (
                                            <Input
                                                type="date"
                                                className="h-7 w-[132px] text-[11px] px-1.5"
                                                value={r.day}
                                                onChange={e => setDays([so], e.target.value)}
                                                title={r.day ? format(new Date(r.day + "T12:00:00"), "EEEE", { locale: ptBR }) : "Definir o dia"}
                                            />
                                        ) : (
                                            <span className="text-muted-foreground">{r.day ? format(new Date(r.day + "T12:00:00"), "dd/MM") : "—"}</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5">{statusBadge(r)}</td>
                                </tr>
                            );
                        })}
                        {visible.length === 0 && (
                            <tr><td colSpan={COLUMNS.length + 4} className="text-center text-muted-foreground py-8">Nenhuma OS com esses filtros.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

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
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={optimize} onChange={e => setOptimize(e.target.checked)} />
                        <span>Roteirizar cada dia (melhor ordem de atendimento saindo da base)</span>
                    </label>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateChildren} disabled={creatingChildren}>
                            {creatingChildren ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Criar {pendingDays.length} rota(s)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
