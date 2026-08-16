import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { format } from "date-fns";
import type { ServiceOrder } from "@/lib/data";

/*
  LastVisitBadge — selo "Visitada" que, ao passar o mouse/clicar, abre um popover
  com o resumo do último atendimento daquela OS (técnico, data, defeito, peça
  trocada, observações e — se ficou pendente — o motivo).
*/
export function LastVisitBadge({
  os,
  technicianName,
  totalVisits = 1,
}: {
  os: ServiceOrder;
  technicianName?: string;
  totalVisits?: number;
}) {
  const nothingLogged =
    !os.observations &&
    !os.defectFound &&
    !os.replacedPart &&
    !(os.pendingReason && !os.isFinalized);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Impede que o pointerdown inicie um drag do card sortable.
          onPointerDown={(e) => e.stopPropagation()}
          title="Ver o que foi feito na última visita"
          className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Badge
            variant="secondary"
            className="cursor-pointer bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 text-[9px] px-1.5 py-0 flex items-center gap-0.5 whitespace-nowrap transition-colors"
          >
            <History className="w-2.5 h-2.5" /> Visitada
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-violet-50 dark:bg-violet-950/40 px-4 py-2.5 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300 font-semibold text-sm">
            <History className="w-4 h-4" /> Última visita
          </div>
          <span className="text-[11px] font-medium text-muted-foreground">{format(os.date, "dd/MM/yyyy")}</span>
        </div>
        <div className="p-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Técnico</span>
            <span className="font-medium text-right">{technicianName || "—"}</span>
          </div>
          {!os.isFinalized && os.pendingReason && (
            <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2.5 py-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">⚠️ Atendimento não finalizado</p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">{os.pendingReason}</p>
            </div>
          )}
          {os.defectFound && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Defeito constatado</p>
              <p className="text-xs whitespace-pre-wrap">{os.defectFound}</p>
            </div>
          )}
          {os.replacedPart && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Peça trocada</p>
              <p className="text-xs font-mono whitespace-pre-wrap">{os.replacedPart}</p>
            </div>
          )}
          {os.observations ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Observações</p>
              <p className="text-xs whitespace-pre-wrap">{os.observations}</p>
            </div>
          ) : (
            nothingLogged && <p className="text-xs text-muted-foreground italic">Sem observações registradas nesta visita.</p>
          )}
          {totalVisits > 1 && (
            <p className="text-[10px] text-muted-foreground pt-1 border-t">{totalVisits} atendimentos nesta OS — exibindo o mais recente.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
