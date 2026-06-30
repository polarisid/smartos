import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Truck, Calendar as CalendarIcon, Search } from "lucide-react";

export type AggregatedRouteData = {
    dateStr: string;
    total: number;
    completed: number;
    routesArray: string[];
};

export function RouteAnalysis({ data }: { data: AggregatedRouteData[] }) {
    return (
        <>
            <div className="mb-6 flex items-center gap-2">
                <CalendarIcon className="text-blue-500 h-5 w-5" />
                <h2 className="text-xl font-semibold text-slate-200">Visão por Agendamento</h2>
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

                        return (
                            <Card 
                                key={idx} 
                                className={`border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-lg overflow-hidden transition-all duration-300 hover:border-slate-700 hover:bg-slate-900/60`}
                            >
                                <div className={`h-1 w-full ${is100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400 opacity-75'}`}></div>
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-2xl font-bold text-slate-100">{group.dateStr}</h3>
                                            <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                                                Rotas atuando: 
                                                <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                                                    {group.routesArray.length} conectadas
                                                </span>
                                            </p>
                                        </div>
                                        {is100 && (
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 text-xs">
                                                <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Completo
                                            </Badge>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Andamento</span>
                                            <div className="text-right">
                                                <span className="text-3xl font-black text-white">{group.completed}</span>
                                                <span className="text-xl font-bold text-slate-600"> / {group.total}</span>
                                            </div>
                                        </div>
                                        <Progress value={progress} className={`h-4 bg-slate-950 border border-slate-800 ${is100 ? '[&>div]:bg-emerald-500' : '[&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-cyan-400'}`} />
                                        <p className="text-right text-xs font-bold text-slate-400">{Math.round(progress)}% Concluído</p>
                                    </div>
                                </CardContent>
                                
                                <div className="bg-slate-950/50 px-6 py-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs">
                                    <span className="text-slate-500 mr-2 flex items-center"><Truck className="h-3 w-3 mr-1" /> Equipes:</span>
                                    {group.routesArray.map(rname => (
                                        <span key={rname} className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 truncate max-w-[150px] inline-block">{rname}</span>
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
