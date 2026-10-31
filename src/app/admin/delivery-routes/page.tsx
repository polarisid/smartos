"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mail, FilePlus2, Copy, FileText, Download, Pencil, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarPlus, CheckCircle2, ChevronDown, Columns3, ExternalLink, Loader2, Package, PlusCircle, RefreshCw, Route as RouteIcon, Search, Star, Trash2, Truck, Users, X } from "lucide-react";
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
import { reconstructRouteText } from "@/lib/routeText";
import { copyToClipboard } from "@/lib/clipboard";
import { RouteCodeTag } from "@/components/routes/RouteCodeTag";
import { MultiFilter } from "@/components/MultiFilter";
import { configService } from "@/services/supabase/configService";
import { downloadSpreadsheet, type SheetRow } from "@/lib/spreadsheetXml";
import { fetchDurationMatrixMin, fetchLegDistancesAndDurations, geocodeBase } from "@/lib/routeLegs";
import { MAX_TEAMS, NO_TEAM, childRouteName, groupByTeam, splitStopsIntoTeams, teamColor, teamCounts, teamLabel, teamOf, type TeamSplit } from "@/lib/deliveryTeams";
import { copyRouteEmailToClipboard } from "@/lib/emailExport";
import { DEFAULT_PLANNING_PARAMS, simulateRoutePlan, formatClock } from "@/lib/routePlanning";
import type { Route, RoutePart, RoutePoint, RouteStop } from "@/lib/data";
import { routeService, RouteConflictError } from "@/services/supabase/routeService";
import { buildOrderHistory } from "@/lib/deliveryHistory";
import { DeliveryHistoryNotice } from "@/components/routes/DeliveryHistoryNotice";

// ─── Rota de entrega ("rota mãe") ───────────────────────────────────────────────────────────────
// Controla o envio das peças e das OS. Daqui saem rotas filhas por dia, só com as OS ainda não
// finalizadas. Não aparece para os técnicos.

type Row = {
    stop: RouteStop;
    finalizedAt: Date | null;     // OS lançada como finalizada depois da criação da rota de entrega
    pendingAt: Date | null;       // última visita ficou com pendência
    pendingNote: string;          // motivo e observações que o técnico registrou nessa pendência
    childName: string | null;     // rota filha que já leva esta OS
    day: string;                  // AAAA-MM-DD programado ("" = sem dia)
    team: number;                 // equipe (1 = A, 2 = B...; 0 = sem equipe)
    partsTotal: number;
    partsTracked: number;
};

type SortKey = "so" | "asc" | "name" | "city" | "neighborhood" | "uf" | "model" | "turn" | "tat" | "tatNow" | "request" | "visit" | "ts" | "warranty" | "order" | "team" | "day" | "status";

const parseBrDate = (text?: string): number => {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text || "");
    if (!m) return 0;
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
};

// Pendência lançada pelo técnico vale mais que "Programada": a OS foi visitada e não foi concluída. Só deixa de valer se a OS
// foi reprogramada para um dia POSTERIOR ao da pendência (aí volta a ser Programada / Com dia). O mesmo dia não conta: é o
// dia da própria visita que gerou a pendência (ex.: técnico pediu mais peça na visita programada para hoje).
const isPending = (r: Row) => !!r.pendingAt && !(r.day && new Date(r.day + "T00:00:00").getTime() > new Date(r.pendingAt.getFullYear(), r.pendingAt.getMonth(), r.pendingAt.getDate(), 23, 59, 59, 999).getTime());
const statusOf = (r: Row) => (r.finalizedAt ? "Finalizada" : isPending(r) ? "Pendência" : r.childName ? "Programada" : r.day ? "Com dia" : "A programar");

// TAT atual: dias desde a data da solicitação até (1) a finalização, se já foi atendida; (2) o dia programado, se
// está programada; (3) hoje, se ainda não tem dia. Devolve também até quando foi contado, para explicar na tela.
const MS_DAY = 24 * 60 * 60 * 1000;
function tatNow(r: Row): { days: number; until: string; label: string } | null {
    const start = parseBrDate(r.stop.requestDate);
    if (!start) return null;
    const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
    let end: Date; let until: string; let label: string;
    if (r.finalizedAt) { end = new Date(r.finalizedAt); until = "finalização"; label = "até a finalização (" + format(end, "dd/MM") + ")"; }
    else if (r.day) { end = new Date(r.day + "T12:00:00"); until = "dia programado"; label = "até o dia programado (" + format(end, "dd/MM") + ")"; }
    else { end = new Date(); until = "hoje"; label = "até hoje (sem dia programado)"; }
    end.setHours(0, 0, 0, 0);
    return { days: Math.max(0, Math.round((end.getTime() - startDay.getTime()) / MS_DAY)), until, label };
}

const COLUMNS: Array<{ key: SortKey; label: string; value: (r: Row) => string | number; className?: string }> = [
    { key: "so", label: "SO Nro.", value: r => r.stop.serviceOrder, className: "font-mono font-semibold" },
    { key: "team", label: "Equipe", value: r => r.team, className: "text-center" },
    { key: "order", label: "Ordem", value: r => r.stop.routeOrder ?? 999999, className: "font-mono font-bold text-center" },
    { key: "asc", label: "ASC Job No.", value: r => r.stop.ascJobNumber || "" },
    { key: "name", label: "Nome Consumidor", value: r => r.stop.consumerName || "", className: "min-w-[180px]" },
    { key: "city", label: "Cidade", value: r => r.stop.city || "" },
    { key: "neighborhood", label: "Bairro", value: r => r.stop.neighborhood || "" },
    { key: "uf", label: "UF", value: r => r.stop.state || "" },
    { key: "model", label: "Modelo", value: r => r.stop.model || "", className: "font-mono text-[11px]" },
    { key: "turn", label: "Turno", value: r => r.stop.turn || "" },
    { key: "tat", label: "TAT", value: r => Number(String(r.stop.tat || "").replace(/\D/g, "")) || 0 },
    { key: "tatNow", label: "TAT atual", value: r => tatNow(r)?.days ?? -1, className: "tabular-nums" },
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
    // Quais OS da planilha já foram em entregas anteriores (e quais peças já foram enviadas).
    const [skipSent, setSkipSent] = useState(false);
    const newHistory = useMemo(() => buildOrderHistory(parsed, routes), [parsed, routes]);
    const toCreate = useMemo(() => (skipSent ? parsed.filter(st => !newHistory.get(st.serviceOrder.trim().toUpperCase())?.allPartsSent) : parsed), [parsed, skipSent, newHistory]);

    const handleCreate = async () => {
        if (!newName.trim() || toCreate.length === 0) {
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
                stops: toCreate,
                kind: "delivery",
                isActive: true,
                isDraft: false,
                createdAt: new Date(),
            } as Omit<Route, "id">, activeUnidadeId);
            await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
            toast({ title: "Rota de entrega criada", description: toCreate.length + " OS importadas." + (toCreate.length < parsed.length ? " " + (parsed.length - toCreate.length) + " ficaram de fora por já terem as peças enviadas." : "") });
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
                <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
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
                            <Textarea className="min-h-[140px] max-h-[22vh] font-mono text-xs" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Cole aqui o conteúdo da planilha (Ctrl+A → Ctrl+C no Excel)…" />
                        </div>
                        <DeliveryHistoryNotice history={newHistory} skipSent={skipSent} onSkipSentChange={setSkipSent} />
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
    const [fTeam, setFTeam] = useState<Set<string>>(new Set());
    const [hidden, setHidden] = useState<Set<string>>(new Set(initialPrefs.hidden || []));
    const [dense, setDense] = useState<boolean>(initialPrefs.dense ?? true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkDay, setBulkDay] = useState("");
    const [saving, setSaving] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [optimize, setOptimize] = useState(true);
    const [creatingChildren, setCreatingChildren] = useState(false);
    const [createProgress, setCreateProgress] = useState("");
    const [optimizingOrder, setOptimizingOrder] = useState(false);

    // Texto da rota (formato da planilha) e remoção de OS da rota de entrega.
    const [textOpen, setTextOpen] = useState(false);
    const [removeList, setRemoveList] = useState<string[] | null>(null);
    const [removing, setRemoving] = useState(false);
    const [copyingEmail, setCopyingEmail] = useState(false);

    // Adicionar mais OS à rota de entrega: cola linhas da planilha (com o cabeçalho). OS que já estão na rota são ignoradas.
    const [addOpen, setAddOpen] = useState(false);
    const [addText, setAddText] = useState("");
    const [adding, setAdding] = useState(false);
    const addParsed = useMemo(() => (addText.trim() ? parseRouteText(addText) : []), [addText]);
    const [addSkipSent, setAddSkipSent] = useState(false);
    // Rotas de entrega anteriores (mesma consulta da lista, compartilhada pelo cache).
    const { data: allDeliveryRoutes = [] } = useQuery({
        queryKey: ["delivery-routes", appUser?.uid, activeUnidadeId],
        queryFn: () => routeService.getDeliveryRoutes(activeUnidadeId),
        enabled: !!appUser?.uid,
        refetchInterval: 30000,
    });
    const addPreview = useMemo(() => {
        const existing = new Set((route?.stops || []).filter(st => !st.isReallocated).map(st => st.serviceOrder));
        const seen = new Set<string>();
        const candidates: RouteStop[] = [];
        let dups = 0;
        addParsed.forEach(st => {
            if (!st.serviceOrder) return;
            if (existing.has(st.serviceOrder) || seen.has(st.serviceOrder)) { dups++; return; }
            seen.add(st.serviceOrder);
            candidates.push(st);
        });
        const history = buildOrderHistory(candidates, allDeliveryRoutes, routeId);
        const fresh = addSkipSent ? candidates.filter(st => !history.get(st.serviceOrder.trim().toUpperCase())?.allPartsSent) : candidates;
        return { fresh, dups, history };
    }, [addParsed, route, allDeliveryRoutes, routeId, addSkipSent]);

    // Peças da OS: enquanto uma peça ainda não tem rastreio (não foi enviada), dá para trocar o código, a descrição e a
    // quantidade, remover ou incluir outra. Peça com rastreio fica travada (já foi enviada).
    type PartDraft = { origCode: string | null; code: string; description: string; quantity: number; tracking: string; removed?: boolean };
    const [partsRow, setPartsRow] = useState<Row | null>(null);
    const [partsDraft, setPartsDraft] = useState<PartDraft[]>([]);
    const [partsSaving, setPartsSaving] = useState(false);
    const openParts = (row: Row) => {
        setPartsRow(row);
        setPartsDraft((row.stop.parts || []).map(p => ({ origCode: p.code, code: p.code, description: p.description || "", quantity: p.quantity || 1, tracking: (p.trackingCode || "").trim() })));
    };
    const updateDraft = (i: number, patch: Partial<PartDraft>) => setPartsDraft(cur => cur.map((d, k) => (k === i ? { ...d, ...patch } : d)));
    const handleSaveParts = async () => {
        if (!partsRow) return;
        const so = partsRow.stop.serviceOrder;
        const live = partsDraft.filter(d => !d.removed);
        if (live.some(d => !d.tracking && !d.code.trim())) { toast({ variant: "destructive", title: "Informe o código de todas as peças" }); return; }
        const codes = live.map(d => d.code.trim().toLowerCase());
        if (new Set(codes).size !== codes.length) { toast({ variant: "destructive", title: "Há peças com o mesmo código", description: "Some a quantidade em uma só." }); return; }
        setPartsSaving(true);
        try {
            const originals = partsRow.stop.parts || [];
            const newParts: RoutePart[] = live.map(d => {
                if (d.tracking) return originals.find(p => p.code === d.origCode) as RoutePart;
                return { code: d.code.trim(), description: d.description.trim(), quantity: Math.max(1, Number(d.quantity) || 1) };
            });
            await routeService.patchStopFields(routeId, [{ serviceOrder: so, fields: { parts: newParts } }]);

            // As rotas dos dias que levam esta OS recebem a mesma troca (sem mexer em peça que já tem rastreio lá).
            const applyToChild = (childParts: RoutePart[]) => {
                const removedOrig = partsDraft.filter(d => d.removed && d.origCode && !d.tracking).map(d => d.origCode as string);
                const out = childParts.filter(p => !(removedOrig.includes(p.code) && !(p.trackingCode || "").trim()));
                live.filter(d => !d.tracking).forEach(d => {
                    const np = { code: d.code.trim(), description: d.description.trim(), quantity: Math.max(1, Number(d.quantity) || 1) };
                    const idx = d.origCode ? out.findIndex(p => p.code === d.origCode && !(p.trackingCode || "").trim()) : -1;
                    if (idx >= 0) out[idx] = { ...out[idx], ...np };
                    else if (!out.some(p => p.code === np.code)) out.push(np);
                });
                return out;
            };
            for (const child of children.filter(c => !c.isCanceled)) {
                if (!(child.stops || []).some(cs => cs.serviceOrder === so && !cs.isReallocated)) continue;
                const fresh = await routeService.getById(child.id);
                const st = (fresh?.stops || []).find(cs => cs.serviceOrder === so && !cs.isReallocated);
                if (!fresh || !st) continue;
                await routeService.patchStopFields(child.id, [{ serviceOrder: so, fields: { parts: applyToChild(st.parts || []) } }]);
            }
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            await refresh();
            setPartsRow(null);
            toast({ title: "Peças da OS " + so + " atualizadas" });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível salvar as peças", description: e?.message });
        } finally {
            setPartsSaving(false);
        }
    };

    // Reprogramar uma OS que já está numa rota dos dias (cliente desistiu, remarcou, ausente...): ela sai da rota atual
    // (fica como "Realocada" nela) e vai para outra rota já programada ou para um novo dia.
    const [reprogramRow, setReprogramRow] = useState<Row | null>(null);
    const [reprogramMode, setReprogramMode] = useState<"existing" | "day">("existing");
    const [reprogramTarget, setReprogramTarget] = useState("");
    const [reprogramDay, setReprogramDay] = useState("");
    const [reprogramReason, setReprogramReason] = useState("");
    const [reprogramming, setReprogramming] = useState(false);


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

    // Sugestão de datas: distribui as OS (já na ordem otimizada) pelos dias de trabalho, respeitando expediente, almoço,
    // tempos de atendimento e deslocamento (os mesmos parâmetros do Planejamento).
    const { data: planningParams = DEFAULT_PLANNING_PARAMS } = useQuery({
        queryKey: ["planning-params", appUser?.uid, activeUnidadeId],
        queryFn: () => configService.getPlanningParams(activeUnidadeId),
        enabled: !!appUser?.uid,
        staleTime: 5 * 60 * 1000,
    });
    const [dateStops, setDateStops] = useState<RouteStop[] | null>(null);
    const nextWorkday = () => { const d = new Date(); d.setDate(d.getDate() + 1); return format(d, "yyyy-MM-dd"); };
    const [sugStart, setSugStart] = useState<string>(nextWorkday);
    const [sugTime, setSugTime] = useState("08:00");
    const [sugRoundTrip, setSugRoundTrip] = useState(false);
    const [sugLoading, setSugLoading] = useState(false);
    const [sugApplying, setSugApplying] = useState(false);
    const [sugDays, setSugDays] = useState<Array<{ day: string; date: Date; stops: RouteStop[]; endMin: number; team: number }> | null>(null);
    useEffect(() => { if (route?.dailyReturn) setSugRoundTrip(true); }, [route?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!dateStops || dateStops.length === 0) { setSugDays(null); return; }
        let cancelled = false;
        (async () => {
            setSugLoading(true);
            try {
                const [y, m, d] = sugStart.split("-").map(Number);
                const startDate = new Date(y, (m || 1) - 1, d || 1, 8, 0, 0);
                // Equipes trabalham em paralelo: cada uma é simulada sozinha, todas a partir do mesmo primeiro dia.
                const allDays: Array<{ day: string; date: Date; stops: RouteStop[]; endMin: number; team: number }> = [];
                for (const group of groupByTeam(dateStops, st => teamOf(st))) {
                    const teamStops = group.items;
                    const n = teamStops.length;
                    const matrix = await fetchDurationMatrixMin(teamStops, "Aracaju", activeUnidadeId, { start: startPt, end: endPt });
                    const legs = teamStops.map((_, i) => (i === 0 ? matrix[0][1] : matrix[i][i + 1]));
                    legs.push(matrix[n][n + 1]);
                    const plan = simulateRoutePlan(teamStops, legs, planningParams, startDate, sugTime, sugRoundTrip ? {
                        fromBase: teamStops.map((_, i) => matrix[0][i + 1]),
                        toBase: teamStops.map((_, i) => matrix[i + 1][n + 1]),
                    } : undefined);
                    plan.days.filter(day => day.stopIndexes.length > 0).forEach(day => allDays.push({
                        day: format(day.date, "yyyy-MM-dd"),
                        date: day.date,
                        stops: day.stopIndexes.map(i => teamStops[i]),
                        endMin: day.endMin,
                        team: group.team,
                    }));
                }
                if (cancelled) return;
                setSugDays(allDays.sort((a, b) => a.day.localeCompare(b.day) || a.team - b.team));
            } catch (e) {
                if (!cancelled) { setSugDays(null); toast({ variant: "destructive", title: "Não foi possível calcular as datas", description: (e as any)?.message }); }
            } finally {
                if (!cancelled) setSugLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [dateStops, sugStart, sugTime, sugRoundTrip, startPt, endPt, planningParams]); // eslint-disable-line react-hooks/exhaustive-deps
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
            const child = activeChildren.find(c => (c.stops || []).some(cs => cs.serviceOrder === stop.serviceOrder && !cs.isReallocated));
            const parts = stop.parts || [];
            return {
                stop,
                finalizedAt: last && last.isFinalized !== false ? last.date : null,
                pendingAt: last && last.isFinalized === false ? last.date : null,
                pendingNote: last && last.isFinalized === false
                    ? [last.pendingReason ? "Motivo: " + last.pendingReason : "", last.observations ? "Observações: " + last.observations : ""].filter(Boolean).join("\n") || "Sem motivo registrado pelo técnico."
                    : "",
                childName: child ? child.name : null,
                day: stop.plannedDay || "",
                team: teamOf(stop),
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
            teams: count(r => teamLabel(r.team)),
            statuses: STATUS_ORDER.map(value => ({ value, count: statusCounts.get(value) || 0 })),
        };
    }, [rows]);

    const currentPrefs = (): Prefs => ({
        status: [...fStatus], warranty: [...fWarranty], city: [...fCity], neighborhood: [...fNeighborhood], turn: [...fTurn],
        hidden: [...hidden], sort: sorts[0] || { key: "so", dir: "asc" }, sorts, dense,
    });
    const clearFilters = () => { setFStatus(new Set()); setFWarranty(new Set()); setFCity(new Set()); setFNeighborhood(new Set()); setFTurn(new Set()); setFTeam(new Set()); setSearch(""); };
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
        ...[...fTeam].map(v => ({ label: "Equipe", value: v, remove: () => setFTeam(s => drop(s, v)) })),
    ];

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = rows.filter(r => {
            if (fStatus.size && !fStatus.has(statusOf(r))) return false;
            if (fWarranty.size && !fWarranty.has(r.stop.warrantyType || "")) return false;
            if (fCity.size && !fCity.has(r.stop.city || "")) return false;
            if (fNeighborhood.size && !fNeighborhood.has(r.stop.neighborhood || "")) return false;
            if (fTurn.size && !fTurn.has(r.stop.turn || "")) return false;
            if (fTeam.size && !fTeam.has(teamLabel(r.team))) return false;
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
    }, [rows, search, fStatus, fWarranty, fCity, fNeighborhood, fTurn, fTeam, sorts]);

    const summary = useMemo(() => ({
        total: rows.length,
        finalized: rows.filter(r => r.finalizedAt).length,
        scheduled: rows.filter(r => statusOf(r) === "Programada").length,
        pending: rows.filter(r => statusOf(r) === "Pendência").length,
        withDay: rows.filter(r => statusOf(r) === "Com dia").length,
        open: rows.filter(r => statusOf(r) === "A programar").length,
        parts: rows.reduce((a, r) => a + r.partsTotal, 0),
        tracked: rows.reduce((a, r) => a + r.partsTracked, 0),
    }), [rows]);

    // Escopo da otimização: as OS selecionadas; sem seleção, as que estão na tabela (respeitando os filtros), sem as finalizadas.
    const orderScope = () => {
        const base = selected.size > 0 ? visible.filter(r => selected.has(r.stop.serviceOrder)) : visible.filter(r => !r.finalizedAt);
        return base;
    };
    const handleOptimizeOrder = async () => {
        const scope = orderScope();
        if (scope.length < 3) {
            toast({ variant: "destructive", title: "Poucas OS para otimizar", description: "Selecione ou filtre pelo menos 3 OS." });
            return;
        }
        setOptimizingOrder(true);
        try {
            await prewarmStopCoordinates(scope.map(r => r.stop), "Aracaju");
            // Cada equipe tem a sua própria ordem (1, 2, 3...); sem equipes é um grupo só, como sempre foi.
            const groups = groupByTeam(scope, r => r.team);
            const patches: Array<{ serviceOrder: string; fields: Record<string, unknown> }> = [];
            const ordered: RouteStop[] = [];
            for (const g of groups) {
                const stops = g.items.map(r => r.stop);
                const optimized = stops.length > 2
                    ? (await optimizeRouteStopsAsync(stops, "Aracaju", activeUnidadeId, { start: startPt, end: endPt })).stops
                    : stops;
                optimized.forEach((st, i) => patches.push({ serviceOrder: st.serviceOrder, fields: { routeOrder: i + 1 } }));
                ordered.push(...optimized.map(st => ({ ...st, team: g.team > 0 ? g.team : undefined })));
            }
            await routeService.patchStopFields(routeId, patches);
            await refresh();
            setSorts(groups.length > 1 || groups[0]?.team ? [{ key: "team", dir: "asc" }, { key: "order", dir: "asc" }] : [{ key: "order", dir: "asc" }]);
            openDateSuggestion(ordered);
            toast({
                title: "Ordem otimizada: " + patches.length + " OS" + (groups.length > 1 || groups[0]?.team ? " em " + groups.length + " grupo(s) de equipe" : ""),
                description: (startPt ? "Saindo de " + startPt.address : "Saindo da base") + (endPt ? " e voltando para " + endPt.address : " e voltando à base") + ". A tabela foi ordenada pela coluna Ordem.",
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível otimizar a ordem", description: e?.message });
        } finally {
            setOptimizingOrder(false);
        }
    };
    // Só entram na sugestão OS que ainda podem ser programadas (sem finalizar e sem rota filha).
    const openDateSuggestion = (ordered: RouteStop[]) => {
        const free = new Set(rows.filter(r => !r.finalizedAt && !r.childName).map(r => r.stop.serviceOrder));
        const list = ordered.filter(st => free.has(st.serviceOrder));
        if (list.length === 0) {
            toast({ variant: "destructive", title: "Nenhuma OS livre para programar", description: "As OS escolhidas já foram finalizadas ou já estão em rota filha." });
            return;
        }
        setDateStops(list);
    };
    const suggestFromCurrentOrder = () => {
        const scope = orderScope().filter(r => r.stop.routeOrder).sort((a, b) => (a.stop.routeOrder || 0) - (b.stop.routeOrder || 0));
        if (scope.length === 0) {
            toast({ variant: "destructive", title: "Otimize a ordem primeiro", description: "As datas são sugeridas a partir da ordem otimizada." });
            return;
        }
        openDateSuggestion(scope.map(r => r.stop));
    };
    const applyDateSuggestion = async () => {
        if (!sugDays) return;
        setSugApplying(true);
        try {
            const patches = sugDays.flatMap(d => d.stops.map(st => ({ serviceOrder: st.serviceOrder, fields: { plannedDay: d.day } })));
            await routeService.patchStopFields(routeId, patches);
            await refresh();
            setDateStops(null);
            const teamsUsed = new Set(sugDays.map(d => d.team)).size;
            toast({ title: "Datas aplicadas", description: patches.length + " OS programadas em " + sugDays.length + (teamsUsed > 1 ? " dia(s) de equipe (" + teamsUsed + " equipes em paralelo)" : " dia(s)") + ". Ajuste na coluna Dia se precisar." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível aplicar as datas", description: e?.message });
        } finally {
            setSugApplying(false);
        }
    };

    const childDay = (c: Route): string => {
        const dt = c.plannedDate || c.departureDate;
        return dt ? format(new Date(dt), "yyyy-MM-dd") : "";
    };
    const openReprogram = (row: Row) => {
        const sourceChild = children.filter(c => !c.isCanceled).find(c => (c.stops || []).some(cs => cs.serviceOrder === row.stop.serviceOrder && !cs.isReallocated));
        const others = children.filter(c => !c.isCanceled && c.id !== sourceChild?.id);
        setReprogramRow(row);
        setReprogramMode(others.length > 0 ? "existing" : "day");
        setReprogramTarget(others[0]?.id || "");
        const t = new Date(); t.setDate(t.getDate() + 1);
        setReprogramDay(format(t, "yyyy-MM-dd"));
        setReprogramReason("");
    };
    const handleReprogram = async () => {
        if (!reprogramRow) return;
        const so = reprogramRow.stop.serviceOrder;
        const activeChildren = children.filter(c => !c.isCanceled);
        const source = activeChildren.find(c => (c.stops || []).some(cs => cs.serviceOrder === so && !cs.isReallocated));
        let target: Route | undefined;
        let day = reprogramDay;
        if (reprogramMode === "existing") {
            target = activeChildren.find(c => c.id === reprogramTarget);
            if (!target) { toast({ variant: "destructive", title: "Escolha a rota de destino" }); return; }
            day = childDay(target) || day;
        } else {
            if (!reprogramDay) { toast({ variant: "destructive", title: "Escolha o novo dia" }); return; }
            // Já existe rota nesse dia? Então a OS entra nela em vez de ficar esperando uma rota nova.
            target = activeChildren.find(c => c.id !== source?.id && childDay(c) === reprogramDay);
        }
        setReprogramming(true);
        try {
            const [y, m, d] = (day || reprogramDay).split("-").map(Number);
            const label = format(new Date(y, (m || 1) - 1, d || 1), "dd/MM/yyyy");
            const reason = reprogramReason.trim();
            const targetName = target ? target.name : "Reprogramada para " + label.slice(0, 5);
            const movedStop = (source?.stops || []).find(cs => cs.serviceOrder === so) || reprogramRow.stop;

            // 1) Sai da rota atual: fica marcada como realocada (o técnico vê onde ela foi parar).
            if (source) {
                await routeService.patchStopFields(source.id, [{
                    serviceOrder: so,
                    fields: { isReallocated: true, reallocatedToRouteName: targetName + (reason ? " (" + reason + ")" : "") },
                }]);
            }

            // 2) Entra na rota de destino (com a trava de edição simultânea).
            if (target) {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const fresh = await routeService.getById(target.id);
                    if (!fresh) throw new Error("Rota de destino não encontrada");
                    if ((fresh.stops || []).some(st => st.serviceOrder === so && !st.isReallocated)) break;
                    const { routeOrder: _drop, ...clean } = movedStop;
                    const stops = [...(fresh.stops || []).filter(st => st.serviceOrder !== so), { ...clean, firstVisitDate: label, isReallocated: false, reallocatedToRouteName: undefined } as RouteStop];
                    try {
                        await routeService.update(target.id, { stops }, { expectedUpdatedAt: fresh.updatedAt || null });
                        break;
                    } catch (e) {
                        if (e instanceof RouteConflictError) continue;
                        throw e;
                    }
                }
            }

            // 3) Controle da rota de entrega: o dia programado passa a ser o novo.
            await routeService.patchStopFields(routeId, [{ serviceOrder: so, fields: { plannedDay: day || reprogramDay } }]);
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            await refresh();
            setReprogramRow(null);
            toast({
                title: "OS " + so + " reprogramada",
                description: target
                    ? "Agora está em " + target.name + "."
                    : "Programada para " + label.slice(0, 5) + ". Use \"Criar rotas dos dias\" para gerar a rota desse dia.",
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível reprogramar", description: e?.message });
        } finally {
            setReprogramming(false);
        }
    };

    // Exporta a planilha de entrega inteira (ignora filtros): OS com situação e acompanhamento, uma aba só de peças
    // com rastreio e um resumo. Linhas coloridas pela situação.
    const handleExportSheet = () => {
        if (!route || rows.length === 0) {
            toast({ title: "Nada para exportar", description: "Esta rota de entrega não tem OS." });
            return;
        }
        const fmtDate = (d: Date | null) => (d ? format(d, "dd/MM/yyyy HH:mm") : "");
        const fmtDay = (day: string) => (day ? format(new Date(day + "T12:00:00"), "dd/MM/yyyy") : "");
        const childOf = (name: string | null) => (name ? children.find(c => c.name === name) : undefined);
        const childStatus = (c?: Route) => (!c ? "" : c.isCanceled ? "Cancelada" : c.isDraft ? "Rascunho" : c.isActive ? "Ativa" : "Finalizada");
        const toneOf = (st: string): SheetRow["tone"] => (st === "Finalizada" ? "green" : st === "Pendência" ? "red" : st === "Programada" ? "blue" : st === "Com dia" ? "amber" : "default");

        const ordered = [...rows].sort((a, b) =>
            (a.day || "9999").localeCompare(b.day || "9999") ||
            (a.stop.routeOrder ?? 999999) - (b.stop.routeOrder ?? 999999) ||
            a.stop.serviceOrder.localeCompare(b.stop.serviceOrder, "pt-BR", { numeric: true }));

        const osRows: SheetRow[] = ordered.map(r => {
            const st = statusOf(r);
            const child = childOf(r.childName);
            const parts = r.stop.parts || [];
            return {
                tone: toneOf(st),
                values: [
                    /^\d+$/.test(r.stop.serviceOrder) ? Number(r.stop.serviceOrder) : r.stop.serviceOrder,
                    r.stop.ascJobNumber || "", r.stop.consumerName || "", r.stop.city || "", r.stop.neighborhood || "", r.stop.state || "", r.stop.zipCode || "",
                    r.stop.model || "", r.stop.turn || "", r.stop.tat || "", tatNow(r)?.days ?? "", r.stop.requestDate || "", r.stop.firstVisitDate || "", r.stop.ts || "", r.stop.warrantyType || "",
                    st, fmtDay(r.day), r.stop.routeOrder ? r.stop.routeOrder : "",
                    r.childName || "", childStatus(child), child?.technicianName || "",
                    fmtDate(r.finalizedAt), fmtDate(r.pendingAt),
                    parts.map(p => p.code + (p.quantity > 1 ? " x" + p.quantity : "")).join(" | "),
                    parts.length, parts.filter(p => (p.trackingCode || "").trim()).length,
                    parts.filter(p => (p.trackingCode || "").trim()).map(p => p.code + ": " + p.trackingCode).join(" | "),
                ],
            };
        });

        const partRows: SheetRow[] = ordered.flatMap(r => {
            const st = statusOf(r);
            return (r.stop.parts || []).map(p => {
                const tracked = (p.trackingCode || "").trim();
                return {
                    tone: tracked ? "green" as const : "default" as const,
                    values: [
                        /^\d+$/.test(r.stop.serviceOrder) ? Number(r.stop.serviceOrder) : r.stop.serviceOrder,
                        r.stop.consumerName || "", r.stop.city || "", r.stop.neighborhood || "",
                        p.code, p.description || "", p.quantity || 1,
                        tracked ? "Enviada" : "Sem rastreio", tracked,
                        st, fmtDay(r.day), r.childName || "",
                    ],
                };
            });
        });

        const totalParts = rows.reduce((a, r) => a + r.partsTotal, 0);
        const trackedParts = rows.reduce((a, r) => a + r.partsTracked, 0);
        const count = (name: string) => rows.filter(r => statusOf(r) === name).length;
        const byDay = new Map<string, number>();
        rows.forEach(r => { if (r.day) byDay.set(r.day, (byDay.get(r.day) || 0) + 1); });
        const summaryRows: SheetRow[] = [
            { values: ["Rota de entrega", route.name] },
            { values: ["Criada em", format(new Date(route.createdAt), "dd/MM/yyyy")] },
            { values: ["Exportada em", format(new Date(), "dd/MM/yyyy HH:mm")] },
            { values: ["Saída", startPt ? startPt.address : "Base da unidade"] },
            { values: ["Retorno", endPt ? endPt.address : "Base da unidade"] },
            { values: ["OS na rota", rows.length] },
            { tone: "green", values: ["Finalizadas", count("Finalizada")] },
            { tone: "red", values: ["Com pendência", count("Pendência")] },
            { tone: "blue", values: ["Programadas (em rota dos dias)", count("Programada")] },
            { tone: "amber", values: ["Com dia, sem rota", count("Com dia")] },
            { values: ["A programar", count("A programar")] },
            { values: ["Peças no total", totalParts] },
            { tone: "green", values: ["Peças com rastreio (enviadas)", trackedParts] },
            { values: ["Peças sem rastreio", totalParts - trackedParts] },
            ...Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, n]) => ({ values: ["OS programadas em " + fmtDay(day), n] }) as SheetRow),
        ];

        downloadSpreadsheet(route.name + " - " + format(new Date(), "yyyy-MM-dd"), [
            { name: "Resumo", headers: ["Item", "Valor"], rows: summaryRows, widths: [38, 60] },
            {
                name: "OS", headers: [
                    "OS Nro.", "ASC Job No.", "Cliente", "Cidade", "Bairro", "UF", "CEP", "Modelo", "Turno", "TAT", "TAT atual (dias)", "Data Solicitação", "1st Visit Date", "TS", "OW/LP",
                    "Situação", "Dia programado", "Ordem", "Rota dos dias", "Situação da rota", "Técnico", "Finalizada em", "Pendência em",
                    "Peças", "Qtd peças", "Peças com rastreio", "Rastreios",
                ],
                rows: osRows,
                widths: [14, 16, 26, 16, 18, 10, 11, 18, 7, 6, 10, 13, 13, 6, 7, 13, 13, 7, 30, 12, 14, 16, 16, 40, 8, 10, 40],
            },
            {
                name: "Peças", headers: ["OS Nro.", "Cliente", "Cidade", "Bairro", "Código da peça", "Descrição", "Qtd", "Envio", "Rastreio", "Situação da OS", "Dia programado", "Rota dos dias"],
                rows: partRows,
                widths: [14, 26, 16, 18, 18, 36, 6, 12, 22, 13, 13, 30],
            },
        ]);
        toast({ title: "Planilha exportada", description: rows.length + " OS e " + partRows.length + " peças, com a situação de cada uma." });
    };

    const routeTextValue = useMemo(() => reconstructRouteText((route?.stops || []).filter(st => !st.isReallocated)), [route]);
    const handleCopyRouteText = async () => {
        const ok = await copyToClipboard(routeTextValue);
        toast(ok ? { title: "Texto copiado", description: "Cole onde precisar (planilha, e-mail, outra rota)." } : { variant: "destructive", title: "Não foi possível copiar", description: "Selecione o texto e copie à mão." });
    };

    // Remove OS da rota de entrega (lê a rota na hora e grava com a trava de edição simultânea).
    const handleRemoveOrders = async () => {
        if (!removeList || removeList.length === 0) return;
        setRemoving(true);
        try {
            const drop = new Set(removeList);
            for (let attempt = 0; attempt < 5; attempt++) {
                const fresh = await routeService.getById(routeId);
                if (!fresh) throw new Error("Rota de entrega não encontrada");
                const stops = (fresh.stops || []).filter(st => !drop.has(st.serviceOrder));
                try {
                    await routeService.update(routeId, { stops }, { expectedUpdatedAt: fresh.updatedAt || null });
                    break;
                } catch (e) {
                    if (e instanceof RouteConflictError && attempt < 4) continue;
                    throw e;
                }
            }
            setSelected(prev => { const n = new Set(prev); removeList.forEach(so => n.delete(so)); return n; });
            await refresh();
            toast({ title: removeList.length === 1 ? "OS " + removeList[0] + " removida" : removeList.length + " OS removidas", description: "Saiu da rota de entrega." });
            setRemoveList(null);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível remover", description: e?.message });
        } finally {
            setRemoving(false);
        }
    };

    // E-mail da rota de entrega no mesmo modelo das outras rotas ("Copiar para e-mail"): OS agrupadas por dia programado, com
    // km e tempo de cada trecho (saindo da base padrão e voltando a ela).
    const handleCopyEmail = async () => {
        if (!route) return;
        const ordered = [...rows].sort((a, b) =>
            (a.day || "9999").localeCompare(b.day || "9999") ||
            (a.stop.routeOrder ?? 999999) - (b.stop.routeOrder ?? 999999));
        if (ordered.length === 0) {
            toast({ title: "Nada para enviar", description: "Esta rota de entrega não tem OS." });
            return;
        }
        setCopyingEmail(true);
        try {
            const dayLabel = (day: string) => (day ? format(new Date(day + "T12:00:00"), "dd/MM/yyyy") : "");
            const stops: RouteStop[] = ordered.map(r => ({ ...r.stop, firstVisitDate: r.day ? dayLabel(r.day) : r.stop.firstVisitDate }));
            const legs = await fetchLegDistancesAndDurations(stops, "Aracaju", activeUnidadeId, { start: startPt, end: endPt });
            const days = ordered.map(r => r.day).filter(Boolean).sort();
            const emailRoute = {
                id: route.id,
                name: route.name,
                technicianName: "A definir",
                driverName: "A definir",
                driverId: "none",
                licensePlate: "",
                departureDate: days.length ? new Date(days[0] + "T12:00:00") : route.departureDate,
                arrivalDate: days.length ? new Date(days[days.length - 1] + "T12:00:00") : route.arrivalDate,
                routeType: route.routeType,
                isActive: false,
                isDraft: false,
                isCanceled: false,
                createdAt: new Date(),
                stops,
                startPoint: startPt,
                endPoint: endPt,
            } as unknown as Route;
            const totalKm = legs.km.reduce((a, b) => a + (b || 0), 0);
            const ok = await copyRouteEmailToClipboard({ route: emailRoute, legKm: legs.km, legDurationsMin: legs.durationMin, totalKm });
            toast(ok
                ? { title: "E-mail copiado!", description: "Cole no seu cliente de e-mail." }
                : { variant: "destructive", title: "Não foi possível copiar", description: "Tente novamente." });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível montar o e-mail", description: e?.message });
        } finally {
            setCopyingEmail(false);
        }
    };

    const handleAddOrders = async () => {
        if (addPreview.fresh.length === 0) return;
        setAdding(true);
        try {
            const newOnes = addPreview.fresh;
            for (let attempt = 0; attempt < 5; attempt++) {
                const fresh = await routeService.getById(routeId);
                if (!fresh) throw new Error("Rota de entrega não encontrada");
                const have = new Set((fresh.stops || []).filter(st => !st.isReallocated).map(st => st.serviceOrder));
                const toAdd = newOnes.filter(st => !have.has(st.serviceOrder));
                try {
                    await routeService.update(routeId, { stops: [...(fresh.stops || []), ...toAdd] }, { expectedUpdatedAt: fresh.updatedAt || null });
                    break;
                } catch (e) {
                    if (e instanceof RouteConflictError && attempt < 4) continue;
                    throw e;
                }
            }
            await refresh();
            toast({
                title: newOnes.length === 1 ? "1 OS adicionada" : newOnes.length + " OS adicionadas",
                description: addPreview.dups > 0 ? addPreview.dups + " já estavam na rota e foram ignoradas." : "Já aparecem na tabela, a programar.",
            });
            setAddOpen(false);
            setAddText("");
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível adicionar", description: e?.message });
        } finally {
            setAdding(false);
        }
    };

    const handleClearOrder = async () => {
        const scope = orderScope().filter(r => r.stop.routeOrder);
        if (scope.length === 0) return;
        setOptimizingOrder(true);
        try {
            await routeService.patchStopFields(routeId, scope.map(r => ({ serviceOrder: r.stop.serviceOrder, fields: { routeOrder: null } })));
            await refresh();
            toast({ title: "Ordem removida de " + scope.length + " OS" });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível limpar a ordem", description: e?.message });
        } finally {
            setOptimizingOrder(false);
        }
    };

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
    // Um grupo por dia e por equipe: com equipes, cada equipe tem a sua rota no dia.
    const pendingDays = useMemo(() => {
        const map = new Map<string, { day: string; team: number; list: Row[] }>();
        rows.filter(r => !r.finalizedAt && !r.childName && r.day).forEach(r => {
            const key = r.day + "|" + r.team;
            const g = map.get(key) || { day: r.day, team: r.team, list: [] };
            g.list.push(r);
            map.set(key, g);
        });
        return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day) || a.team - b.team);
    }, [rows]);

    const handleCreateChildren = async () => {
        if (!route || pendingDays.length === 0) return;
        setCreatingChildren(true);
        try {
            // 1) Endereços: geocodifica uma vez só os endereços distintos de todos os dias.
            const prepared = pendingDays.map(({ day, team, list }) => {
                const [y, m, d] = day.split("-").map(Number);
                const dayDate = new Date(y, m - 1, d, 8, 0, 0);
                const label = format(dayDate, "dd/MM/yyyy");
                return { dayDate, team, stops: list.map(r => { const { routeOrder: _drop, team: _team, ...rest } = r.stop; return { ...rest, firstVisitDate: label }; }) as RouteStop[] };
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
                    name: childRouteName(route.name, format(prepared[i].dayDate, "dd/MM"), prepared[i].team),
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

    // ── Adicionar as OS selecionadas a uma rota rascunho existente ──
    // A rascunho que ainda não tem rota mãe passa a ser filha desta rota de entrega (aí a OS conta como Programada aqui).
    const [draftOpen, setDraftOpen] = useState(false);
    const [draftId, setDraftId] = useState("");
    const [draftAdding, setDraftAdding] = useState(false);
    const { data: draftRoutes = [], isFetching: draftsLoading } = useQuery({
        queryKey: ["draft-routes-for-delivery", appUser?.uid, activeUnidadeId],
        queryFn: () => routeService.getDraftRoutes(activeUnidadeId),
        enabled: !!appUser?.uid && draftOpen,
        staleTime: 0,
    });
    const draftOptions = useMemo(
        () => draftRoutes.filter(d => d.kind !== "delivery" && d.id !== routeId && (!d.parentRouteId || d.parentRouteId === routeId)),
        [draftRoutes, routeId]
    );
    const draftDayLabel = (d: Route) => (d.plannedDate ? format(new Date(d.plannedDate), "dd/MM") : "sem data");

    const handleAddToDraft = async () => {
        const target = draftOptions.find(d => d.id === draftId);
        const picked = rows.filter(r => selected.has(r.stop.serviceOrder) && !r.finalizedAt && !r.childName);
        if (!target || picked.length === 0) return;
        setDraftAdding(true);
        try {
            const dayDate = target.plannedDate ? new Date(target.plannedDate) : null;
            const label = dayDate ? format(dayDate, "dd/MM/yyyy") : "";
            let added = 0;
            for (let attempt = 0; attempt < 5; attempt++) {
                const fresh = await routeService.getById(target.id);
                if (!fresh) throw new Error("Rota rascunho não encontrada");
                const have = new Set((fresh.stops || []).filter(st => !st.isReallocated).map(st => st.serviceOrder));
                const news = picked.filter(r => !have.has(r.stop.serviceOrder));
                const incoming = new Set(news.map(r => r.stop.serviceOrder));
                const toAdd = news.map(r => { const { routeOrder: _drop, team: _team, ...rest } = r.stop; return { ...rest, ...(label ? { firstVisitDate: label } : {}) } as RouteStop; });
                const stops = [...(fresh.stops || []).filter(st => !incoming.has(st.serviceOrder)), ...toAdd];
                try {
                    await routeService.update(target.id, { stops, ...(fresh.parentRouteId ? {} : { parentRouteId: routeId }) }, { expectedUpdatedAt: fresh.updatedAt || null });
                    added = toAdd.length;
                    break;
                } catch (e) {
                    if (e instanceof RouteConflictError && attempt < 4) continue;
                    throw e;
                }
            }
            // O dia programado da OS acompanha o dia da rascunho.
            if (dayDate && added > 0) {
                await routeService.patchStopFields(routeId, picked.map(r => ({ serviceOrder: r.stop.serviceOrder, fields: { plannedDay: format(dayDate, "yyyy-MM-dd") } })));
            }
            await queryClient.invalidateQueries({ queryKey: ["routes"] });
            await refresh();
            setDraftOpen(false);
            setDraftId("");
            setSelected(new Set());
            const dups = picked.length - added;
            toast({
                title: added === 1 ? "1 OS adicionada à rota " + target.name : added + " OS adicionadas à rota " + target.name,
                description: dups > 0 ? dups + " já estavam nela e foram ignoradas." : "Abra em Rotas para ajustar a ordem, o técnico e publicar.",
            });
        } catch (e: any) {
            console.error(e);
            toast({ variant: "destructive", title: "Não foi possível adicionar à rota", description: e?.message });
        } finally {
            setDraftAdding(false);
        }
    };

    // ── Divisão em equipes ──
    // Só OS que ainda podem mudar de equipe: sem finalizar e sem rota filha.
    const [teamsOpen, setTeamsOpen] = useState(false);
    const [teamsCount, setTeamsCount] = useState(2);
    const [teamsScope, setTeamsScope] = useState<Row[]>([]);
    const [teamsPreview, setTeamsPreview] = useState<TeamSplit | null>(null);
    const [teamsLoading, setTeamsLoading] = useState(false);
    const [teamsApplying, setTeamsApplying] = useState(false);
    const [moveTeam, setMoveTeam] = useState("1");

    const openTeamsDialog = () => {
        const scope = orderScope().filter(r => !r.finalizedAt && !r.childName);
        if (scope.length < 2) {
            toast({ variant: "destructive", title: "Poucas OS para dividir", description: "Selecione ou filtre pelo menos 2 OS livres (sem finalizar e sem rota filha)." });
            return;
        }
        setTeamsScope(scope);
        setTeamsPreview(null);
        setTeamsOpen(true);
    };
    // Prévia: coordenada da base (saída da rota ou a da unidade) + divisão em fatias ao redor dela.
    useEffect(() => {
        if (!teamsOpen || teamsScope.length === 0) return;
        let cancelled = false;
        (async () => {
            setTeamsLoading(true);
            try {
                let origin: [number, number] | null = startPt ? [startPt.lat, startPt.lng] : null;
                if (!origin && teamsCount > 1) {
                    const baseAddress = await configService.getBaseAddress(activeUnidadeId);
                    origin = await geocodeBase(baseAddress, activeUnidadeId).catch(() => null);
                }
                const split = await splitStopsIntoTeams(teamsScope.map(r => r.stop), teamsCount, origin);
                if (!cancelled) setTeamsPreview(split);
            } catch (e: any) {
                if (!cancelled) { setTeamsPreview(null); toast({ variant: "destructive", title: "Não foi possível dividir", description: e?.message }); }
            } finally {
                if (!cancelled) setTeamsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [teamsOpen, teamsCount, teamsScope]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyTeams = async () => {
        if (!teamsPreview) return;
        setTeamsApplying(true);
        try {
            // Mudar de equipe invalida a ordem e o dia que a OS tinha (foram calculados para outro conjunto de OS).
            const patches = teamsScope.map(r => ({
                serviceOrder: r.stop.serviceOrder,
                fields: { team: teamsPreview.get(r.stop.serviceOrder) || null, routeOrder: null, plannedDay: null },
            }));
            await routeService.patchStopFields(routeId, patches);
            await refresh();
            setTeamsOpen(false);
            setSelected(new Set());
            toast({
                title: teamsCount > 1 ? "Rota dividida em " + teamsCount + " equipes" : "Divisão em equipes desfeita",
                description: teamsCount > 1 ? "Agora use \"Otimizar ordem\" e \"Sugerir datas\": cada equipe terá a sua ordem e os seus dias, em paralelo." : undefined,
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível aplicar a divisão", description: e?.message });
        } finally {
            setTeamsApplying(false);
        }
    };

    // Ajuste manual: leva as OS selecionadas para uma equipe (ou tira da equipe).
    const moveSelectedToTeam = async () => {
        const list = Array.from(selected);
        if (list.length === 0) return;
        const team = Number(moveTeam) || NO_TEAM;
        setSaving(true);
        try {
            await routeService.patchStopFields(routeId, list.map(so => ({ serviceOrder: so, fields: { team: team || null, routeOrder: null } })));
            await refresh();
            setSelected(new Set());
            toast({
                title: list.length + " OS " + (team ? "movida(s) para a " + teamLabel(team) : "sem equipe"),
                description: "A ordem dessas OS foi limpa: use \"Otimizar ordem\" de novo para recalcular a rota da equipe.",
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível mover", description: e?.message });
        } finally {
            setSaving(false);
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
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 whitespace-nowrap", cls, st === "Pendência" && r.pendingNote && "cursor-help")} title={st === "Pendência" && r.pendingNote ? "Pendência lançada pelo técnico\n" + r.pendingNote : undefined}>{st}</Badge>
                {r.finalizedAt && <span className="text-[10px] text-muted-foreground tabular-nums">{format(r.finalizedAt, "dd/MM HH:mm")}</span>}
                {!r.finalizedAt && r.pendingAt && <span className={cn("text-[10px] text-muted-foreground tabular-nums", r.pendingNote && "cursor-help")} title={r.pendingNote || undefined}>{format(r.pendingAt, "dd/MM HH:mm")}</span>}
                {r.childName && <span className="text-[10px] text-muted-foreground max-w-[150px] truncate" title={r.childName}>{r.childName}</span>}
            </div>
        );
    };

    const renderCell = (r: Row, key: string): ReactNode => {
        const so = r.stop.serviceOrder;
        switch (key) {
            case "so":
                return (
                    <span className="inline-flex items-center gap-1.5">
                        {r.stop.serviceOrder}
                        <button type="button" className="rounded p-0.5 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive" title="Remover esta OS da rota de entrega" onClick={(e) => { e.stopPropagation(); setRemoveList([r.stop.serviceOrder]); }}>
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </span>
                );
            case "team":
                return r.team > 0
                    ? <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold" style={{ color: teamColor(r.team) }}><span className="h-2 w-2 rounded-full" style={{ background: teamColor(r.team) }} />{teamLabel(r.team)}</span>
                    : <span className="text-muted-foreground">—</span>;
            case "order": return r.stop.routeOrder ? "#" + r.stop.routeOrder : "—";
            case "tat": return r.stop.tat || "";
            case "tatNow": {
                const t = tatNow(r);
                if (!t) return <span className="text-muted-foreground">—</span>;
                return <span className="font-semibold tabular-nums" title={"Dias desde a solicitação " + t.label}>{t.days}</span>;
            }
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
                        {!r.finalizedAt && (
                            <button type="button" className="inline-flex items-center rounded border px-1 text-[10px] text-primary hover:bg-primary/10" title="Alterar as peças desta OS (as que ainda não têm rastreio)" onClick={() => openParts(r)}>
                                <Pencil className="h-2.5 w-2.5" />
                            </button>
                        )}
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
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="text-muted-foreground">{r.day ? format(new Date(r.day + "T12:00:00"), "dd/MM") : "—"}</span>
                        {!r.finalizedAt && r.childName && (
                            <button type="button" className="rounded border px-1 py-0 text-[10px] font-semibold text-primary hover:bg-primary/10" title="Mover esta OS para outro dia ou outra rota (cliente desistiu, remarcou...)" onClick={() => openReprogram(r)}>
                                Reprogramar
                            </button>
                        )}
                    </span>
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
                        <h1 className="text-xl font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> {route.name} <RouteCodeTag route={route} /></h1>
                        <p className="text-xs text-muted-foreground">Criada em {format(new Date(route.createdAt), "dd/MM/yyyy")} · rota de controle (não vai para os técnicos)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="text-muted-foreground hover:text-destructive" title="Excluir esta rota de entrega" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={() => setAddOpen(true)} title="Cola mais OS da planilha nesta rota de entrega">
                        <PlusCircle className="mr-2 h-4 w-4" /> Adicionar OS
                    </Button>
                    <Button variant="outline" onClick={handleCopyEmail} disabled={copyingEmail} title="Copia o e-mail da rota (OS por dia, km e tempo) para colar no seu e-mail">
                        {copyingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />} Copiar e-mail
                    </Button>
                    <Button variant="outline" onClick={() => setTextOpen(true)} title="Mostra o texto da rota no formato da planilha, para copiar">
                        <FileText className="mr-2 h-4 w-4" /> Texto da rota
                    </Button>
                    <Button variant="outline" onClick={handleExportSheet} title="Baixa a planilha completa: OS, peças com rastreio, datas e situação de cada uma">
                        <Download className="mr-2 h-4 w-4" /> Exportar planilha
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

            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {[
                    { label: "OS na rota", value: summary.total },
                    { label: "Finalizadas", value: summary.finalized },
                    { label: "Programadas (rota filha)", value: summary.scheduled },
                    { label: "Pendência", value: summary.pending },
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
                    {rows.some(r => r.team > 0) && <MultiFilter label="Equipe" options={options.teams} selected={fTeam} onChange={setFTeam} />}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs border-primary/40 text-primary"
                        onClick={handleOptimizeOrder}
                        disabled={optimizingOrder}
                        title="Organiza as OS (as selecionadas ou as da tabela, sem as finalizadas) na melhor ordem de atendimento, saindo da base e voltando a ela"
                    >
                        {optimizingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RouteIcon className="h-3.5 w-3.5" />} Otimizar ordem
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={openTeamsDialog}
                        title="Divide as OS (as selecionadas ou as da tabela) entre mais de uma equipe, por região, para trabalharem em paralelo"
                    >
                        <Users className="h-3.5 w-3.5" /> Dividir em equipes
                    </Button>
                    {rows.some(r => r.stop.routeOrder) && (
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={suggestFromCurrentOrder} disabled={optimizingOrder} title="Distribui as OS ordenadas pelos dias de trabalho">
                            <CalendarPlus className="h-3.5 w-3.5" /> Sugerir datas
                        </Button>
                    )}
                    {rows.some(r => r.stop.routeOrder) && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleClearOrder} disabled={optimizingOrder} title="Tira a numeração de ordem das OS selecionadas (ou da tabela)">
                            Limpar ordem
                        </Button>
                    )}
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
                <div className="flex items-center gap-1.5">
                    <Select value={moveTeam} onValueChange={setMoveTeam}>
                        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: MAX_TEAMS }, (_, i) => i + 1).map(t => <SelectItem key={t} value={String(t)}>{teamLabel(t)}</SelectItem>)}
                            <SelectItem value="0">Sem equipe</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" disabled={selected.size === 0 || saving} onClick={moveSelectedToTeam} title="Leva as OS selecionadas para a equipe escolhida">
                        <Users className="mr-1.5 h-3.5 w-3.5" /> Mover para equipe
                    </Button>
                </div>
                <Button size="sm" variant="outline" disabled={selected.size === 0 || saving} onClick={() => { setDraftId(""); setDraftOpen(true); }} title="Coloca as OS selecionadas dentro de uma rota que está como rascunho">
                    <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> Adicionar a rota rascunho
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={selected.size === 0 || saving} onClick={() => setRemoveList(Array.from(selected))} title="Tira as OS selecionadas da rota de entrega">
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remover da rota</Button>
                <span className="text-[11px] text-muted-foreground">Só OS não finalizadas e sem rota filha podem ser selecionadas.</span>
            </div>

            <Dialog open={draftOpen} onOpenChange={o => { if (!draftAdding) setDraftOpen(o); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Adicionar a uma rota rascunho</DialogTitle>
                        <DialogDescription>
                            {selected.size} OS selecionada(s) vão para a rota escolhida, com o dia dela. Rascunhos de outra rota de entrega não aparecem.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>Rota rascunho</Label>
                        <Select value={draftId} onValueChange={setDraftId}>
                            <SelectTrigger><SelectValue placeholder={draftsLoading ? "Carregando…" : draftOptions.length === 0 ? "Nenhuma rota rascunho disponível" : "Escolha a rota"} /></SelectTrigger>
                            <SelectContent>
                                {draftOptions.map(d => (
                                    <SelectItem key={d.id} value={d.id}>
                                        {d.name} · {draftDayLabel(d)} · {(d.stops || []).filter(st => !st.isReallocated).length} OS{d.parentRouteId === routeId ? " · filha desta rota" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">Se a rascunho ainda não tiver rota mãe, ela passa a ser filha desta rota de entrega e as OS aparecem aqui como Programadas.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDraftOpen(false)} disabled={draftAdding}>Cancelar</Button>
                        <Button onClick={handleAddToDraft} disabled={!draftId || draftAdding}>
                            {draftAdding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />} Adicionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
            <Dialog open={addOpen} onOpenChange={(o) => { if (!o && !adding) setAddOpen(false); }}>
                <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Adicionar OS à rota de entrega</DialogTitle>
                        <DialogDescription>Cole as linhas da planilha (com o cabeçalho). As OS novas entram como "A programar"; as que já estão na rota são ignoradas.</DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={addText}
                        onChange={e => setAddText(e.target.value)}
                        placeholder="Cole aqui o cabeçalho e as linhas da planilha de OS…"
                        className="h-[22vh] w-full resize-none rounded-md border bg-background p-3 font-mono text-xs"
                    />
                    <DeliveryHistoryNotice history={addPreview.history} skipSent={addSkipSent} onSkipSentChange={setAddSkipSent} />
                    {addText.trim() && (
                        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                            <strong>{addPreview.fresh.length}</strong> OS nova(s) para adicionar
                            {addPreview.dups > 0 ? <> · <strong>{addPreview.dups}</strong> já na rota (serão ignoradas)</> : null}
                            {addParsed.length === 0 ? " · não encontrei OS no texto: confira se o cabeçalho foi colado junto." : ""}
                        </p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancelar</Button>
                        <Button onClick={handleAddOrders} disabled={adding || addPreview.fresh.length === 0}>
                            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Adicionar {addPreview.fresh.length > 0 ? addPreview.fresh.length + " OS" : ""}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={textOpen} onOpenChange={setTextOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Texto da rota</DialogTitle>
                        <DialogDescription>
                            Mesmo formato da planilha usada para criar as rotas (cabeçalho + uma linha por OS, separado por tabulação). Dá para copiar e colar em outra rota, na planilha ou num e-mail.
                        </DialogDescription>
                    </DialogHeader>
                    <textarea
                        readOnly
                        value={routeTextValue}
                        onFocus={e => e.currentTarget.select()}
                        className="h-[50vh] w-full resize-none rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
                    />
                    <p className="text-xs text-muted-foreground">{(route?.stops || []).filter(st => !st.isReallocated).length} OS nesta rota de entrega.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTextOpen(false)}>Fechar</Button>
                        <Button onClick={handleCopyRouteText}><Copy className="mr-2 h-4 w-4" /> Copiar texto</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!removeList} onOpenChange={(o) => { if (!o && !removing) setRemoveList(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover {removeList && removeList.length === 1 ? "a OS " + removeList[0] : removeList?.length + " OS"} da rota de entrega?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {removeList && removeList.length === 1 ? "Ela sai" : "Elas saem"} apenas desta rota de entrega (a lista de controle).
                            {removeList && rows.some(r => removeList.includes(r.stop.serviceOrder) && r.childName)
                                ? " Atenção: parte dessas OS já está em rota dos dias; lá elas continuam até você tirá-las de cada rota."
                                : ""} As peças e rastreios dessa OS aqui também saem. Isso não pode ser desfeito.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={removing}>Voltar</AlertDialogCancel>
                        <AlertDialogAction disabled={removing} onClick={(e) => { e.preventDefault(); void handleRemoveOrders(); }}>
                            {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={!!partsRow} onOpenChange={(o) => { if (!o && !partsSaving) setPartsRow(null); }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Peças da OS {partsRow?.stop.serviceOrder}</DialogTitle>
                        <DialogDescription>
                            Enquanto a peça não tem rastreio (ainda não foi enviada), dá para trocar o código, a descrição e a quantidade, remover ou incluir outra. Peças com rastreio ficam travadas.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[55vh] space-y-2 overflow-y-auto">
                        {partsDraft.map((d, i) => d.removed ? null : d.tracking ? (
                            <div key={i} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono font-semibold">{d.code} <span className="text-muted-foreground font-normal">x{d.quantity}</span></span>
                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Enviada · {d.tracking}</span>
                                </div>
                                {d.description && <p className="text-xs text-muted-foreground break-words">{d.description}</p>}
                            </div>
                        ) : (
                            <div key={i} className="space-y-1.5 rounded-lg border px-3 py-2">
                                <div className="grid grid-cols-[1fr_4.5rem_auto] items-center gap-2">
                                    <Input className="h-9 font-mono text-sm" placeholder="Código da peça" value={d.code} onChange={e => updateDraft(i, { code: e.target.value })} />
                                    <Input className="h-9 text-sm" type="number" min={1} value={d.quantity} onChange={e => updateDraft(i, { quantity: Number(e.target.value) })} title="Quantidade" />
                                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => updateDraft(i, { removed: true })} title="Remover esta peça">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Input className="h-9 text-sm" placeholder="Descrição" value={d.description} onChange={e => updateDraft(i, { description: e.target.value })} />
                            </div>
                        ))}
                        {partsDraft.every(d => d.removed) && <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma peça nesta OS.</p>}
                    </div>
                    <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setPartsDraft(cur => [...cur, { origCode: null, code: "", description: "", quantity: 1, tracking: "" }])}>
                        <PlusCircle className="mr-1.5 h-4 w-4" /> Incluir peça
                    </Button>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPartsRow(null)} disabled={partsSaving}>Cancelar</Button>
                        <Button onClick={handleSaveParts} disabled={partsSaving}>
                            {partsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar peças
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!reprogramRow} onOpenChange={(o) => { if (!o && !reprogramming) setReprogramRow(null); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reprogramar OS {reprogramRow?.stop.serviceOrder}</DialogTitle>
                        <DialogDescription>
                            {reprogramRow?.stop.city}{reprogramRow?.stop.neighborhood ? " · " + reprogramRow.stop.neighborhood : ""}. Hoje está em <strong>{reprogramRow?.childName}</strong>. Ao reprogramar, ela sai dessa rota (fica como "realocada") e vai para o destino escolhido.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setReprogramMode("existing")} className={cn("rounded-lg border px-3 py-2 text-left text-sm", reprogramMode === "existing" ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent")}>
                                Rota já programada
                            </button>
                            <button type="button" onClick={() => setReprogramMode("day")} className={cn("rounded-lg border px-3 py-2 text-left text-sm", reprogramMode === "day" ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent")}>
                                Outro dia / rota nova
                            </button>
                        </div>
                        {reprogramMode === "existing" ? (
                            <div className="space-y-1">
                                <Label className="text-xs">Rota de destino</Label>
                                <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={reprogramTarget} onChange={e => setReprogramTarget(e.target.value)}>
                                    {children.filter(c => !c.isCanceled && !(c.stops || []).some(cs => cs.serviceOrder === reprogramRow?.stop.serviceOrder && !cs.isReallocated)).map(c => (
                                        <option key={c.id} value={c.id}>{c.name}{childDay(c) ? " · " + format(new Date(childDay(c) + "T12:00:00"), "dd/MM") : ""}</option>
                                    ))}
                                </select>
                                {children.filter(c => !c.isCanceled).length < 2 && <p className="text-xs text-muted-foreground">Não há outra rota dos dias criada. Use "Outro dia / rota nova".</p>}
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <Label className="text-xs">Novo dia</Label>
                                <Input type="date" value={reprogramDay} onChange={e => setReprogramDay(e.target.value)} />
                                <p className="text-xs text-muted-foreground">Se já existir rota nesse dia, a OS entra nela. Se não, fica "Com dia" e é incluída quando você usar "Criar rotas dos dias".</p>
                            </div>
                        )}
                        <div className="space-y-1">
                            <Label className="text-xs">Motivo (opcional)</Label>
                            <Input value={reprogramReason} onChange={e => setReprogramReason(e.target.value)} placeholder="Ex.: cliente desistiu, pediu outro dia" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReprogramRow(null)} disabled={reprogramming}>Cancelar</Button>
                        <Button onClick={handleReprogram} disabled={reprogramming || (reprogramMode === "existing" ? !reprogramTarget : !reprogramDay)}>
                            {reprogramming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Reprogramar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={teamsOpen} onOpenChange={(o) => { if (!o && !teamsApplying) setTeamsOpen(false); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Dividir em equipes</DialogTitle>
                        <DialogDescription>
                            As {teamsScope.length} OS livres são separadas por região ao redor da base, com quantidades parecidas. Cada equipe terá a sua ordem e os seus dias, em paralelo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1">
                        <Label className="text-xs">Quantidade de equipes</Label>
                        <Select value={String(teamsCount)} onValueChange={v => setTeamsCount(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1 (sem divisão)</SelectItem>
                                {Array.from({ length: MAX_TEAMS - 1 }, (_, i) => i + 2).map(n => <SelectItem key={n} value={String(n)}>{n} equipes</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        {teamsLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Localizando os endereços e dividindo…</p>}
                        {!teamsLoading && teamsPreview && teamsCount > 1 && Array.from(teamCounts(teamsPreview).entries()).sort((a, b) => a[0] - b[0]).map(([team, n]) => {
                            const cities = Array.from(new Set(teamsScope.filter(r => teamsPreview.get(r.stop.serviceOrder) === team).map(r => r.stop.city).filter(Boolean)));
                            return (
                                <div key={team} className="rounded-lg border px-3 py-2" style={{ borderLeft: "4px solid " + teamColor(team) }}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold" style={{ color: teamColor(team) }}>{teamLabel(team)}</span>
                                        <span className="text-xs text-muted-foreground">{n} OS</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground break-words">{cities.slice(0, 6).join(", ")}{cities.length > 6 ? " +" + (cities.length - 6) : ""}</p>
                                </div>
                            );
                        })}
                        {teamsCount === 1 && <p className="text-sm text-muted-foreground">As OS ficam sem equipe (rota única, como antes).</p>}
                    </div>
                    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        Ao aplicar, a <strong>ordem</strong> e o <strong>dia</strong> dessas OS são limpos, porque foram calculados para outro conjunto de OS. Depois use "Otimizar ordem" e "Sugerir datas". Para ajustar, selecione OS na tabela e use "Mover para equipe".
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTeamsOpen(false)} disabled={teamsApplying}>Cancelar</Button>
                        <Button onClick={applyTeams} disabled={teamsApplying || teamsLoading || !teamsPreview}>
                            {teamsApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />} {teamsCount > 1 ? "Aplicar divisão" : "Desfazer divisão"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!dateStops} onOpenChange={(o) => { if (!o && !sugApplying) setDateStops(null); }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Sugestão de datas</DialogTitle>
                        <DialogDescription>
                            As OS na ordem otimizada distribuídas pelos dias de trabalho (expediente {planningParams.dayStart}–{planningParams.dayEnd}, tempos de atendimento e deslocamento do Planejamento).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Primeiro dia</Label>
                            <Input type="date" value={sugStart} onChange={e => setSugStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Saída da base</Label>
                            <Input type="time" value={sugTime} onChange={e => setSugTime(e.target.value)} />
                        </div>
                    </div>
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={sugRoundTrip} onChange={e => setSugRoundTrip(e.target.checked)} />
                        <span>Ida e volta no mesmo dia (volta à base todo dia, sem dormir fora)</span>
                    </label>
                    <div className="max-h-[45vh] space-y-2 overflow-y-auto">
                        {sugLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculando os dias…</p>}
                        {!sugLoading && sugDays?.map((d, i) => {
                            const cities = Array.from(new Set(d.stops.map(st => st.city).filter(Boolean)));
                            const dayNumber = sugDays.slice(0, i + 1).filter(x => x.team === d.team).length;
                            return (
                                <div key={d.team + "-" + d.day} className="rounded-lg border px-3 py-2" style={d.team > 0 ? { borderLeft: "4px solid " + teamColor(d.team) } : undefined}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold capitalize">
                                            {d.team > 0 && <span style={{ color: teamColor(d.team) }}>{teamLabel(d.team)} · </span>}Dia {dayNumber} · {format(d.date, "EEEE dd/MM", { locale: ptBR })}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{d.stops.length} OS · termina ~{formatClock(d.endMin)}</span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground break-words">{cities.slice(0, 6).join(", ")}{cities.length > 6 ? " +" + (cities.length - 6) : ""}</p>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDateStops(null)} disabled={sugApplying}>Agora não</Button>
                        <Button onClick={applyDateSuggestion} disabled={sugApplying || sugLoading || !sugDays || sugDays.length === 0}>
                            {sugApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Aplicar datas sugeridas
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Criar rotas dos dias</DialogTitle>
                        <DialogDescription>Uma rota (rascunho) por dia programado, só com as OS ainda não finalizadas e sem rota filha.</DialogDescription>
                    </DialogHeader>
                    <ul className="space-y-1.5">
                        {pendingDays.map(({ day, team, list }) => (
                            <li key={day + "|" + team} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                                <span className="capitalize">
                                    {format(new Date(day + "T12:00:00"), "EEEE dd/MM", { locale: ptBR })}
                                    {team > 0 && <span className="ml-2 font-semibold normal-case" style={{ color: teamColor(team) }}>{teamLabel(team)}</span>}
                                </span>
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
