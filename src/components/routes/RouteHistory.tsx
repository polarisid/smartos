"use client";

import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, History, Loader2, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { routeAuditService, type RouteChange } from "@/services/supabase/routeAuditService";

const ROUTE_FIELD_LABELS: Record<string, string> = {
    name: "Nome da rota",
    is_active: "Rota ativa",
    is_draft: "Rascunho",
    is_canceled: "Cancelada",
    route_type: "Tipo da rota",
    license_plate: "Placa",
    technician_id: "Técnico (id)",
    technician_name: "Técnico",
    driver_id: "Motorista (id)",
    driver_name: "Motorista",
    driver_phone: "Telefone do motorista",
    departure_date: "Data de saída",
    arrival_date: "Data de chegada",
    planned_date: "Data planejada",
    departure_time: "Hora de saída",
    start_point: "Ponto de saída",
    end_point: "Ponto de chegada",
};

const STOP_FIELD_LABELS: Record<string, string> = {
    turn: "Turno",
    firstVisitDate: "Data da visita",
    confirmedByCall: "Confirmação por ligação",
    confirmedByMessage: "Confirmação por mensagem",
    messageStatus: "Mensagem ao cliente",
    stopType: "Tipo da parada",
    collectionType: "Tipo de coleta",
    addressDetails: "Endereço detalhado",
    statusComment: "Comentário de status",
    observations: "Observações",
    avoidFerryToNext: "Evitar balsa",
    estimatedMinutes: "Tempo de atendimento (min)",
    etaStart: "Horário previsto",
    isReallocated: "Realocada",
    reallocatedToRouteName: "Realocada para",
    city: "Cidade",
    neighborhood: "Bairro",
    zipCode: "CEP",
    model: "Modelo",
    warrantyType: "Garantia",
    consumerName: "Cliente",
};

const PART_FIELD_LABELS: Record<string, string> = {
    trackingCode: "Rastreio",
    quantity: "Quantidade",
    description: "Descrição",
};

function formatValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "sim" : "não";
    if (/date$/i.test(field) && typeof value === "string") {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return format(d, "dd/MM/yyyy HH:mm");
    }
    if (typeof value === "object") {
        const v = value as { address?: string };
        return v.address || JSON.stringify(value);
    }
    const text = String(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function describe(change: RouteChange): string {
    switch (change.kind) {
        case "created": return `Rota criada${change.name ? ` (“${change.name}”)` : ""}${change.stops != null ? ` com ${change.stops} parada(s)` : ""}`;
        case "deleted": return `Rota excluída${change.name ? ` (“${change.name}”)` : ""}`;
        case "field": return `${ROUTE_FIELD_LABELS[change.field] || change.field}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
        case "stop_added": return `OS ${change.os} adicionada${change.city ? ` (${change.city})` : ""}`;
        case "stop_removed": return `OS ${change.os} removida${change.city ? ` (${change.city})` : ""}`;
        case "stop_field": return `OS ${change.os} · ${STOP_FIELD_LABELS[change.field] || change.field}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
        case "part_added": return `OS ${change.os} · peça ${change.part} adicionada`;
        case "part_removed": return `OS ${change.os} · peça ${change.part} removida`;
        case "part_field": return `OS ${change.os} · peça ${change.part} · ${PART_FIELD_LABELS[change.field] || change.field}: ${formatValue(change.field, change.from)} → ${formatValue(change.field, change.to)}`;
        case "order": return "Ordem das paradas alterada";
        default: return "Alteração";
    }
}

// Histórico de alterações da rota: quem mudou, quando e o quê (registrado pelo banco).
export function RouteHistory({ routeId }: { routeId: string }) {
    const { appUser, activeUnidadeId } = useAuth();
    const { data: entries = [], isLoading, isError } = useQuery({
        queryKey: ["route-audit", appUser?.uid, activeUnidadeId, routeId],
        queryFn: () => routeAuditService.getByRoute(routeId),
        enabled: !!routeId && !!appUser?.uid,
        staleTime: 15 * 1000,
        refetchOnWindowFocus: true,
    });

    if (isLoading) {
        return <p className="text-sm text-muted-foreground flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…</p>;
    }
    if (isError) {
        return (
            <div className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Histórico indisponível agora. Se esta é a primeira vez, o registro de alterações ainda precisa ser ativado no banco (migração 22).</span>
            </div>
        );
    }
    if (entries.length === 0) {
        return <p className="text-sm text-muted-foreground p-4">Nenhuma alteração registrada ainda. As mudanças feitas daqui para a frente aparecem aqui.</p>;
    }

    return (
        <div className="space-y-2 p-1">
            {entries.map(entry => (
                <div key={entry.id} className="rounded-lg border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/40">
                        <span className="flex items-center gap-1.5 text-sm font-semibold"><User className="h-3.5 w-3.5 text-muted-foreground" /> {entry.userName}</span>
                        <span className="text-xs text-muted-foreground" title={format(entry.createdAt, "dd/MM/yyyy HH:mm:ss")}>
                            {format(entry.createdAt, "dd/MM/yyyy 'às' HH:mm")} · {formatDistanceToNow(entry.createdAt, { addSuffix: true, locale: ptBR })}
                        </span>
                    </div>
                    <ul className="px-3 py-2 space-y-1">
                        {entry.changes.map((c, i) => (
                            <li key={i} className="text-xs flex items-start gap-1.5">
                                <History className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60" />
                                <span>{describe(c)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
