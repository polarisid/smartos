import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Truck, Calendar as CalendarIcon, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type AggregatedOrder = {
    serviceOrder: string;
    city: string;
    routeName: string;
    status: 'completed' | 'pending' | 'todo';
};

export type AggregatedRouteData = {
    dateStr: string;
    total: number;
    completed: number;
    routesArray: string[];
    orders?: AggregatedOrder[];
};

export function RouteAnalysis({ data }: { data: AggregatedRouteData[] }) {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const toggle = (key: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    return (
        <>
            <div className="mb-6 flex items-center gap-2">
                <CalendarIcon className="text-[#17E9B0] h-5 w-5" />
                <h2 className="text-xl font-semibold text-slate-200">Visão por Agendamento</h2>
                <span className="text-xs text-slate-500 ml-1">— clique num dia para ver as ordens</span>
            </div>

            {data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-60 border-2 border-dashed border-slate-800 rounded-2xl p-10">
                    <Search className="h-16 w-16 mb-4 text-slate-500" />
                    <h3 className="text-2xl font-bold">Sem Roteiros Ativos</h3>
                    <p className="text-slate-400 mt-2">Os agendamentos agrupados aparecerão aqui assim que as rotas forem carregadas.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {data.map((group, idx) => {
                        const progress = group.total > 0 ? (group.completed / group.total) * 100 : 0;
                        const is100 = progress === 100 && group.total > 0;
                        const key = `${group.dateStr}-${idx}`;
                        const isOpen = expanded.has(key);
                        const orders = group.orders || [];

                        return (
                            <Card
                                key={key}
                                className="border border-white/10 bg-white/[0.03] backdrop-blur-md shadow-lg overflow-hidden transition-all duration-300 hover:border-white/20"
                            >
                                <div className={`h-1 w-full ${is100 ? 'bg-[#17E9B0]' : 'bg-gradient-to-r from-[#17E9B0] to-[#12b98a] opacity-75'}`}></div>

                                <button
                                    type="button"
                                    onClick={() => toggle(key)}
                                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17E9B0]/50"
                                    aria-expanded={isOpen}
                                >
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                                                    {group.dateStr}
                                                    <ChevronDown className={cn("h-5 w-5 text-slate-500 transition-transform", isOpen && "rotate-180")} />
                                                </h3>
                                                <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                                                    Rotas atuando:
                                                    <span className="font-mono text-xs bg-white/5 px-2 py-0.5 rounded text-slate-300">
                                                        {group.routesArray.length} conectadas
                                                    </span>
                                                </p>
                                            </div>
                                            {is100 && (
                                                <Badge variant="outline" className="bg-[#17E9B0]/10 text-[#17E9B0] border-[#17E9B0]/20 px-3 py-1 text-xs">
                                                    <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Completo
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Andamento</span>
                                                <div className="text-right">
                                                    <span className="font-mono text-3xl font-bold text-white tabular-nums">{group.completed}</span>
                                                    <span className="font-mono text-xl font-bold text-slate-600 tabular-nums"> / {group.total}</span>
                                                </div>
                                            </div>
                                            <Progress value={progress} className={`h-4 bg-white/5 border border-white/10 ${is100 ? '[&>div]:bg-[#17E9B0]' : '[&>div]:bg-gradient-to-r [&>div]:from-[#17E9B0] [&>div]:to-[#12b98a]'}`} />
                                            <p className="text-right text-xs font-bold text-slate-400">{Math.round(progress)}% Concluído</p>
                                        </div>
                                    </CardContent>
                                </button>

                                {isOpen && (
                                    <div className="px-6 pb-5 -mt-2">
                                        {orders.length === 0 ? (
                                            <p className="text-xs text-slate-500 py-2">Sem ordens neste dia.</p>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap gap-3 text-[10px] text-slate-500 mb-2">
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#17E9B0]" /> Concluída</span>
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pendência</span>
                                                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/20" /> A fazer</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
                                                    {orders.map((o, i) => (
                                                        <div
                                                            key={`${o.serviceOrder}-${i}`}
                                                            className={cn(
                                                                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                                                                o.status === 'completed' && "border-[#17E9B0]/30 bg-[#17E9B0]/10",
                                                                o.status === 'pending' && "border-amber-500/30 bg-amber-500/10",
                                                                o.status === 'todo' && "border-white/10 bg-white/[0.02]"
                                                            )}
                                                        >
                                                            {o.status === 'completed'
                                                                ? <CheckCircle2 className="h-3.5 w-3.5 text-[#17E9B0] shrink-0" />
                                                                : <span className={cn("h-2 w-2 rounded-full shrink-0", o.status === 'pending' ? "bg-amber-400" : "bg-white/20")} />}
                                                            <span className={cn(
                                                                "font-mono font-semibold shrink-0",
                                                                o.status === 'completed' ? "text-[#17E9B0]" : o.status === 'pending' ? "text-amber-300" : "text-slate-300"
                                                            )}>
                                                                {o.serviceOrder}
                                                            </span>
                                                            {o.city && <span className="text-slate-500 truncate">· {o.city}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="bg-black/20 px-6 py-3 border-t border-white/10 flex flex-wrap gap-2 text-xs">
                                    <span className="text-slate-500 mr-2 flex items-center"><Truck className="h-3 w-3 mr-1" /> Equipes:</span>
                                    {group.routesArray.map(rname => (
                                        <span key={rname} className="px-2 py-1 rounded bg-white/5 text-slate-300 border border-white/10 truncate max-w-[150px] inline-block">{rname}</span>
                                    ))}
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}
        </>
    );
}
