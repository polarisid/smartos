"use client";

import { extraPartsOf, sentBeforeOf, type OrderHistory } from "@/lib/deliveryHistory";
import type { RoutePart } from "@/lib/data";

// O que a OS já levou em OUTRAS rotas de entrega: peças já enviadas (com rastreio) que vêm de novo nesta rota e
// peças que foram só lá. Avisa quem separa/entrega para não repetir a remessa nem achar que falta peça.

const shortDate = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function OtherDeliveryNotice({ history, parts, className }: { history?: OrderHistory; parts: RoutePart[]; className?: string }) {
    if (!history) return null;
    const repeated = parts
        .map(p => ({ part: p, sent: sentBeforeOf(history, p.code)?.before }))
        .filter((x): x is { part: RoutePart; sent: NonNullable<typeof x.sent> } => !!x.sent);
    const extra = extraPartsOf(history);
    if (repeated.length === 0 && extra.length === 0) return null;
    return (
        <div className={className ?? "space-y-1"}>
            {repeated.map(({ part, sent }) => (
                <p key={part.code} className="rounded bg-red-100 px-2 py-1 text-[11px] font-semibold leading-snug text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {part.code} já foi enviada em {sent.routeName} ({shortDate(sent.routeDate)}) · rastreio {sent.trackingCode}
                </p>
            ))}
            {extra.length > 0 && (
                <p className="rounded bg-sky-50 px-2 py-1 text-[11px] leading-snug text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                    <strong>Esta OS também tem peça em outra rota de entrega (não está nesta):</strong>{" "}
                    {extra.map(d => d.code + (d.before ? ` (${d.before.routeName}, rastreio ${d.before.trackingCode})` : "")).join("; ")}
                </p>
            )}
        </div>
    );
}
