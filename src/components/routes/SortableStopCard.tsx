import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RouteStop } from "@/lib/data";
import { StopTurnControls } from "./StopTurnControls";

/*
  SortableStopCard — card arrastável (dnd-kit) da lista "Sugerido pela IA".
*/

export function SortableStopCard({
  stop,
  newPos,
  oldPos,
  isMoved,
  posDiff,
  segKm,
  segsLoading,
  isHovered,
  onHover,
  onSetTurn,
  onToggleCall,
  onToggleMessage,
  showTurnControls = true,
}: {
  stop: RouteStop;
  newPos: number;
  oldPos: number;
  isMoved: boolean;
  posDiff: number;
  segKm?: number;
  segsLoading: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSetTurn: (turn: string) => void;
  onToggleCall: () => void;
  onToggleMessage: () => void;
  showTurnControls?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.serviceOrder });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div>
      {/* Trecho de chegada (km da parada anterior até esta) */}
      <div className="flex items-center gap-1 pl-2 my-0.5">
        <span className="text-[9px] text-muted-foreground/60">↓</span>
        {segsLoading ? (
          <span className="text-[9px] text-muted-foreground animate-pulse px-1.5">atualizando…</span>
        ) : segKm !== undefined ? (
          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
            {segKm.toFixed(1)} km
          </span>
        ) : null}
      </div>

      <div
        ref={setNodeRef}
        style={style}
        onMouseEnter={() => onHover(stop.serviceOrder)}
        onMouseLeave={() => onHover(null)}
        className={cn(
          "rounded-lg border text-xs transition-colors",
          isMoved
            ? posDiff > 0
              ? "border-emerald-400/80 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/40"
              : "border-amber-400/80 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/40"
            : "border-violet-200 dark:border-violet-900/60 bg-background",
          isHovered && "ring-2 ring-primary/40",
          isDragging && "opacity-50 shadow-lg relative z-10"
        )}
      >
        <div className="flex items-center gap-2 p-2.5">
          {/* Alça de arrastar — só ela inicia o drag */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Arraste para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Número — corresponde ao pino no mapa */}
          <span className="h-6 w-6 rounded-full bg-blue-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
            {newPos}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-mono font-bold truncate">{stop.serviceOrder}</p>
              {stop.warrantyType === 'LP' && (
                <span className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] px-1 rounded font-bold shrink-0">LP</span>
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

          {/* Badge de movimento */}
          {isMoved ? (
            posDiff > 0 ? (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                <ArrowUp className="h-3 w-3" /> #{oldPos}→#{newPos}
              </span>
            ) : (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                <ArrowDown className="h-3 w-3" /> #{oldPos}→#{newPos}
              </span>
            )
          ) : (
            <span className="text-[10px] text-muted-foreground shrink-0">Mantida</span>
          )}
        </div>

        {showTurnControls && (
          <StopTurnControls
            stop={stop}
            onSetTurn={onSetTurn}
            onToggleCall={onToggleCall}
            onToggleMessage={onToggleMessage}
          />
        )}
      </div>
    </div>
  );
}
