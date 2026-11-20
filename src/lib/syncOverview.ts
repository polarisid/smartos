// Visão única da fila de sincronização do aparelho: relatórios (com fotos), rastreios e registros de veículo
// que ficaram guardados sem internet. Pura (sem acesso a banco/rede) para a tela só desenhar o resultado.

export type SyncReportLike = {
    localId: string;
    createdAt: number;
    attempts: number;
    lastError?: string;
    memoryOnly?: boolean;
    photoCount: number;
    payload: { serviceOrderNumber?: string; reportType?: string };
};

export type SyncOverviewState = "offline" | "syncing" | "error" | "pending" | "ok";

export type SyncOverview = {
    state: SyncOverviewState;
    /** Itens esperando envio (relatórios + rastreios + registros de veículo). */
    totalPending: number;
    reports: { localId: string; title: string; photoCount: number; age: string; attempts: number; lastError?: string; memoryOnly: boolean }[];
    trackingCount: number;
    vehicleCount: number;
    /** Relatório que só existe na memória da aba: fechar a página perde o relatório. */
    hasMemoryOnly: boolean;
    /** Frase curta para o botão/título. */
    headline: string;
};

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function ageLabel(fromMs: number, nowMs: number): string {
    const min = Math.max(0, Math.floor((nowMs - fromMs) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const days = Math.floor(h / 24);
    return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildSyncOverview(input: {
    online: boolean;
    isFlushing: boolean;
    reports: SyncReportLike[];
    trackingCount: number;
    vehicleCount: number;
    now: number;
}): SyncOverview {
    const reports = [...input.reports]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(r => ({
            localId: r.localId,
            title: r.payload.serviceOrderNumber ? `OS ${r.payload.serviceOrderNumber}` : "Relatório sem número de OS",
            photoCount: r.photoCount,
            age: ageLabel(r.createdAt, input.now),
            attempts: r.attempts,
            lastError: r.lastError,
            memoryOnly: !!r.memoryOnly,
        }));
    const totalPending = reports.length + input.trackingCount + input.vehicleCount;
    const hasError = reports.some(r => r.lastError);
    const hasMemoryOnly = reports.some(r => r.memoryOnly);

    let state: SyncOverviewState;
    if (input.isFlushing) state = "syncing";
    else if (!input.online) state = "offline";
    else if (hasError) state = "error";
    else if (totalPending > 0) state = "pending";
    else state = "ok";

    const parts: string[] = [];
    if (reports.length) parts.push(plural(reports.length, "relatório", "relatórios"));
    if (input.trackingCount) parts.push(plural(input.trackingCount, "rastreio", "rastreios"));
    if (input.vehicleCount) parts.push(plural(input.vehicleCount, "registro de veículo", "registros de veículo"));
    const list = parts.join(", ");

    const headline =
        state === "syncing" ? "Enviando…"
        : state === "ok" ? "Tudo sincronizado"
        : state === "offline" ? (totalPending > 0 ? `Sem internet · ${list} guardado(s)` : "Sem internet")
        : state === "error" ? `Falha ao enviar · ${list}`
        : `Aguardando envio · ${list}`;

    return { state, totalPending, reports, trackingCount: input.trackingCount, vehicleCount: input.vehicleCount, hasMemoryOnly, headline };
}
