"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, MessageSquare, XCircle, Calendar, MapPin, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceOrder, RouteStop } from "@/lib/data";
import { copyToClipboard } from "@/lib/clipboard";

export function MobileRouteStopCard({ 
    stop, 
    index, 
    serviceOrders, 
    routeCreatedAt, 
    visitTemplate, 
    blockedOrders, 
    onBlock, 
    onUnblock 
}: { 
    stop: RouteStop, 
    index: number, 
    serviceOrders: ServiceOrder[], 
    routeCreatedAt: Date,
    visitTemplate: string,
    blockedOrders: Record<string, string>,
    onBlock: (serviceOrder: string, reason: string) => void,
    onUnblock: (serviceOrder: string) => void,
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
    
    const isBlocked = !!blockedOrders[stop.serviceOrder];
    const blockReason = blockedOrders[stop.serviceOrder] || "";
    const [pendingReason, setPendingReason] = useState(blockReason);

    const addressQuery = stop.addressDetails
        ? encodeURIComponent(`${stop.addressDetails}, ${stop.neighborhood}, ${stop.city}`)
        : encodeURIComponent(`${stop.neighborhood ? stop.neighborhood + ', ' : ''}${stop.city}`);

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getCardClass = () => {
        if (stop.isReallocated) return "border-slate-300 bg-slate-50 dark:bg-slate-900/30 opacity-70";
        if (isBlocked || isPending) return "border-red-400 bg-red-50 dark:bg-red-900/20";
        if (isCompleted) return "border-green-300 bg-green-50 dark:bg-green-900/20";
        if (hasPreviousVisits) return "border-violet-300 bg-violet-50/50 dark:bg-violet-900/10";
        switch (stop.stopType) {
            case 'coleta': return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20';
            case 'entrega': return 'border-blue-300 bg-blue-50 dark:bg-blue-900/20';
            default: return '';
        }
    };

    const stopTypeLabels = {
        padrao: 'Padrão',
        coleta: 'Coleta',
        entrega: 'Entrega'
    };

    return (
        <Card className={cn("overflow-hidden border", getCardClass())}>
            <div className="p-3 space-y-2.5">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stopTypeLabels[stop.stopType || 'padrao']}</span>
                            {stop.ts && <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">{stop.ts}</span>}
                            {stop.warrantyType && <span className="text-[9px] font-bold bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">{stop.warrantyType}</span>}
                            {stop.ascJobNumber && <span className="text-[9px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{stop.ascJobNumber}</span>}
                            {stop.firstVisitDate && <span className="text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-1"><Calendar className="h-3 w-3" />{stop.firstVisitDate}</span>}
                            {stop.turn && <span className="text-[9px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">{stop.turn}</span>}
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
                                        window.open("https://samsungcontigo.com/#/account/medalliaQrCode", "_blank", "noopener,noreferrer");
                                    }}
                                    className="focus:outline-none"
                                >
                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors">
                                        📋 Pesquisa LP
                                    </span>
                                </button>
                            )}
                        </div>
                        <p className={cn("font-mono font-black text-lg tracking-tight text-foreground leading-none", (isCompleted || stop.isReallocated) && "line-through opacity-60")}>{stop.serviceOrder}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1">
                            {stop.isReallocated && <div className="text-[10px] bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold uppercase">Realocado</div>}
                            {isCompleted && <div className="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold uppercase">Concluída</div>}
                            {isPending && <div className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold uppercase">Pendência</div>}
                            {isBlocked && <div className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1"><XCircle className="h-3 w-3"/>Bloqueada</div>}
                            {hasPreviousVisits && !isCompleted && !isPending && !stop.isReallocated && (
                                <div className="text-[10px] bg-violet-200 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                                    <History className="h-3 w-3" />Já Visitada
                                </div>
                            )}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100"
                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${addressQuery}`, '_blank')}
                            title="Abrir no Google Maps"
                        >
                            <MapPin className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm bg-background/60 p-2 rounded border border-border/40">
                    <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground">Local</p>
                        <p className="text-xs font-semibold leading-tight line-clamp-1">{stop.city} - {stop.neighborhood}</p>
                    </div>
                    <div>
                        <p className="text-[9px] uppercase font-bold text-muted-foreground">Produto</p>
                        <p className="text-xs font-semibold leading-tight line-clamp-1">{stop.model}</p>
                    </div>
                </div>

                {stop.parts && stop.parts.length > 0 && (
                    <div className="pt-1">
                        <div className="flex flex-wrap gap-1.5">
                            {stop.parts.map((part, pIndex) => (
                                <div key={pIndex} className="bg-background border shadow-sm rounded flex items-center px-1.5 py-0.5 font-mono text-[10px] font-bold">
                                    {part.code} <span className="text-primary ml-1 opacity-80">x{part.quantity}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isBlocked && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 rounded p-2">
                        <p className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400 mb-0.5">Motivo do Bloqueio:</p>
                        <p className="text-xs text-red-800 dark:text-red-300 font-medium leading-tight">{blockReason}</p>
                    </div>
                )}

                <Collapsible>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full h-7 text-[10px] uppercase font-bold text-muted-foreground hover:bg-transparent border-t border-transparent hover:border-border/50 mt-1 rounded-none">
                            <span className="flex items-center">Menu Expandido <ChevronDown className="h-3 w-3 ml-1 transition-transform [&[data-state=open]]:rotate-180" /></span>
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 mt-1 border-t border-border/50 space-y-3">
                        {stop.isReallocated && (
                            <div className="rounded-md bg-amber-50 dark:bg-amber-955/10 border border-amber-200 dark:border-amber-900 p-2 text-xs">
                                <p className="font-semibold text-amber-800 dark:text-amber-400">
                                    ⚠️ Este atendimento foi realocado para a rota: <span className="font-bold">{stop.reallocatedToRouteName}</span>
                                </p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="font-bold text-[10px] uppercase text-muted-foreground mb-0.5">Consumidor:</p>
                                <p className="text-xs font-medium line-clamp-1">{stop.consumerName || "N/A"}</p>
                            </div>
                            <div>
                                <p className="font-bold text-[10px] uppercase text-muted-foreground mb-0.5">Status ASC:</p>
                                <p className="text-[11px] font-medium leading-tight line-clamp-2">{stop.statusComment || "N/A"}</p>
                            </div>
                        </div>
                        {isPending && (
                            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 space-y-1">
                                <p className="font-bold text-[10px] uppercase text-red-700 dark:text-red-400 mb-1">Registro do Técnico (Pendência):</p>
                                {currentOs?.pendingReason && (
                                    <p className="text-xs text-red-800 dark:text-red-300">
                                        <span className="font-bold">Motivo: </span>{currentOs.pendingReason}
                                    </p>
                                )}
                                {currentOs?.observations && (
                                    <p className="text-xs text-red-800 dark:text-red-300">
                                        <span className="font-bold">Observações: </span>{currentOs.observations}
                                    </p>
                                )}
                                {!currentOs?.pendingReason && !currentOs?.observations && (
                                    <p className="text-xs text-muted-foreground">Nenhuma observação registrada pelo técnico.</p>
                                )}
                            </div>
                        )}
                        
                        {/* Histórico de visitas anteriores */}
                        {hasPreviousVisits && (
                            <div className="rounded-md bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 p-2 space-y-2">
                                <p className="font-bold text-[10px] uppercase text-violet-700 dark:text-violet-400 flex items-center gap-1">
                                    <History className="h-3 w-3" />
                                    Histórico de Visitas Anteriores ({previousVisits.length})
                                </p>
                                {previousVisits.map((visit, vIndex) => (
                                    <div key={vIndex} className="bg-white/60 dark:bg-background/40 rounded p-2 space-y-0.5 border border-violet-100 dark:border-violet-800/50">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[10px] text-violet-600 dark:text-violet-400 font-semibold">
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
                                            <p className="text-xs text-foreground/80">
                                                <span className="font-bold">Motivo: </span>{visit.pendingReason}
                                            </p>
                                        )}
                                        {visit.observations && (
                                            <p className="text-xs text-foreground/80">
                                                <span className="font-bold">Obs: </span>{visit.observations}
                                            </p>
                                        )}
                                        {!visit.pendingReason && !visit.observations && (
                                            <p className="text-xs text-muted-foreground italic">Sem observações registradas.</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <Button size="sm" variant="default" className="w-full font-bold h-9 bg-primary" onClick={handleCopyVisitText}>
                            <MessageSquare className="mr-2 h-4 w-4" />
                            Copiar Anúncio de Visita
                        </Button>
                    </CollapsibleContent>
                </Collapsible>
            </div>
        </Card>
    );
}
