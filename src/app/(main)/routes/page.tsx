"use client";

import { useState, useEffect, useMemo } from "react";
import { Timestamp } from "firebase/firestore";
import { format, differenceInDays, isAfter } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAppData } from "@/context/AppDataContext";
import { FirebaseSetupPrompt } from "@/components/FirebaseSetupPrompt";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { MobileRouteStopCard } from "@/components/MobileRouteStopCard";
import { RouteDetailsRow } from "@/components/RouteDetailsRow";

import { Map as RouteIcon, Calendar, Sun, MapPin, Car, Eye, Filter, CheckCircle2, Clock, LayoutList } from "lucide-react";
import type { Route, RouteStop } from "@/lib/data";
export default function RoutesPage() {
    const { activeRoutes, serviceOrders, visitTemplate, dataFetchError, isLoading } = useAppData();
    const { toast } = useToast();

    const [blockedOrders, setBlockedOrders] = useState<Record<string, string>>({});
    const [isBlocksLoaded, setIsBlocksLoaded] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("blocked_route_orders");
            if (saved) setBlockedOrders(JSON.parse(saved));
        } catch (e) { console.error("Failed to load blocked orders", e); }
        setIsBlocksLoaded(true);
    }, []);

    useEffect(() => {
        if (!isBlocksLoaded) return;
        localStorage.setItem("blocked_route_orders", JSON.stringify(blockedOrders));
    }, [blockedOrders, isBlocksLoaded]);

    const handleBlock = (serviceOrder: string, reason: string) => {
        setBlockedOrders(prev => ({ ...prev, [serviceOrder]: reason }));
        toast({ title: "Ordem bloqueada", description: `A OS ${serviceOrder} foi marcada como impossível.` });
    };

    const handleUnblock = (serviceOrder: string) => {
        setBlockedOrders(prev => {
            const next = { ...prev };
            delete next[serviceOrder];
            return next;
        });
        toast({ title: "Ordem desbloqueada", description: `A OS ${serviceOrder} foi removida da lista de bloqueios.` });
    };

    const isStopCompleted = (stop: RouteStop, routeCreatedAt: Date | Timestamp) => {
        const createdAt = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
        const relatedOs = serviceOrders.filter(os =>
            os.serviceOrderNumber === stop.serviceOrder &&
            isAfter(os.date, createdAt)
        );
        const lastOs = relatedOs.length > 0 ? relatedOs[relatedOs.length - 1] : null;
        return lastOs ? lastOs.isFinalized !== false : false;
    };

    const isStopPending = (stop: RouteStop, routeCreatedAt: Date | Timestamp) => {
        const createdAt = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
        const relatedOs = serviceOrders.filter(os =>
            os.serviceOrderNumber === stop.serviceOrder &&
            isAfter(os.date, createdAt)
        );
        const lastOs = relatedOs.length > 0 ? relatedOs[relatedOs.length - 1] : null;
        return lastOs ? lastOs.isFinalized === false : false;
    };
    const displayedRoutes = activeRoutes;

    if (dataFetchError) {
        return <FirebaseSetupPrompt />;
    }

    if (isLoading) {
        return (
            <div className="w-full animate-in fade-in ease-out duration-300">
                <h2 className="text-2xl font-bold tracking-tight mb-6">Rotas Ativas</h2>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><RouteIcon /> Buscando Rotas...</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center py-10 text-muted-foreground">
                        <p>Aguarde enquanto as rotas são carregadas.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (activeRoutes.length === 0) {
        return (
            <div className="w-full animate-in fade-in ease-out duration-300">
                <h2 className="text-2xl font-bold tracking-tight mb-6">Rotas Ativas</h2>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><RouteIcon /> Nenhuma Rota</CardTitle>
                        <CardDescription>Não há rotas ativas para a equipe no momento.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="w-full animate-in fade-in ease-out duration-300 space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">Rotas Ativas da Equipe</h2>

            {displayedRoutes.map(route => {
                const departure = route.departureDate ? (route.departureDate instanceof Timestamp ? route.departureDate.toDate() : route.departureDate) : new Date();
                const arrival = route.arrivalDate ? (route.arrivalDate instanceof Timestamp ? route.arrivalDate.toDate() : route.arrivalDate) : new Date();
                const duration = differenceInDays(arrival, departure) + 1;

                const totalStops = route.stops.length;
                const completedStopsCount = route.stops.filter(stop =>
                    serviceOrders.some(os =>
                        os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt as Date)
                    )
                ).length;
                const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;

                const filteredStops = route.stops || [];
                const filteredCount = filteredStops.length;
                const pendingCount = route.stops.filter(s => !isStopCompleted(s, route.createdAt as Date | Timestamp)).length;
                const doneCount = completedStopsCount;

                return (
                    <Card key={route.id} className="shadow-sm">
                        <CardHeader className="bg-muted/30">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-primary"><RouteIcon className="w-5 h-5" /> Rota: {route.name}</CardTitle>
                                    <CardDescription>
                                        Técnico responsável: <span className="font-medium text-foreground">{route.technicianName}</span>
                                    </CardDescription>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    <Badge variant="outline" className="gap-1 text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-900/20">
                                        <Clock className="h-3 w-3" /> {pendingCount} pendentes
                                    </Badge>
                                    <Badge variant="outline" className="gap-1 text-green-600 border-green-300 bg-green-50 dark:bg-green-900/20">
                                        <CheckCircle2 className="h-3 w-3" /> {doneCount} concluídas
                                    </Badge>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4 md:p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm border-t border-b py-4">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Saída</p>
                                        <p className="font-semibold">{format(departure, 'dd/MM/yyyy')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Chegada</p>
                                        <p className="font-semibold">{format(arrival, 'dd/MM/yyyy')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Sun className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Duração</p>
                                        <p className="font-semibold">{duration} dia{duration !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Tipo</p>
                                        <p className="font-semibold capitalize">{route.routeType}</p>
                                    </div>
                                </div>
                                {route.licensePlate && (
                                    <div className="flex items-center gap-2">
                                        <Car className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Placa</p>
                                            <p className="font-semibold uppercase">{route.licensePlate}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Progress value={progress} className="h-2" />
                                <p className="text-xs text-muted-foreground text-right">{completedStopsCount} de {totalStops} paradas concluídas</p>
                            </div>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="w-full md:w-auto mt-2">
                                        <Eye className="mr-2 h-4 w-4" />
                                        Ver Detalhes da Rota
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-6xl w-[95vw] md:w-full p-2 md:p-6 bg-muted md:bg-background">
                                    <DialogHeader>
                                        <DialogTitle>Detalhes da Rota: {route.name}</DialogTitle>
                                        <DialogDescription>
                                            Use a legenda de cores para identificar os tipos de parada.
                                        </DialogDescription>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-2">
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></div><span>Coleta</span></div>
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300"></div><span>Entrega</span></div>
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-100 border border-green-300"></div><span>Finalizada</span></div>
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></div><span>Pendência</span></div>
                                        </div>
                                    </DialogHeader>
                                    <div className="max-h-[70vh] overflow-y-auto">
                                        {filteredStops.length === 0 ? (
                                            <div className="py-12 text-center text-muted-foreground">
                                                <p className="font-medium">Nenhuma OS encontrada</p>
                                                <p className="text-sm mt-1">Nenhuma ordem de serviço planejada para esta rota.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="md:hidden space-y-4 py-2">
                                                    {filteredStops.map((stop, index) => (
                                                        <MobileRouteStopCard
                                                            key={index}
                                                            stop={stop}
                                                            index={index}
                                                            serviceOrders={serviceOrders}
                                                            routeCreatedAt={(route.createdAt as Date)}
                                                            visitTemplate={visitTemplate}
                                                            blockedOrders={blockedOrders}
                                                            onBlock={handleBlock}
                                                            onUnblock={handleUnblock}
                                                        />
                                                    ))}
                                                </div>
                                                <div className="hidden md:block overflow-x-auto border rounded-md bg-card">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/50">
                                                                <TableHead>OS</TableHead>
                                                                <TableHead>Tipo</TableHead>
                                                                <TableHead>Cidade</TableHead>
                                                                <TableHead>Bairro</TableHead>
                                                                <TableHead>Modelo</TableHead>
                                                                <TableHead>Peças</TableHead>
                                                                <TableHead className="w-[50px]"></TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {filteredStops.map((stop, index) => (
                                                                <Collapsible asChild key={index}>
                                                                    <RouteDetailsRow
                                                                        stop={stop}
                                                                        index={index}
                                                                        serviceOrders={serviceOrders}
                                                                        routeCreatedAt={(route.createdAt as Date)}
                                                                        visitTemplate={visitTemplate}
                                                                    />
                                                                </Collapsible>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
