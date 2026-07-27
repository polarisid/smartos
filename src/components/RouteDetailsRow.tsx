"use client";

import React from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TableRow, TableCell } from "@/components/ui/table";
import { CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageSquare, History, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceOrder, RouteStop } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "@/lib/clipboard";

export function RouteDetailsRow({ 
    stop, 
    index, 
    serviceOrders, 
    routeCreatedAt, 
    visitTemplate 
}: { 
    stop: RouteStop, 
    index: number, 
    serviceOrders: ServiceOrder[], 
    routeCreatedAt: Date,
    visitTemplate: string
}) {
    const { toast } = useToast();
    
    // Separate service orders into "this route" vs "previous visits"
    const allRelatedOs = serviceOrders
        .filter(os => os.serviceOrderNumber === stop.serviceOrder)
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    
    const currentRouteOs = allRelatedOs.filter(os => os.date.getTime() >= routeCreatedAt.getTime());
    const previousVisits = allRelatedOs.filter(os => os.date.getTime() < routeCreatedAt.getTime());
    
    // Status based ONLY on current route visits
    const currentOs = currentRouteOs.length > 0 ? currentRouteOs[0] : null;
    const isPending = currentOs && (currentOs.isFinalized === false);
    const isCompleted = currentOs && (currentOs.isFinalized !== false);
    
    // Previous visit info
    const hasPreviousVisits = previousVisits.length > 0;

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getRowClass = () => {
        if (stop.isReallocated) return "bg-slate-100 dark:bg-slate-900/50 line-through text-slate-400 dark:text-slate-500 opacity-60";
        if (isPending) return "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100";
        if (isCompleted) return "bg-green-100 dark:bg-green-900/50 line-through text-slate-500 opacity-60";
        if (hasPreviousVisits) return "bg-violet-50 dark:bg-violet-900/20";
        switch (stop.stopType) {
            case 'coleta': return 'bg-yellow-100 dark:bg-yellow-900/50';
            case 'entrega': return 'bg-blue-100 dark:bg-blue-900/50';
            default: return '';
        }
    };

    const stopTypeLabels = {
        padrao: 'Padrão',
        coleta: 'Coleta',
        entrega: 'Entrega'
    };

    return (
        <React.Fragment key={index}>
            <CollapsibleTrigger asChild>
                <TableRow className={cn("cursor-pointer", getRowClass())}>
                    <TableCell className="font-mono">
                        <span className="flex flex-wrap items-center gap-1.5">
                            {stop.serviceOrder}
                            {stop.isReallocated && (
                                <span className="text-[9px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded-full uppercase">Realocado</span>
                            )}
                            {hasPreviousVisits && !isCompleted && !isPending && !stop.isReallocated && (
                                <History className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                            )}
                            {stop.warrantyType === 'LP' && (
                                <button
                                    type="button"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        await copyToClipboard(stop.serviceOrder);
                                        toast({
                                            title: "OS Copiada! 📋",
                                            description: `Número ${stop.serviceOrder} copiado para a área de transferência.`,
                                        });
                                        window.open("https://samsungcontigo.com/#/account/signTechnician", "_blank", "noopener,noreferrer");
                                    }}
                                    className="focus:outline-none"
                                >
                                    <Badge className="bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] px-1.5 py-0.5 border-amber-300 gap-1 flex items-center cursor-pointer">
                                        📋 Pesquisa LP
                                    </Badge>
                                </button>
                            )}
                        </span>
                    </TableCell>
                    <TableCell>{stopTypeLabels[stop.stopType || 'padrao']}</TableCell>
                    <TableCell>{stop.city}</TableCell>
                    <TableCell>{stop.neighborhood}</TableCell>
                    <TableCell>{stop.model}</TableCell>
                    <TableCell>
                        {stop.parts && stop.parts.length > 0 ? (
                            <div>
                                {stop.parts.map((part, pIndex) => (
                                    <div key={pIndex} className="font-mono text-xs">
                                        {part.code} (x{part.quantity})
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                        <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                    </TableCell>
                </TableRow>
            </CollapsibleTrigger>
            <CollapsibleContent asChild>
                <tr className="bg-muted/50">
                    <TableCell colSpan={7} className="p-2">
                        <div className="p-2 bg-background/50 rounded space-y-2">
                            {stop.isReallocated && (
                                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-2">
                                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                                        ⚠️ Este atendimento foi realocado para a rota: <span className="font-bold">{stop.reallocatedToRouteName}</span>
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-xs mb-1">Nome Consumidor:</p>
                                <p className="text-sm text-foreground">{stop.consumerName || "N/A"}</p>
                            </div>
                             <div>
                                <p className="font-semibold text-xs mb-1">Detalhes:</p>
                                <p className="text-sm text-foreground">{stop.ascJobNumber} / {stop.ts} / {stop.warrantyType}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-xs mb-1">Previsão:</p>
                                <p className="text-sm text-foreground">
                                    {stop.firstVisitDate || "Sem data"} {stop.turn ? `- ${stop.turn}` : ''}
                                </p>
                            </div>
                            {isPending && (
                                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 space-y-1">
                                    <p className="font-semibold text-xs text-red-700 dark:text-red-400 mb-1">Registro do Técnico (Pendência):</p>
                                    {currentOs?.pendingReason && (
                                        <p className="text-sm text-red-800 dark:text-red-300">
                                            <span className="font-bold">Motivo: </span>{currentOs.pendingReason}
                                        </p>
                                    )}
                                    {currentOs?.observations && (
                                        <p className="text-sm text-red-800 dark:text-red-300">
                                            <span className="font-bold">Observações: </span>{currentOs.observations}
                                        </p>
                                    )}
                                    {!currentOs?.pendingReason && !currentOs?.observations && (
                                        <p className="text-sm text-muted-foreground">Nenhuma observação registrada.</p>
                                    )}
                                </div>
                            )}
                            
                            {/* Histórico de visitas anteriores */}
                            {hasPreviousVisits && (
                                <div className="rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 p-2 space-y-2">
                                    <p className="font-semibold text-xs text-violet-700 dark:text-violet-400 flex items-center gap-1">
                                        <History className="h-3 w-3" />
                                        Histórico de Visitas Anteriores ({previousVisits.length})
                                    </p>
                                    {previousVisits.map((visit, vIndex) => (
                                        <div key={vIndex} className="bg-white/60 dark:bg-background/40 rounded p-2 space-y-0.5 border border-violet-100 dark:border-violet-800/50">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold">
                                                    {format(visit.date, "dd/MM/yyyy")}
                                                </p>
                                                <span className={cn(
                                                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase",
                                                    visit.isFinalized === false
                                                        ? "bg-red-200 text-red-800"
                                                        : "bg-green-200 text-green-800"
                                                )}>
                                                    {visit.isFinalized === false ? "Pendência" : "Finalizada"}
                                                </span>
                                            </div>
                                            {visit.isFinalized === false && visit.pendingReason && (
                                                <p className="text-sm text-foreground/80">
                                                    <span className="font-bold">Motivo: </span>{visit.pendingReason}
                                                </p>
                                            )}
                                            {visit.observations && (
                                                <p className="text-sm text-foreground/80">
                                                    <span className="font-bold">Obs: </span>{visit.observations}
                                                </p>
                                            )}
                                            {!visit.pendingReason && !visit.observations && (
                                                <p className="text-sm text-muted-foreground italic">Sem observações registradas.</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {stop.statusComment && (
                                <div>
                                    <p className="font-semibold text-xs mb-1">Status ASC:</p>
                                    <p className="text-sm text-foreground">{stop.statusComment}</p>
                                </div>
                            )}
                            {(() => {
                                const addressQuery = stop.addressDetails
                                    ? encodeURIComponent(`${stop.addressDetails}, ${stop.neighborhood}, ${stop.city}`)
                                    : encodeURIComponent(`${stop.neighborhood ? stop.neighborhood + ', ' : ''}${stop.city}`);

                            return (
                                <div className="border-t pt-2 flex items-center gap-2">
                                    <Button size="sm" variant="outline" onClick={handleCopyVisitText}>
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                        Copiar Anúncio de Visita
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 hover:text-blue-700"
                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${addressQuery}`, '_blank')}
                                    >
                                        <MapPin className="mr-2 h-4 w-4" />
                                        Visualizar no Mapa
                                    </Button>
                                </div>
                            );
                        })()}
                    </div>
                    </TableCell>
                </tr>
            </CollapsibleContent>
        </React.Fragment>
    )
}
