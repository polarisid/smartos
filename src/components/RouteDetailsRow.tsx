"use client";

import React from "react";
import { Timestamp } from "firebase/firestore";
import { isAfter } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TableRow, TableCell } from "@/components/ui/table";
import { CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceOrder, RouteStop } from "@/lib/data";

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
    routeCreatedAt: Date | Timestamp,
    visitTemplate: string
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

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getRowClass = () => {
        if (isPending) return "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100";
        if (isCompleted) return "bg-green-100 dark:bg-green-900/50 line-through text-slate-500 opacity-60";
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
                    <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
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
                            <div>
                                <p className="font-semibold text-xs mb-1">Status Comment:</p>
                                <p className="text-sm text-foreground">{stop.statusComment || "N/A"}</p>
                            </div>
                            <div className="border-t pt-2">
                                    <Button size="sm" variant="outline" onClick={handleCopyVisitText}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Copiar Anúncio de Visita
                                </Button>
                            </div>
                        </div>
                    </TableCell>
                </tr>
            </CollapsibleContent>
        </React.Fragment>
    )
}
