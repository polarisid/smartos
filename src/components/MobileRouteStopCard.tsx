"use client";

import { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { isAfter } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, MessageSquare, XCircle, Calendar, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceOrder, RouteStop } from "@/lib/data";

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
    routeCreatedAt: Date | Timestamp,
    visitTemplate: string,
    blockedOrders: Record<string, string>,
    onBlock: (serviceOrder: string, reason: string) => void,
    onUnblock: (serviceOrder: string) => void,
}) {
    const { toast } = useToast();
    const createdAtAsDate = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
    const relatedOsList = serviceOrders.filter(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, createdAtAsDate)
    );
    const relatedOs = relatedOsList.length > 0 ? relatedOsList[relatedOsList.length - 1] : null;

    const isPending = relatedOs && (relatedOs.isFinalized === false);
    const isCompleted = relatedOs && (relatedOs.isFinalized !== false);
    const isBlocked = !!blockedOrders[stop.serviceOrder];
    const blockReason = blockedOrders[stop.serviceOrder] || "";
    const [pendingReason, setPendingReason] = useState(blockReason);

    const hasLocation = !!stop.addressDetails;
    const addressQuery = hasLocation ? encodeURIComponent(`${stop.addressDetails}, ${stop.neighborhood}, ${stop.city}`) : "";

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getCardClass = () => {
        if (isBlocked || isPending) return "border-red-400 bg-red-50 dark:bg-red-900/20";
        if (isCompleted) return "border-green-300 bg-green-50 dark:bg-green-900/20";
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
                        </div>
                        <p className={cn("font-mono font-black text-lg tracking-tight text-foreground leading-none", isCompleted && "line-through opacity-60")}>{stop.serviceOrder}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end gap-1">
                            {isCompleted && <div className="text-[10px] bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold uppercase">Concluída</div>}
                            {isPending && <div className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold uppercase">Pendência</div>}
                            {isBlocked && <div className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1"><XCircle className="h-3 w-3"/>Bloqueada</div>}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className={cn("h-8 w-8 shrink-0", hasLocation ? "text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100" : "text-muted-foreground opacity-50 cursor-not-allowed border-border")}
                            onClick={() => hasLocation && window.open(`https://www.google.com/maps/search/?api=1&query=${addressQuery}`, '_blank')}
                            disabled={!hasLocation}
                            title={hasLocation ? "Abrir endereço no Google Maps" : "Localização não salva"}
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
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="font-bold text-[10px] uppercase text-muted-foreground mb-0.5">Consumidor:</p>
                                <p className="text-xs font-medium line-clamp-1">{stop.consumerName || "N/A"}</p>
                            </div>
                            <div>
                                <p className="font-bold text-[10px] uppercase text-muted-foreground mb-0.5">Status Comment:</p>
                                <p className="text-[11px] font-medium leading-tight line-clamp-2">{stop.statusComment || "N/A"}</p>
                            </div>
                        </div>
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
