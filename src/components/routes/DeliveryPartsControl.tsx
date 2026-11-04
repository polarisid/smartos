"use client";

import { useMemo, useState } from "react";
import { Loader2, Repeat2, Search, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PART_RETURN_LABEL, partReturnOf, type PartReturn } from "@/lib/partRealloc";
import type { RoutePart, RouteStop, ServiceOrder } from "@/lib/data";

// Controle de peças da rota de entrega: o que foi usado, o que não foi usado e o que foi dado a outra OS.

type Item = { stop: RouteStop; part: RoutePart; kind: PartReturn; lentTo: string };
type Filter = "todas" | "usadas" | "nao-usadas" | "aguardando" | "defeito" | "realocadas";

const FILTERS: Array<{ key: Filter; label: string; hint: string; match: (k: PartReturn) => boolean; tone: string }> = [
    { key: "todas", label: "Todas", hint: "Todas as peças enviadas", match: () => true, tone: "" },
    { key: "usadas", label: "Usadas", hint: "Constam em peça trocada de uma OS lançada (inclui as usadas em outra OS)", match: k => k === "usada" || k === "cedida", tone: "text-emerald-600" },
    { key: "nao-usadas", label: "Não usadas", hint: "OS atendida e a peça não foi usada: volta ao estoque ou pode ser realocada", match: k => k === "nova", tone: "text-amber-600" },
    { key: "aguardando", label: "Aguardando", hint: "A OS ainda não foi lançada depois da rota criada", match: k => k === "aguardando", tone: "text-slate-500" },
    { key: "defeito", label: "Com defeito", hint: "Peça nova com defeito (pendência)", match: k => k === "defeito", tone: "text-red-600" },
    { key: "realocadas", label: "Realocadas", hint: "Peça dada a outra OS da rota", match: k => k === "realocada", tone: "text-sky-600" },
];

const KIND_BADGE: Record<PartReturn, string> = {
    usada: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    cedida: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
    nova: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    defeito: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
    aguardando: "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    realocada: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
};

const canReallocate = (k: PartReturn) => k === "nova" || k === "aguardando";

type Props = {
    stops: RouteStop[];
    serviceOrders: ServiceOrder[];
    routeCreated: Date;
    /** OS já finalizadas: não recebem peça realocada. */
    finalizedOrders: Set<string>;
    readOnly?: boolean;
    onReallocate: (fromOrder: string, code: string, toOrder: string) => Promise<void>;
    onUndo: (fromOrder: string, code: string, toOrder: string) => Promise<void>;
};

export function DeliveryPartsControl({ stops, serviceOrders, routeCreated, finalizedOrders, readOnly, onReallocate, onUndo }: Props) {
    const [filter, setFilter] = useState<Filter>("todas");
    const [search, setSearch] = useState("");
    const [moving, setMoving] = useState<Item | null>(null);
    const [destSearch, setDestSearch] = useState("");
    const [dest, setDest] = useState<string>("");
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const items: Item[] = useMemo(() => {
        const out: Item[] = [];
        stops.forEach(stop => (stop.parts || []).forEach(part => {
            const { kind, lentTo } = partReturnOf(stop, part, serviceOrders, routeCreated);
            out.push({ stop, part, kind, lentTo });
        }));
        return out;
    }, [stops, serviceOrders, routeCreated]);

    const counts = useMemo(() => {
        const c = {} as Record<Filter, number>;
        FILTERS.forEach(f => { c[f.key] = items.filter(i => f.match(i.kind)).length; });
        return c;
    }, [items]);

    const visible = useMemo(() => {
        const f = FILTERS.find(x => x.key === filter)!;
        const q = search.trim().toLowerCase();
        return items
            .filter(i => f.match(i.kind))
            .filter(i => !q || [i.stop.serviceOrder, i.stop.consumerName, i.stop.city, i.part.code, i.part.description, i.part.trackingCode].some(v => (v || "").toLowerCase().includes(q)))
            .sort((a, b) => a.stop.serviceOrder.localeCompare(b.stop.serviceOrder, "pt-BR", { numeric: true }) || a.part.code.localeCompare(b.part.code));
    }, [items, filter, search]);

    const candidates = useMemo(() => {
        if (!moving) return [];
        const q = destSearch.trim().toLowerCase();
        const src = moving.stop;
        return stops
            .filter(s => s.serviceOrder !== src.serviceOrder && !finalizedOrders.has(s.serviceOrder))
            .filter(s => !q || [s.serviceOrder, s.consumerName, s.city, s.neighborhood, s.model].some(v => (v || "").toLowerCase().includes(q)))
            .sort((a, b) => {
                const near = (s: RouteStop) => (s.city && s.city === src.city ? (s.neighborhood && s.neighborhood === src.neighborhood ? 0 : 1) : 2);
                return near(a) - near(b) || a.serviceOrder.localeCompare(b.serviceOrder, "pt-BR", { numeric: true });
            })
            .slice(0, 60);
    }, [moving, stops, finalizedOrders, destSearch]);

    const openMove = (item: Item) => { setMoving(item); setDest(""); setDestSearch(""); };
    const keyOf = (i: Item) => i.stop.serviceOrder + "|" + i.part.code;

    const confirmMove = async () => {
        if (!moving || !dest) return;
        setBusyKey(keyOf(moving));
        try {
            await onReallocate(moving.stop.serviceOrder, moving.part.code, dest);
            setMoving(null);
        } finally {
            setBusyKey(null);
        }
    };
    const undo = async (item: Item) => {
        if (!item.part.reallocatedTo) return;
        setBusyKey(keyOf(item));
        try {
            await onUndo(item.stop.serviceOrder, item.part.code, item.part.reallocatedTo);
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                {FILTERS.map(f => (
                    <button
                        key={f.key}
                        type="button"
                        title={f.hint}
                        onClick={() => setFilter(f.key)}
                        className={cn("rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50", filter === f.key && "border-primary bg-primary/5")}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{f.label}</p>
                        <p className={cn("text-lg font-semibold tabular-nums", f.tone)}>{counts[f.key]}</p>
                    </button>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-auto">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="h-8 w-full pl-7 text-xs sm:w-[280px]" placeholder="Buscar OS, cliente, cidade, peça ou rastreio…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{visible.length} de {items.length} peças</span>
            </div>

            <div className="max-h-[70vh] overflow-auto rounded-lg border">
                <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                        <tr>
                            {["OS", "Cliente", "Peça", "Qtd", "Rastreio", "Situação", ""].map((h, i) => (
                                <th key={i} className="whitespace-nowrap px-2 py-2 text-left font-semibold">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visible.length === 0 && (
                            <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nenhuma peça neste filtro.</td></tr>
                        )}
                        {visible.map(i => {
                            const busy = busyKey === keyOf(i);
                            return (
                                <tr key={keyOf(i)} className="border-t align-top hover:bg-muted/30">
                                    <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold">{i.stop.serviceOrder}</td>
                                    <td className="min-w-[160px] px-2 py-1.5">
                                        <p>{i.stop.consumerName}</p>
                                        <p className="text-[10px] text-muted-foreground">{[i.stop.city, i.stop.neighborhood].filter(Boolean).join(" · ")}</p>
                                    </td>
                                    <td className="min-w-[200px] px-2 py-1.5">
                                        <p className="font-mono font-semibold">{i.part.code}</p>
                                        <p className="text-[10px] text-muted-foreground">{i.part.description}</p>
                                        {(i.part.receivedFrom || []).length > 0 && (
                                            <p className="text-[10px] font-medium text-sky-600">
                                                Recebida da OS {(i.part.receivedFrom || []).map(r => r.order + (r.quantity > 1 ? " (x" + r.quantity + ")" : "")).join(", ")}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-center tabular-nums">{i.part.quantity || 1}</td>
                                    <td className="px-2 py-1.5 font-mono text-[11px]">{(i.part.trackingCode || "").trim() || <span className="text-muted-foreground">—</span>}</td>
                                    <td className="px-2 py-1.5">
                                        <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", KIND_BADGE[i.kind])}>{PART_RETURN_LABEL[i.kind]}</Badge>
                                        {i.kind === "cedida" && <p className="mt-0.5 text-[10px] text-muted-foreground">na OS {i.lentTo}</p>}
                                        {i.kind === "realocada" && <p className="mt-0.5 text-[10px] text-muted-foreground">para a OS {i.part.reallocatedTo}</p>}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                                        {!readOnly && canReallocate(i.kind) && (
                                            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" disabled={busy} onClick={() => openMove(i)} title="Dar esta peça a outra OS da rota">
                                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Repeat2 className="h-3 w-3" />} Realocar
                                            </Button>
                                        )}
                                        {!readOnly && i.kind === "realocada" && (
                                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" disabled={busy} onClick={() => void undo(i)} title="Devolve a peça para esta OS e tira da OS de destino">
                                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Desfazer
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <Dialog open={!!moving} onOpenChange={o => { if (!o && !busyKey) setMoving(null); }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Realocar peça</DialogTitle>
                        <DialogDescription>
                            <span className="font-mono font-semibold">{moving?.part.code}</span> da OS <span className="font-mono font-semibold">{moving?.stop.serviceOrder}</span> passa para a OS escolhida,
                            com o mesmo rastreio. Só aparecem OS ainda não finalizadas; as da mesma cidade e bairro vêm primeiro.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input className="h-9 pl-7 text-sm" placeholder="Buscar OS, cliente, cidade, bairro ou modelo…" value={destSearch} onChange={e => setDestSearch(e.target.value)} autoFocus />
                        </div>
                        <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-md border p-1">
                            {candidates.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nenhuma OS encontrada.</p>}
                            {candidates.map(s => (
                                <button
                                    key={s.serviceOrder}
                                    type="button"
                                    onClick={() => setDest(s.serviceOrder)}
                                    className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted", dest === s.serviceOrder && "bg-primary/10 ring-1 ring-primary")}
                                >
                                    <span>
                                        <span className="font-mono font-semibold">{s.serviceOrder}</span> · {s.consumerName}
                                        <span className="block text-[10px] text-muted-foreground">{[s.city, s.neighborhood, s.model].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    {moving && s.city && s.city === moving.stop.city && <Badge variant="outline" className="text-[9px]">mesma cidade</Badge>}
                                </button>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMoving(null)} disabled={!!busyKey}>Cancelar</Button>
                        <Button onClick={confirmMove} disabled={!dest || !!busyKey}>
                            {busyKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat2 className="mr-2 h-4 w-4" />}
                            Realocar{dest ? " para a OS " + dest : ""}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
