"use client";

import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Moon, Package, Settings2, Sun, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { geocodeAddressText } from "@/lib/geocode";
import { formatLegTempo } from "@/lib/emailExport";
import type { RoutePoint, RouteStop } from "@/lib/data";
import {
    formatClock,
    formatDuration,
    normalizeProductKey,
    parseVisitDate,
    sameDay,
    requestedTurnKind,
    simulateRoutePlan,
    type PlanningParams,
} from "@/lib/routePlanning";

type Props = {
    stops: RouteStop[];                 // só paradas ativas, na ordem da rota
    legKm: number[];
    legDurationMin: number[];
    legsLoading: boolean;
    startDate?: Date;                   // data de saída da rota (ou hoje)
    startPoint: RoutePoint | null;
    endPoint: RoutePoint | null;
    onStartPointChange: (p: RoutePoint | null) => void;
    onEndPointChange: (p: RoutePoint | null) => void;
    params: PlanningParams;
    onSaveParams: (p: PlanningParams) => Promise<void>;
    onStopMinutesChange: (serviceOrder: string, minutes: number | undefined) => void;
    // Muda data da visita ("dd/mm/aaaa") e/ou turno ("M" | "T" | "C") de uma ou mais paradas.
    onStopsScheduleChange: (updates: Array<{ serviceOrder: string; firstVisitDate?: string; turn?: string }>) => void;
    departureTime: string;              // hora de saída do 1º dia ("" = início do expediente)
    onDepartureTimeChange: (t: string) => void;
};

const SOURCE_LABEL = { manual: "manual", product: "do produto", default: "padrão" } as const;

export function RoutePlanningPanel({
    stops, legKm, legDurationMin, legsLoading, startDate, startPoint, endPoint,
    onStartPointChange, onEndPointChange, params, onSaveParams, onStopMinutesChange,
    onStopsScheduleChange, departureTime, onDepartureTimeChange,
}: Props) {
    const { toast } = useToast();
    const [startText, setStartText] = useState("");
    const [endText, setEndText] = useState("");
    const [resolving, setResolving] = useState<"start" | "end" | null>(null);
    const [configOpen, setConfigOpen] = useState(false);

    const plan = useMemo(
        () => simulateRoutePlan(stops, legDurationMin, params, startDate || new Date(), departureTime),
        [stops, legDurationMin, params, startDate, departureTime]
    );

    // Previsão de cada parada no formato que a rota guarda (data dd/mm/aaaa + turno M/T).
    const forecastOf = (si: number) => {
        const p = plan.stops[si];
        return { firstVisitDate: format(p.date, "dd/MM/yyyy"), turn: p.turn === "Manhã" ? "M" : "T" };
    };
    const isAligned = (si: number) => {
        const f = forecastOf(si);
        const cur = parseVisitDate(stops[si].firstVisitDate);
        return !!cur && sameDay(cur, plan.stops[si].date) && (stops[si].turn || "").trim().toUpperCase() === f.turn;
    };
    const misalignedCount = stops.reduce((n, _s, si) => (plan.stops[si] && !isAligned(si) ? n + 1 : n), 0);

    const applyForecastToAll = () => {
        const updates = stops.flatMap((s, si) => (plan.stops[si] && !isAligned(si) ? [{ serviceOrder: s.serviceOrder, ...forecastOf(si) }] : []));
        if (updates.length === 0) return;
        onStopsScheduleChange(updates);
        toast({ title: "Previsão aplicada", description: `Data e turno atualizados em ${updates.length} OS.` });
    };

    const handleSet = async (kind: "start" | "end") => {
        const text = (kind === "start" ? startText : endText).trim();
        if (!text) return;
        setResolving(kind);
        try {
            const found = await geocodeAddressText(text);
            if (!found) {
                toast({ variant: "destructive", title: "Endereço não encontrado", description: "Tente o CEP, ou cidade, bairro e UF (ex.: Recife, Boa Viagem, PE)." });
                return;
            }
            const point: RoutePoint = { address: found.label, lat: found.coords[0], lng: found.coords[1] };
            if (kind === "start") { onStartPointChange(point); setStartText(""); } else { onEndPointChange(point); setEndText(""); }
        } finally {
            setResolving(null);
        }
    };

    if (stops.length === 0) {
        return (
            <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
                Cole as OSs da rota para ver o planejamento (deslocamento, horários e onde o técnico dorme).
            </div>
        );
    }

    const dayLabel = (d: Date) => format(d, "EEE dd/MM", { locale: ptBR });

    return (
        <div className="space-y-3">
            {/* Saída / chegada */}
            <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saída e chegada desta rota (opcional)</p>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setConfigOpen(true)}>
                        <Settings2 className="h-3.5 w-3.5" /> Tempos de atendimento
                    </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {([
                        { kind: "start" as const, label: "Saída", point: startPoint, text: startText, setText: setStartText, clear: () => onStartPointChange(null), icon: "🚩" },
                        { kind: "end" as const, label: "Chegada", point: endPoint, text: endText, setText: setEndText, clear: () => onEndPointChange(null), icon: "🏁" },
                    ]).map(({ kind, label, point, text, setText, clear, icon }) => (
                        <div key={kind} className="space-y-1">
                            <Label className="text-xs">{icon} {label}</Label>
                            {point ? (
                                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                    <span className="text-xs flex-1 min-w-0 truncate" title={point.address}>{point.address}</span>
                                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clear}>Usar base</Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSet(kind); } }}
                                        placeholder="Padrão: base da unidade — CEP ou endereço"
                                        className="h-8 text-xs"
                                        disabled={resolving !== null}
                                    />
                                    <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => handleSet(kind)} disabled={!text.trim() || resolving !== null}>
                                        {resolving === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Definir"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <Label className="text-xs">🕗 Hora de saída ({startDate ? format(startDate, "dd/MM") : "1º dia"})</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                type="time"
                                value={departureTime}
                                onChange={e => onDepartureTimeChange(e.target.value)}
                                className="h-8 w-28 text-xs"
                            />
                            {departureTime && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onDepartureTimeChange("")}>
                                    Usar {params.dayStart}
                                </Button>
                            )}
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex-1 min-w-[220px]">
                        Os horários do 1º dia contam a partir daqui; vazio usa o início do expediente ({params.dayStart}).
                        Expediente {params.dayStart}–{params.dayEnd}
                        {params.lunchMinutes > 0 ? `, almoço ${formatDuration(params.lunchMinutes)} a partir das ${params.lunchStart}` : ""}
                        {params.workSaturday ? ", trabalha sábado" : ", sem sábado/domingo"}.
                    </p>
                </div>
            </div>

            {/* Resumo */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { label: "Dias de rota", value: String(plan.days.length) },
                    { label: "Dormidas", value: String(Math.max(0, plan.days.length - 1)) },
                    { label: "Deslocamento", value: legsLoading ? "…" : formatDuration(plan.totalTravelMin) },
                    { label: "Atendimento", value: formatDuration(plan.totalServiceMin) },
                ].map(c => (
                    <div key={c.label} className="rounded-lg border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{c.label}</p>
                        <p className="text-lg font-semibold">{c.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                    {misalignedCount === 0
                        ? "Data e turno de todas as OS já seguem a previsão."
                        : `${misalignedCount} OS com data/turno diferentes da previsão.`}
                </p>
                <Button type="button" size="sm" className="h-8 gap-1.5" onClick={applyForecastToAll} disabled={misalignedCount === 0 || legsLoading}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar previsão em todas
                </Button>
            </div>

            {legsLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando deslocamentos reais entre as paradas…
                </p>
            )}

            {/* Dias */}
            {plan.days.map((day, di) => (
                <div key={day.dayIndex} className="border rounded-lg overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2 border-b">
                        <p className="text-sm font-semibold capitalize">
                            Dia {day.dayIndex + 1} · {dayLabel(day.date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {day.stopIndexes.length} OS · {formatClock(plan.stops[day.stopIndexes[0]].startMin)}–{formatClock(day.endMin)} · {formatDuration(day.travelMin)} na estrada · {formatDuration(day.serviceMin)} de atendimento
                        </p>
                    </div>

                    <div className="p-1.5 space-y-1.5">
                        {day.stopIndexes.map((si, k) => {
                            const stop = stops[si];
                            const p = plan.stops[si];
                            const turnKind = requestedTurnKind(stop.turn);
                            const turnMismatch = (turnKind === "M" && p.turn === "Tarde") || (turnKind === "T" && p.turn === "Manhã");
                            const partsTitle = (stop.parts || []).map(pt => `${pt.code} — ${pt.description} (x${pt.quantity})`).join("\n");
                            const location = [stop.city, stop.neighborhood].filter(Boolean).join(" · ");
                            return (
                                <React.Fragment key={stop.serviceOrder}>
                                    {(k > 0 || p.travelMin > 0) && (
                                        <div className="flex items-center gap-1.5 pl-3 py-0.5 text-[10px]">
                                            <Truck className="h-3 w-3 text-muted-foreground/60" />
                                            {legsLoading ? (
                                                <span className="text-muted-foreground animate-pulse">calculando…</span>
                                            ) : (
                                                <span className="font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                                                    {legKm[si] !== undefined ? (formatLegTempo(legKm[si], legDurationMin[si]) || `${legKm[si].toFixed(1)} km`) : `${formatDuration(p.travelMin)}`}
                                                </span>
                                            )}
                                            {k === 0 && si === 0 && <span className="text-muted-foreground">desde {startPoint ? "a saída" : "a base"}</span>}
                                            {p.droveTonight && <span className="text-indigo-600 dark:text-indigo-400">viaja na noite anterior</span>}
                                            {p.afterLunch && <span className="text-muted-foreground">· almoço antes</span>}
                                        </div>
                                    )}
                                    <div className="border border-l-[3px] border-l-blue-500 rounded-r-lg rounded-l-none bg-card px-2.5 py-2">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                            <div className="flex items-center gap-2 min-w-[118px]">
                                                <span className="shrink-0 text-[11px] font-bold text-muted-foreground/60 w-5 text-right">{si + 1}.</span>
                                                <div className="leading-tight">
                                                    <p className="text-sm font-semibold tabular-nums flex items-center gap-1">
                                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {formatClock(p.startMin)}–{formatClock(p.endMin)}
                                                    </p>
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1 text-[10px] font-semibold",
                                                        p.turn === "Manhã" ? "text-amber-600" : "text-sky-600"
                                                    )}>
                                                        {p.turn === "Manhã" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />} {p.turn}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col min-w-[150px] flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="font-mono text-[13px] font-medium">{stop.serviceOrder}</span>
                                                    {stop.warrantyType && (
                                                        <span className={`text-[9px] font-bold px-1 rounded shrink-0 ${stop.warrantyType === "LP" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>
                                                            {stop.warrantyType}
                                                        </span>
                                                    )}
                                                    {turnMismatch && (
                                                        <span
                                                            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
                                                            title={`O cliente pediu turno da ${turnKind === "M" ? "manhã" : "tarde"}, mas a previsão cai na ${p.turn === "Manhã" ? "manhã" : "tarde"}.`}
                                                        >
                                                            <AlertTriangle className="h-3 w-3" /> turno pedido: {stop.turn}
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground truncate" title={location}>{location || "Sem localização"}</span>
                                                <span className="text-[11px] truncate" title={[stop.productType, stop.model].filter(Boolean).join(" — ")}>
                                                    {[stop.productType, stop.model].filter(Boolean).join(" · ") || "—"}
                                                </span>
                                                {(stop.parts || []).length > 0 ? (
                                                    <div className="mt-0.5 flex items-start gap-1.5 text-muted-foreground" title={partsTitle}>
                                                        <Package className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <ul className="text-[11px] leading-snug space-y-0.5">
                                                            {(stop.parts || []).map((pt, pi) => (
                                                                <li key={`${pt.code}-${pi}`}>
                                                                    <span className="font-mono text-foreground">{pt.code}</span>
                                                                    {pt.description ? <span> — {pt.description}</span> : null}
                                                                    {pt.quantity > 1 ? <span className="font-semibold"> (x{pt.quantity})</span> : null}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : (
                                                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                                                        <Package className="w-3.5 h-3.5 shrink-0" /> Sem peças
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <StopMinutesInput
                                                    value={stop.estimatedMinutes}
                                                    effective={p.serviceMin}
                                                    onCommit={(v) => onStopMinutesChange(stop.serviceOrder, v)}
                                                />
                                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 whitespace-nowrap">{SOURCE_LABEL[p.source]}</Badge>
                                            </div>
                                        </div>

                                        <div className="mt-1.5 pt-1.5 border-t border-dashed flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Agendamento</span>
                                            <VisitDateInput
                                                value={stop.firstVisitDate || ""}
                                                onCommit={(v) => onStopsScheduleChange([{ serviceOrder: stop.serviceOrder, firstVisitDate: v }])}
                                            />
                                            <div className="flex gap-0.5">
                                                {(["M", "T", "C"] as const).map(pill => (
                                                    <button
                                                        key={pill}
                                                        type="button"
                                                        onClick={() => onStopsScheduleChange([{ serviceOrder: stop.serviceOrder, turn: pill }])}
                                                        className={cn(
                                                            "w-[22px] h-6 rounded text-[10px] font-bold border transition-all",
                                                            (stop.turn || "").trim().toUpperCase() === pill
                                                                ? "bg-violet-600 text-white border-violet-600"
                                                                : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/40"
                                                        )}
                                                        title={pill === "M" ? "Manhã" : pill === "T" ? "Tarde" : "Comercial"}
                                                    >
                                                        {pill}
                                                    </button>
                                                ))}
                                            </div>
                                            {isAligned(si) ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> segue a previsão
                                                </span>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 px-2 text-[11px]"
                                                    onClick={() => onStopsScheduleChange([{ serviceOrder: stop.serviceOrder, ...forecastOf(si) }])}
                                                    title="Passa a data e o turno desta OS para os da previsão"
                                                >
                                                    Usar previsão ({format(p.date, "dd/MM")} · {p.turn === "Manhã" ? "M" : "T"})
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {day.sleepCity && (
                        <div className="flex items-center gap-2 px-3 py-2 border-t bg-indigo-50/60 dark:bg-indigo-950/20 text-xs text-indigo-800 dark:text-indigo-300">
                            <Moon className="h-4 w-4 shrink-0" />
                            <span><strong>Dorme em {day.sleepCity}</strong>{day.sleepNote ? ` — ${day.sleepNote}` : ""}</span>
                        </div>
                    )}
                    {di === plan.days.length - 1 && (
                        <div className={cn(
                            "flex items-center gap-2 px-3 py-2 border-t text-xs",
                            plan.returnAfterHours ? "bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300" : "bg-muted/30 text-muted-foreground"
                        )}>
                            <Truck className="h-4 w-4 shrink-0" />
                            <span>
                                Retorno {endPoint ? "ao ponto de chegada" : "à base"}: {formatDuration(plan.returnTravelMin)} de viagem — chega por volta das <strong>{formatClock(plan.returnArriveMin)}</strong>
                                {plan.returnAfterHours ? " (depois das " + params.travelUntil + ", o ideal é dormir na estrada/cidade e chegar no dia seguinte)" : ""}.
                            </span>
                        </div>
                    )}
                </div>
            ))}

            <p className="text-[11px] text-muted-foreground">
                Horários são estimativas: deslocamento real pelas ruas + tempo de atendimento por produto (ou o que você digitar em cada OS). Se a próxima parada não cabe no expediente, o técnico segue viagem e dorme na cidade dela quando chega até as {params.travelUntil}; senão dorme na cidade da última parada (o motivo aparece na linha da dormida).
            </p>

            <PlanningConfigDialog
                open={configOpen}
                onOpenChange={setConfigOpen}
                params={params}
                routeProducts={Array.from(new Set(stops.map(s => normalizeProductKey(s.productType)).filter(Boolean)))}
                onSave={onSaveParams}
            />
        </div>
    );
}

// Data da visita (dd/mm/aaaa): só grava ao sair do campo / Enter.
function VisitDateInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
    const [text, setText] = useState(value);
    useEffect(() => { setText(value); }, [value]);
    const commit = () => { if (text.trim() !== value.trim()) onCommit(text.trim()); };
    return (
        <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="dd/mm/aaaa"
            title="Data do agendamento (1st Visit Date)"
            className="h-7 w-[104px] text-xs text-center px-2"
        />
    );
}

// Campo de minutos da parada: só grava ao sair do campo / Enter; vazio volta pro tempo do produto.
function StopMinutesInput({ value, effective, onCommit }: { value?: number; effective: number; onCommit: (v: number | undefined) => void }) {
    const [text, setText] = useState(value ? String(value) : "");
    useEffect(() => { setText(value ? String(value) : ""); }, [value]);

    const commit = () => {
        const n = Math.round(Number(text));
        const next = text.trim() === "" || !Number.isFinite(n) || n <= 0 ? undefined : Math.min(n, 600);
        if (next !== value) onCommit(next);
        else setText(next ? String(next) : "");
    };

    return (
        <div className="flex items-center gap-1" title="Tempo de atendimento desta OS (minutos). Deixe vazio para usar o tempo do produto.">
            <Input
                value={text}
                onChange={e => setText(e.target.value.replace(/\D/g, ""))}
                onBlur={commit}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder={String(effective)}
                inputMode="numeric"
                className="h-7 w-14 text-xs text-center px-1"
            />
            <span className="text-[10px] text-muted-foreground">min</span>
        </div>
    );
}

function PlanningConfigDialog({ open, onOpenChange, params, routeProducts, onSave }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    params: PlanningParams;
    routeProducts: string[];
    onSave: (p: PlanningParams) => Promise<void>;
}) {
    const { toast } = useToast();
    const [draft, setDraft] = useState<PlanningParams>(params);
    const [extraProduct, setExtraProduct] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (open) setDraft(params); }, [open, params]);

    const products = useMemo(() => {
        const set = new Set<string>([...routeProducts, ...Object.keys(draft.durationByProduct)]);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [routeProducts, draft.durationByProduct]);

    const setProductMinutes = (key: string, text: string) => {
        const n = Math.round(Number(text.replace(/\D/g, "")));
        setDraft(d => {
            const next = { ...d.durationByProduct };
            if (!text.trim() || !n) delete next[key]; else next[key] = Math.min(n, 600);
            return { ...d, durationByProduct: next };
        });
    };

    const addProduct = () => {
        const key = normalizeProductKey(extraProduct);
        if (!key) return;
        setDraft(d => ({ ...d, durationByProduct: { ...d.durationByProduct, [key]: d.durationByProduct[key] ?? d.defaultMinutes } }));
        setExtraProduct("");
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({ ...draft, defaultMinutes: Math.max(1, Math.round(draft.defaultMinutes) || 45), lunchMinutes: Math.max(0, Math.round(draft.lunchMinutes) || 0) });
            onOpenChange(false);
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message || "Tente novamente." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Tempos de atendimento e expediente</DialogTitle>
                    <DialogDescription>
                        Quanto tempo o técnico leva em cada tipo de produto (campo "Service Product Description" da planilha). Vale para todas as rotas da unidade; em cada OS você ainda pode digitar um tempo só dela.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Tempo padrão (min)</Label>
                            <Input type="number" min={1} value={draft.defaultMinutes} onChange={e => setDraft(d => ({ ...d, defaultMinutes: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Almoço (min, 0 = sem)</Label>
                            <Input type="number" min={0} value={draft.lunchMinutes} onChange={e => setDraft(d => ({ ...d, lunchMinutes: Number(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Início do expediente</Label>
                            <Input type="time" value={draft.dayStart} onChange={e => setDraft(d => ({ ...d, dayStart: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Fim do expediente</Label>
                            <Input type="time" value={draft.dayEnd} onChange={e => setDraft(d => ({ ...d, dayEnd: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" title="Se a próxima cidade for alcançada até esse horário, o técnico segue viagem e dorme lá">Pode dirigir até</Label>
                            <Input type="time" value={draft.travelUntil} onChange={e => setDraft(d => ({ ...d, travelUntil: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Almoço a partir de</Label>
                            <Input type="time" value={draft.lunchStart} onChange={e => setDraft(d => ({ ...d, lunchStart: e.target.value }))} />
                        </div>
                        <label className="flex items-center gap-2 text-sm pt-5 cursor-pointer">
                            <input type="checkbox" checked={draft.workSaturday} onChange={e => setDraft(d => ({ ...d, workSaturday: e.target.checked }))} />
                            Trabalha aos sábados
                        </label>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tempo por tipo de produto (min)</Label>
                        <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                            {products.length === 0 && (
                                <p className="text-xs text-muted-foreground p-3">Nenhum produto nesta rota ainda. Adicione abaixo.</p>
                            )}
                            {products.map(key => (
                                <div key={key} className="flex items-center gap-3 px-3 py-1.5">
                                    <span className="text-xs flex-1 min-w-0 truncate" title={key}>{key}</span>
                                    <Input
                                        inputMode="numeric"
                                        className="h-7 w-20 text-xs text-center"
                                        placeholder={String(draft.defaultMinutes)}
                                        value={draft.durationByProduct[key] ? String(draft.durationByProduct[key]) : ""}
                                        onChange={e => setProductMinutes(key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                className="h-8 text-xs"
                                placeholder="Adicionar produto (ex.: REFRIGERATOR)"
                                value={extraProduct}
                                onChange={e => setExtraProduct(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }}
                            />
                            <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={addProduct} disabled={!extraProduct.trim()}>Adicionar</Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Produto sem tempo definido usa o tempo padrão.</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
