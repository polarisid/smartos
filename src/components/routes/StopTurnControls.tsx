import { Phone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouteStop } from "@/lib/data";

/*
  StopTurnControls — rodapé de turno (M/T/C) + confirmação por ligação/mensagem
  de uma parada. Extraído do SortableStopCard para ser reutilizável tanto na
  prévia de otimização (drag-and-drop) quanto na tela de confirmação de
  turnos/datas (lista fechada, sem drag).
*/

export function StopTurnControls({
  stop,
  onSetTurn,
  onToggleCall,
  onToggleMessage,
}: {
  stop: RouteStop;
  onSetTurn: (turn: string) => void;
  onToggleCall: () => void;
  onToggleMessage: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pb-2">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium text-muted-foreground mr-0.5">Turno</span>
        {['M', 'T', 'C'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onSetTurn(t)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all",
              stop.turn === t
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-muted/60 hover:bg-muted text-muted-foreground border-border/50"
            )}
          >
            {t}
          </button>
        ))}
        <input
          type="text"
          value={stop.turn && !['M', 'T', 'C'].includes(stop.turn) ? stop.turn : ''}
          onChange={(e) => onSetTurn(e.target.value)}
          placeholder="Outro"
          className="h-5 text-[10px] px-1.5 rounded border border-input bg-background w-14 focus:ring-1 focus:ring-primary focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleCall}
          className={cn(
            "h-6 w-7 rounded border flex items-center justify-center transition-all",
            stop.confirmedByCall
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-muted/40 hover:bg-muted text-slate-600 dark:text-slate-400 border-border/50"
          )}
          title="Confirmação por Ligação"
        >
          <Phone className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleMessage}
          className={cn(
            "h-6 w-7 rounded border flex items-center justify-center transition-all",
            stop.confirmedByMessage
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-muted/40 hover:bg-muted text-slate-600 dark:text-slate-400 border-border/50"
          )}
          title="Confirmação por Mensagem / WhatsApp"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
