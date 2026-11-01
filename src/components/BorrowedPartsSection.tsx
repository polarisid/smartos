"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, ChevronDown, ChevronsUpDown, Minus, Plus, Trash2 } from "lucide-react";
import type { Route, RouteStop } from "@/lib/data";
import { formatBorrowedPart, lentFromOrder, type BorrowedPart } from "@/lib/partUsage";
import { useServiceOrders } from "@/hooks/queries";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Props = {
    routes: Route[];
    /** Técnico do lançamento: as OS de origem vêm das rotas dele (se ele não tiver rota, de todas as rotas ativas). */
    technicianId?: string;
    /** OS que está sendo lançada (não pode ser origem dela mesma). */
    currentOrder: string;
    value: BorrowedPart[];
    onChange: (next: BorrowedPart[]) => void;
};

type Source = { route: Route; stop: RouteStop };

/**
 * "Usei peça de outra OS": o técnico leva na rota peças de várias OS e às vezes uma peça enviada para uma OS serve em
 * outra (peça compatível). Aqui ele escolhe a OS de origem, a peça e a quantidade; o lançamento grava
 * "CÓDIGO (xN) [da OS 123]" em "peça trocada" e a OS de origem passa a constar como "cedida" nos relatórios.
 */
export function BorrowedPartsSection({ routes, technicianId, currentOrder, value, onChange }: Props) {
    const { data: serviceOrders = [] } = useServiceOrders(2000);
    const [open, setOpen] = useState(false);
    const [fromOrder, setFromOrder] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [qtyByCode, setQtyByCode] = useState<Record<string, number>>({});

    const sources = useMemo<Source[]>(() => {
        const mine = technicianId ? routes.filter(r => r.technicianId === technicianId) : [];
        const pool = mine.length > 0 ? mine : routes;
        const seen = new Set<string>();
        const out: Source[] = [];
        for (const route of pool) {
            for (const stop of route.stops || []) {
                if (stop.isReallocated || !stop.serviceOrder || stop.serviceOrder === currentOrder) continue;
                if ((stop.parts || []).length === 0 || seen.has(stop.serviceOrder)) continue;
                seen.add(stop.serviceOrder);
                out.push({ route, stop });
            }
        }
        return out.sort((a, b) => a.stop.serviceOrder.localeCompare(b.stop.serviceOrder, "pt-BR", { numeric: true }));
    }, [routes, technicianId, currentOrder]);

    const source = sources.find(s => s.stop.serviceOrder === fromOrder);

    // Quanto ainda dá para pegar da peça: o que foi enviado menos o que já foi cedido (lançamentos salvos) ou escolhido agora.
    const availableOf = (src: Source, code: string, quantity: number) => {
        const lent = lentFromOrder(src.stop.serviceOrder, code, serviceOrders, new Date(src.route.createdAt)).reduce((a, l) => a + l.quantity, 0);
        const picked = value.filter(v => v.fromOrder === src.stop.serviceOrder && v.code === code).reduce((a, v) => a + v.quantity, 0);
        return Math.max(0, quantity - lent - picked);
    };

    const add = (code: string, description: string | undefined, available: number) => {
        if (!source) return;
        const quantity = Math.min(Math.max(1, qtyByCode[code] || 1), available);
        if (quantity < 1) return;
        const existing = value.findIndex(v => v.fromOrder === source.stop.serviceOrder && v.code === code);
        if (existing >= 0) onChange(value.map((v, i) => (i === existing ? { ...v, quantity: v.quantity + quantity } : v)));
        else onChange([...value, { fromOrder: source.stop.serviceOrder, code, description, quantity }]);
        setQtyByCode(prev => { const next = { ...prev }; delete next[code]; return next; });
    };

    if (sources.length === 0 && value.length === 0) return null;

    return (
        <div id="borrowed-parts-section" className="overflow-hidden rounded-2xl border-2 border-sky-200 bg-gradient-to-b from-sky-50 to-white dark:border-sky-900 dark:from-sky-950/30 dark:to-slate-900">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
                <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500"><ArrowRightLeft className="h-3.5 w-3.5 text-white" /></span>
                    <span>
                        <span className="block text-sm font-bold text-sky-900 dark:text-sky-200">Usei peça de outra OS</span>
                        <span className="block text-[10px] text-sky-700 dark:text-sky-400">Peça compatível que estava na sua rota para outra OS</span>
                    </span>
                </span>
                <span className="flex items-center gap-2">
                    {value.length > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800 dark:bg-sky-900/50 dark:text-sky-200">{value.length}</span>}
                    <ChevronDown className={cn("h-4 w-4 text-sky-700 transition-transform dark:text-sky-300", open && "rotate-180")} />
                </span>
            </button>

            {value.length > 0 && (
                <div className="space-y-1.5 px-3 pb-3">
                    {value.map((v, i) => (
                        <div key={v.fromOrder + v.code} className="flex items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 dark:border-sky-800 dark:bg-sky-950/30">
                            <div className="min-w-0">
                                <p className="font-mono text-sm font-black tracking-wider">{v.code}{v.quantity > 1 ? ` (x${v.quantity})` : ""}</p>
                                <p className="truncate text-[11px] text-muted-foreground">da OS {v.fromOrder}{v.description ? " · " + v.description : ""}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((_, k) => k !== i))}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                aria-label={"Remover " + formatBorrowedPart(v)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {open && (
                <div className="space-y-3 border-t border-sky-200 px-3 py-3 dark:border-sky-900">
                    {sources.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Não há outra OS com peças nas suas rotas ativas.</p>
                    ) : (
                        <>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold">De qual OS saiu a peça?</p>
                                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                                    <PopoverTrigger asChild>
                                        <Button type="button" variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between font-normal">
                                            <span className="truncate">
                                                {source ? source.stop.serviceOrder + (source.stop.consumerName ? " · " + source.stop.consumerName : "") : "Digite ou escolha a OS de origem"}
                                            </span>
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                        <Command>
                                            <CommandInput placeholder="Digite o número da OS ou o nome do cliente" inputMode="numeric" />
                                            <CommandList>
                                                <CommandEmpty>Nenhuma OS com peças nas suas rotas.</CommandEmpty>
                                                <CommandGroup>
                                                    {sources.map(s => (
                                                        <CommandItem
                                                            key={s.stop.serviceOrder}
                                                            value={s.stop.serviceOrder + " " + (s.stop.consumerName || "")}
                                                            onSelect={() => { setFromOrder(s.stop.serviceOrder); setQtyByCode({}); setPickerOpen(false); }}
                                                        >
                                                            <span className="truncate">
                                                                {s.stop.serviceOrder}{s.stop.consumerName ? " · " + s.stop.consumerName : ""} ({s.stop.parts.length} peça{s.stop.parts.length > 1 ? "s" : ""})
                                                            </span>
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {source && (
                                <div className="space-y-2">
                                    {source.stop.parts.map(part => {
                                        const available = availableOf(source, part.code, part.quantity);
                                        const qty = Math.min(Math.max(1, qtyByCode[part.code] || 1), Math.max(available, 1));
                                        return (
                                            <div key={part.code} className={cn("rounded-xl border bg-white p-2.5 dark:bg-slate-900", available === 0 && "opacity-60")}>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="font-mono text-sm font-black tracking-wider">{part.code}</p>
                                                        {part.description && <p className="line-clamp-1 text-[11px] text-muted-foreground">{part.description}</p>}
                                                    </div>
                                                    <span className="shrink-0 text-[11px] text-muted-foreground">{available > 0 ? "disponível: " + available : "já cedida"}</span>
                                                </div>
                                                {available > 0 && (
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        {available > 1 ? (
                                                            <div className="flex items-center gap-2">
                                                                <button type="button" disabled={qty <= 1} onClick={() => setQtyByCode(p => ({ ...p, [part.code]: qty - 1 }))} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-300 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
                                                                <span className="w-5 text-center text-base font-black">{qty}</span>
                                                                <button type="button" disabled={qty >= available} onClick={() => setQtyByCode(p => ({ ...p, [part.code]: qty + 1 }))} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-300 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
                                                            </div>
                                                        ) : <span />}
                                                        <Button type="button" size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={() => add(part.code, part.description, available)}>
                                                            <Check className="mr-1.5 h-3.5 w-3.5" /> Usei esta peça
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
