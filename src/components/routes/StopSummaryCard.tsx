import { AlertTriangle } from "lucide-react";
import type { RouteStop, ServiceOrder } from "@/lib/data";
import { formatLegTempo } from "@/lib/emailExport";
import { StopTurnControls } from "./StopTurnControls";
import { LastVisitBadge } from "./LastVisitBadge";

/*
  StopSummaryCard — versão não-arrastável do card de parada, usada no passo
  "Confirmação de turnos e datas": mostra o deslocamento real (km + minutos,
  vindos de fetchLegDistancesAndDurations) até essa parada, e os mesmos
  controles de turno/confirmação do SortableStopCard.
*/

export function StopSummaryCard({
  stop,
  position,
  legKm,
  legDurationMin,
  legsLoading,
  onSetTurn,
  onToggleCall,
  onToggleMessage,
  lastVisit = null,
  lastVisitTechnicianName,
  lastVisitTotal = 1,
}: {
  stop: RouteStop;
  position: number;
  legKm?: number;
  legDurationMin?: number;
  legsLoading: boolean;
  onSetTurn: (turn: string) => void;
  onToggleCall: () => void;
  onToggleMessage: () => void;
  lastVisit?: ServiceOrder | null;
  lastVisitTechnicianName?: string;
  lastVisitTotal?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 pl-2 my-0.5">
        <span className="text-[9px] text-muted-foreground/60">↓</span>
        {legsLoading ? (
          <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">calculando deslocamento…</span>
        ) : legKm !== undefined ? (
          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            {formatLegTempo(legKm, legDurationMin) || `${legKm.toFixed(1)} km`}
          </span>
        ) : null}
      </div>

      <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 bg-background text-xs">
        <div className="flex items-center gap-2 p-2.5">
          <span className="h-6 w-6 rounded-full bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
            {position}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-mono font-bold truncate">{stop.serviceOrder}</p>
              {stop.warrantyType === 'LP' && (
                <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] px-1 rounded font-bold shrink-0">LP</span>
              )}
              {lastVisit && (
                <LastVisitBadge os={lastVisit} technicianName={lastVisitTechnicianName} totalVisits={lastVisitTotal} />
              )}
              {stop.zipMismatch && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300 px-1.5 py-0 rounded border border-red-300 shrink-0"
                  title={stop.zipMismatchDetails || `CEP ${stop.zipCode} parece ser de ${stop.suggestedCityState}, mas a parada está em ${stop.city}`}
                >
                  <AlertTriangle className="w-2.5 h-2.5" /> CEP{stop.suggestedCityState ? ` de ${stop.suggestedCityState}` : ""}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground truncate flex items-center flex-wrap gap-1 mt-0.5">
              <span className="font-medium text-foreground">{stop.city}</span>
              {stop.state && (
                <span className="text-[9px] font-extrabold uppercase text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950 px-1 rounded">
                  {stop.state.toUpperCase()}
                </span>
              )}
              {stop.neighborhood && <span>· {stop.neighborhood}</span>}
              {stop.zipCode && (
                <span className="font-mono text-[9px] text-muted-foreground">{stop.zipCode}</span>
              )}
            </p>
          </div>
        </div>

        <StopTurnControls
          stop={stop}
          onSetTurn={onSetTurn}
          onToggleCall={onToggleCall}
          onToggleMessage={onToggleMessage}
        />
      </div>
    </div>
  );
}
