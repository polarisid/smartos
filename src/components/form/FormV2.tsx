"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, AlertTriangle, Search, ListChecks, FlaskConical, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Route, RouteStop } from "@/lib/data";

// Versão de teste do formulário do técnico. Fica desligada por padrão: quem quiser testar liga no botão do
// topo do formulário (ou abrindo a tela com ?novo=1) e pode voltar ao formulário atual a qualquer momento
// (botão "Voltar ao formulário atual" ou ?novo=0). A escolha fica guardada só neste aparelho.
const KEY = "smartos_form_v2";

export function useFormV2(): [boolean, (v: boolean) => void] {
    const [enabled, setEnabled] = useState(false);
    useEffect(() => {
        try {
            const q = new URLSearchParams(window.location.search).get("novo");
            if (q === "1") localStorage.setItem(KEY, "1");
            if (q === "0") localStorage.removeItem(KEY);
            setEnabled(localStorage.getItem(KEY) === "1");
        } catch { /* sem armazenamento: fica no formulário atual */ }
    }, []);
    const set = (v: boolean) => {
        setEnabled(v);
        try { if (v) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* ok */ }
    };
    return [enabled, set];
}

export function FormV2Switch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
    if (!enabled) {
        return (
            <button
                type="button"
                onClick={() => onChange(true)}
                className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-primary/40 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 transition-colors"
            >
                <FlaskConical className="h-3.5 w-3.5" /> Testar o novo formulário
            </button>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-semibold text-primary">Novo formulário (teste)</span>
            <button type="button" onClick={() => onChange(false)} className="ml-auto inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground">
                <Undo2 className="h-3.5 w-3.5" /> Voltar ao formulário atual
            </button>
        </div>
    );
}

/** Etiqueta da OS: o número fica sempre à vista, em fonte de máquina, com o que já se sabe da parada. */
export function OsTicket({ os, stop, step, totalSteps, stepTitle }: { os: string; stop: RouteStop | null; step: number; totalSteps: number; stepTitle: string }) {
    return (
        <div className="relative overflow-hidden rounded-xl border bg-card px-4 py-3">
            <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ordem de serviço</p>
                    <p className={cn("font-mono text-xl font-bold tracking-tight leading-tight", !os && "text-muted-foreground/50")}>{os || "— — — —"}</p>
                    {stop && (
                        <p className="mt-0.5 text-xs text-muted-foreground break-words">
                            {[stop.city, stop.neighborhood].filter(Boolean).join(" · ")}{stop.model ? ` · ${stop.model}` : ""}
                        </p>
                    )}
                </div>
                <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold">{step}<span className="text-muted-foreground">/{totalSteps}</span></p>
                    <p className="text-[11px] font-semibold text-muted-foreground">{stepTitle}</p>
                </div>
            </div>
            <div className="mt-2 flex gap-1" aria-hidden>
                {Array.from({ length: totalSteps }).map((_, i) => (
                    <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < step ? "bg-primary" : "bg-muted")} />
                ))}
            </div>
        </div>
    );
}

/** Escolher a OS entre as paradas das rotas ativas do técnico, em vez de digitar 10 dígitos. */
export function StopPicker({
    routes,
    technicianId,
    selected,
    onPick,
}: {
    routes: Route[];
    technicianId: string;
    selected: string;
    onPick: (serviceOrder: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState("");

    const stops = useMemo(() => {
        const mine = routes.filter(r => !technicianId || r.technicianId === technicianId);
        const list = (mine.length > 0 ? mine : routes).flatMap(r => (r.stops || []).filter(s => !s.isReallocated).map(s => ({ stop: s, routeName: r.name })));
        const q = filter.trim().toLowerCase();
        return q
            ? list.filter(({ stop: s }) => [s.serviceOrder, s.city, s.neighborhood, s.model, s.consumerName].some(v => (v || "").toLowerCase().includes(q)))
            : list;
    }, [routes, technicianId, filter]);

    return (
        <div className="space-y-2">
            <Button type="button" variant="outline" className="h-12 w-full justify-start gap-2 font-semibold" onClick={() => setOpen(o => !o)}>
                <ListChecks className="h-5 w-5 text-primary" />
                {open ? "Fechar a lista da rota" : "Escolher da minha rota"}
            </Button>
            {open && (
                <div className="rounded-xl border bg-card p-2 space-y-2 animate-in fade-in slide-in-from-top-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
                        <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar por OS, cidade, bairro ou modelo" className="pl-8" />
                    </div>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                        {stops.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Nenhuma parada encontrada nas suas rotas ativas.</p>}
                        {stops.map(({ stop, routeName }, i) => (
                            <button
                                key={stop.serviceOrder + i}
                                type="button"
                                onClick={() => { onPick(stop.serviceOrder); setOpen(false); setFilter(""); }}
                                className={cn(
                                    "w-full rounded-lg border px-3 py-2 text-left transition-colors active:scale-[0.99]",
                                    selected === stop.serviceOrder ? "border-primary bg-primary/10" : "hover:bg-accent"
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-sm font-bold">{stop.serviceOrder}</span>
                                    <span className="truncate text-[10px] text-muted-foreground">{routeName}</span>
                                </div>
                                <p className="text-xs text-muted-foreground break-words">
                                    {[stop.city, stop.neighborhood].filter(Boolean).join(" · ")}{stop.model ? ` · ${stop.model}` : ""}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/** Finalizado x pendência: duas escolhas grandes e com cor, em vez de um interruptor pequeno. */
export function FinalizeChoice({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold">Como ficou o atendimento?</p>
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => onChange(true)}
                    className={cn(
                        "flex h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition-all active:scale-95",
                        value ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-input text-muted-foreground hover:bg-accent"
                    )}
                >
                    <CheckCircle className="h-6 w-6" /> Finalizado
                </button>
                <button
                    type="button"
                    onClick={() => onChange(false)}
                    className={cn(
                        "flex h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-bold transition-all active:scale-95",
                        !value ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-input text-muted-foreground hover:bg-accent"
                    )}
                >
                    <AlertTriangle className="h-6 w-6" /> Com pendência
                </button>
            </div>
        </div>
    );
}

/** Motivo da pendência como opções para tocar (lista curta: não precisa de menu suspenso). */
export function PendingReasonChips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
    return (
        <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Motivo da pendência</p>
            <div className="grid grid-cols-2 gap-2">
                {options.map(o => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "min-h-[3rem] rounded-lg border px-3 py-2 text-left text-sm font-medium leading-tight transition-all active:scale-95",
                            value === o.value ? "border-amber-500 bg-amber-500/15 font-bold text-amber-800 dark:text-amber-200" : "border-input hover:bg-accent"
                        )}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
