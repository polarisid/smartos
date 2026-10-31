"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { CopyX } from "lucide-react";
import type { RouteStop } from "@/lib/data";
import { useActiveRoutes, useDraftRoutes } from "@/hooks/queries";
import { buildOpenRouteIndex, findDuplicateOrders, hasDuplicates } from "@/lib/duplicateOrders";

/**
 * Aviso de OS duplicada ao montar ou editar uma rota: repetida na própria planilha colada ou já em outra rota aberta
 * (ativa ou rascunho). Só avisa: quem decide se mantém é a pessoa.
 * `excludeRouteId`: rota em edição, para ela mesma não contar como "outra rota".
 */
export function DuplicateOrdersNotice({ stops, excludeRouteId, className }: { stops: RouteStop[]; excludeRouteId?: string; className?: string }) {
    const { data: active = [] } = useActiveRoutes();
    const { data: drafts = [] } = useDraftRoutes();
    const index = useMemo(() => buildOpenRouteIndex([...active, ...drafts]), [active, drafts]);
    const report = useMemo(() => findDuplicateOrders(stops, index, excludeRouteId), [stops, index, excludeRouteId]);
    if (!hasDuplicates(report)) return null;

    return (
        <div className={"rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 space-y-2 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200 " + (className || "")}>
            <p className="flex items-center gap-1.5 font-semibold">
                <CopyX className="h-3.5 w-3.5 shrink-0" />
                OS duplicada
                {report.repeatedInPaste.length > 0 && <span className="font-normal">· {report.repeatedInPaste.length} repetida(s) na planilha</span>}
                {report.inOtherRoutes.length > 0 && <span className="font-normal">· {report.inOtherRoutes.length} já em outra rota</span>}
            </p>
            <ul className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {report.repeatedInPaste.map(d => (
                    <li key={"p" + d.serviceOrder} className="leading-snug">
                        <span className="font-mono font-semibold">{d.serviceOrder}</span>
                        {d.consumerName ? <span className="text-red-800/80 dark:text-red-300/80"> · {d.consumerName}</span> : null}
                        <div className="pl-3">Aparece {d.count} vezes na planilha colada.</div>
                    </li>
                ))}
                {report.inOtherRoutes.map(d => (
                    <li key={"o" + d.serviceOrder} className="leading-snug">
                        <span className="font-mono font-semibold">{d.serviceOrder}</span>
                        {d.consumerName ? <span className="text-red-800/80 dark:text-red-300/80"> · {d.consumerName}</span> : null}
                        {d.locations.map(l => (
                            <div key={l.routeId} className="pl-3">
                                Já está em <strong>{l.routeName}</strong> ({l.status === "ativa" ? "ativa" : "rascunho"}
                                {l.date ? " · " + format(l.date, "dd/MM") : ""}{l.technicianName ? " · " + l.technicianName : ""})
                            </div>
                        ))}
                    </li>
                ))}
            </ul>
        </div>
    );
}
