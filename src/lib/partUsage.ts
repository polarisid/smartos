import type { ServiceOrder } from "./data";

const norm = (s?: string) => (s || "").trim().toUpperCase();

// "DC93-00350B (x1), DC96-01574B" -> ["DC93-00350B", "DC96-01574B"]
function codesIn(replacedPart?: string): string[] {
    return (replacedPart || "")
        .split(",")
        .map(raw => raw.trim().match(/^([a-zA-Z0-9-]+)/)?.[0])
        .filter((c): c is string => !!c)
        .map(norm);
}

/**
 * Situação de UMA peça de UMA OS depois que a rota foi criada: usada (consta em "peça trocada" de
 * alguma OS lançada) e/ou defeito de peça nova (pendência). Considera TODAS as OS lançadas para o
 * número daquela parada - não só a mais recente, que pode ser uma visita sem peça (pendência/retorno)
 * e fazia o extrato mostrar "Nova" quando a tela de resumo mostrava "Usada".
 */
export function partUsageInStop(
    serviceOrderNumber: string,
    partCode: string,
    serviceOrders: ServiceOrder[],
    routeCreatedAt: Date
): { used: boolean; defective: boolean } {
    const code = norm(partCode);
    let used = false;
    let defective = false;
    for (const os of serviceOrders) {
        if (os.serviceOrderNumber !== serviceOrderNumber || os.ignoreInRoute) continue;
        if (!(os.date.getTime() > routeCreatedAt.getTime())) continue;
        if (codesIn(os.replacedPart).includes(code)) used = true;
        if (os.pendingReason?.includes("Peça nova com defeito") && norm(os.pendingReason).includes(code)) defective = true;
    }
    return { used, defective };
}
