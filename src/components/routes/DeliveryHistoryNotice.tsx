import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { OrderHistory } from "@/lib/deliveryHistory";

/**
 * Aviso ao montar uma rota de entrega: OS que já estiveram em entregas anteriores e peças que já foram enviadas
 * (com rastreio), para não mandar a mesma peça duas vezes.
 */
export function DeliveryHistoryNotice({
    history,
    skipSent,
    onSkipSentChange,
}: {
    history: Map<string, OrderHistory>;
    skipSent: boolean;
    onSkipSentChange: (v: boolean) => void;
}) {
    if (history.size === 0) return null;
    const list = Array.from(history.values());
    const allSent = list.filter(h => h.allPartsSent).length;
    const partRepeated = list.filter(h => h.repeatedParts.length > 0).length;

    return (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 space-y-2">
            <p className="flex items-start gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                    {list.length} OS já estiveram em entregas anteriores
                    {partRepeated > 0 ? <> · <strong>{partRepeated}</strong> com peça já enviada</> : null}
                </span>
            </p>
            <ul className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {list.map(h => (
                    <li key={h.serviceOrder} className="leading-snug">
                        <span className="font-mono font-semibold">{h.serviceOrder}</span>
                        {h.repeatedParts.length > 0 ? (
                            h.repeatedParts.map((p, i) => (
                                <div key={i} className="pl-3 text-red-700 dark:text-red-300">
                                    Peça <span className="font-mono">{p.code}</span>{p.description ? " (" + p.description + ")" : ""} já enviada em {p.routeName}
                                    {p.trackingCode ? <> · rastreio <span className="font-mono">{p.trackingCode}</span></> : null}
                                </div>
                            ))
                        ) : null}
                        {h.shipments.map((sh, i) => (
                            <div key={i} className="pl-3 text-amber-800/90 dark:text-amber-300/90">
                                Esteve em {sh.routeName} ({format(sh.routeDate, "dd/MM/yyyy")}):{" "}
                                {sh.sent.length > 0 ? sh.sent.length + " peça(s) enviada(s)" : "nenhuma peça enviada"}
                                {sh.unsentCount > 0 ? " · " + sh.unsentCount + " sem rastreio" : ""}
                            </div>
                        ))}
                    </li>
                ))}
            </ul>
            {allSent > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox checked={skipSent} onCheckedChange={v => onSkipSentChange(v === true)} />
                    <span>Não incluir as <strong>{allSent}</strong> OS cujas peças já foram todas enviadas</span>
                </label>
            )}
        </div>
    );
}
