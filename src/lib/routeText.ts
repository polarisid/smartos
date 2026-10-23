import type { RouteStop } from "./data";

// Texto da rota no formato da planilha (cabeçalho + uma linha por OS, separado por tabulação): o mesmo que se cola para criar a rota.
export function reconstructRouteText(stops: RouteStop[]): string {
    if (!stops || stops.length === 0) return "";

    let maxParts = 8;
    stops.forEach(s => {
        if (s.parts && s.parts.length > maxParts) {
            maxParts = s.parts.length;
        }
    });

    const baseHeaders = [
        "SO Nro.", "ASC Job No.", "Nome Consumidor", "Cidade", "Bairro", "UF", "CEP", "Modelo", "TURNO", "TAT",
        "Data de Solicitação", "1st Visit Date", "TS", "OW/LP", "SPD", "Status comment"
    ];

    const partHeaders: string[] = [];
    for (let i = 0; i < maxParts; i++) {
        partHeaders.push("COD", "DESCRICAO", "QTD");
    }

    const header = [...baseHeaders, ...partHeaders].join("\t");

    const lines = stops.map(stop => {
        const baseColumns = [
            stop.serviceOrder || '',
            stop.ascJobNumber || '',
            stop.consumerName || '',
            stop.city || '',
            stop.neighborhood || '',
            stop.state || '',
            stop.zipCode || '',
            stop.model || '',
            stop.turn || '',
            stop.tat || '',
            stop.requestDate || '',
            stop.firstVisitDate || '',
            stop.ts || '',
            stop.warrantyType || '',
            stop.productType || '',
            stop.statusComment || '',
        ];

        const partColumns: string[] = [];
        for (let i = 0; i < maxParts; i++) {
            const p = stop.parts?.[i];
            partColumns.push(
                p?.code || '',
                p?.description || '',
                p?.quantity != null ? String(p.quantity) : ''
            );
        }

        return [...baseColumns, ...partColumns].join('\t');
    });

    return [header, ...lines].join('\n');
}
