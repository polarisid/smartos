import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { OrderHistory, OrderVerdict, PartSituation } from "@/lib/deliveryHistory";

/**
 * Aviso ao montar uma rota de entrega: compara, OS por OS, o que está entrando agora com o que já foi enviado em
 * entregas anteriores, para não mandar a mesma peça duas vezes.
 */

const VERDICT: Record<OrderVerdict, { label: string; chip: string; bar: string; order: number }> = {
    "todas-enviadas": { label: "Tudo já enviado", chip: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800", bar: "border-l-red-500", order: 0 },
    parcial: { label: "Parte já enviada", chip: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800", bar: "border-l-amber-500", order: 1 },
    "pecas-novas": { label: "Só peças novas", chip: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800", bar: "border-l-emerald-500", order: 2 },
    "sem-pecas": { label: "Sem peças na planilha", chip: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700", bar: "border-l-slate-400", order: 3 },
};

const SITUATION: Record<PartSituation, { label: string; chip: string }> = {
    repetida: { label: "Já enviada", chip: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" },
    nova: { label: "Nova", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" },
    "sem-rastreio": { label: "Sem rastreio antes", chip: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300" },
    "so-antes": { label: "Não vem agora", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const day = (d: Date) => format(d, "dd/MM/yyyy");

export function DeliveryHistoryNotice({
    history,
    skipSent,
    onSkipSentChange,
}: {
    history: Map<string, OrderHistory>;
    skipSent: boolean;
    onSkipSentChange: (v: boolean) => void;
}) {
    const [filter, setFilter] = useState<OrderVerdict | "all">("all");
    if (history.size === 0) return null;

    const list = Array.from(history.values()).sort((a, b) => VERDICT[a.verdict].order - VERDICT[b.verdict].order || a.serviceOrder.localeCompare(b.serviceOrder));
    const counts = list.reduce((m, h) => m.set(h.verdict, (m.get(h.verdict) || 0) + 1), new Map<OrderVerdict, number>());
    const allSent = counts.get("todas-enviadas") || 0;
    const shown = filter === "all" ? list : list.filter(h => h.verdict === filter);

    return (
        <div className="rounded-md border border-amber-300 bg-amber-50/60 px-3 py-2.5 text-xs space-y-2.5 dark:border-amber-700 dark:bg-amber-950/20">
            <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {list.length} OS já estiveram em entregas anteriores
            </p>

            <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setFilter("all")} className={cn("rounded-full border px-2.5 py-0.5", filter === "all" ? "bg-foreground text-background border-foreground" : "bg-background hover:bg-muted")}>
                    Todas ({list.length})
                </button>
                {(Object.keys(VERDICT) as OrderVerdict[]).filter(v => counts.get(v)).map(v => (
                    <button key={v} type="button" onClick={() => setFilter(filter === v ? "all" : v)} className={cn("rounded-full border px-2.5 py-0.5", VERDICT[v].chip, filter === v && "ring-2 ring-offset-1 ring-foreground/40")}>
                        {VERDICT[v].label} ({counts.get(v)})
                    </button>
                ))}
            </div>

            <div className="max-h-[38vh] overflow-y-auto space-y-2 pr-1">
                {shown.map(h => (
                    <div key={h.serviceOrder} className={cn("rounded-md border border-l-4 bg-background p-2", VERDICT[h.verdict].bar)}>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="font-mono font-semibold text-sm">{h.serviceOrder}</span>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", VERDICT[h.verdict].chip)}>{VERDICT[h.verdict].label}</span>
                            <span className="text-muted-foreground">
                                {h.shipments.length === 1 ? "esteve em " + h.shipments[0].routeName + " (" + day(h.shipments[0].routeDate) + ")" : "esteve em " + h.shipments.length + " entregas: " + h.shipments.map(s => s.routeName + " (" + format(s.routeDate, "dd/MM") + ")").join(", ")}
                            </span>
                        </div>

                        {h.diff.length > 0 ? (
                            <table className="w-full border-collapse text-[11px]">
                                <thead>
                                    <tr className="text-left text-muted-foreground">
                                        <th className="font-medium pb-1 pr-2">Peça</th>
                                        <th className="font-medium pb-1 pr-2">Já enviado antes</th>
                                        <th className="font-medium pb-1 pr-2 w-16">Agora</th>
                                        <th className="font-medium pb-1 w-32">Situação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {h.diff.map(d => (
                                        <tr key={d.code} className="border-t align-top">
                                            <td className="py-1 pr-2">
                                                <div className="font-mono font-semibold">{d.code}</div>
                                                {d.description && <div className="text-muted-foreground leading-tight">{d.description}</div>}
                                            </td>
                                            <td className="py-1 pr-2">
                                                {d.before ? (
                                                    <>
                                                        <div>{d.before.routeName} · {format(d.before.routeDate, "dd/MM")}{d.before.quantity > 1 ? " · qtd " + d.before.quantity : ""}</div>
                                                        <div className="text-muted-foreground">rastreio <span className="font-mono">{d.before.trackingCode}</span></div>
                                                    </>
                                                ) : d.unsentIn ? (
                                                    <div className="text-muted-foreground">estava em {d.unsentIn.routeName}, sem rastreio</div>
                                                ) : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="py-1 pr-2 tabular-nums">{d.newQty != null ? "qtd " + d.newQty : <span className="text-muted-foreground">—</span>}</td>
                                            <td className="py-1">
                                                <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", SITUATION[d.situation].chip)}>{SITUATION[d.situation].label}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p className="text-muted-foreground">
                                A planilha não traz peças para esta OS, então não dá para comparar.{" "}
                                {h.shipments.some(s => s.sent.length > 0) ? "Antes foram enviadas " + h.shipments.reduce((n, s) => n + s.sent.length, 0) + " peça(s)." : "Antes nenhuma peça tinha rastreio."}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {allSent > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none text-amber-900 dark:text-amber-200">
                    <Checkbox checked={skipSent} onCheckedChange={v => onSkipSentChange(v === true)} />
                    <span>Não incluir as <strong>{allSent}</strong> OS cujas peças já foram todas enviadas</span>
                </label>
            )}
        </div>
    );
}
