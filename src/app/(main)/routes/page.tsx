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

type StatusFilter = "all" | "pending" | "completed";

export default function RoutesPage() {
    const { activeRoutes, serviceOrders, visitTemplate, dataFetchError, isLoading } = useAppData();
    const { toast } = useToast();

    const [blockedOrders, setBlockedOrders] = useState<Record<string, string>>({});
    const [isBlocksLoaded, setIsBlocksLoaded] = useState(false);
    const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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

    // Initialize all routes as selected when routes load
    useEffect(() => {
        if (activeRoutes.length > 0) {
            setSelectedRouteIds(new Set(activeRoutes.map(r => r.id)));
        }
    }, [activeRoutes]);

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

    const toggleRouteSelection = (routeId: string) => {
        setSelectedRouteIds(prev => {
            const next = new Set(prev);
            if (next.has(routeId)) {
                next.delete(routeId);
            } else {
                next.add(routeId);
            }
            return next;
        });
    };

    const selectAllRoutes = () => {
        setSelectedRouteIds(new Set(activeRoutes.map(r => r.id)));
    };

    const clearRouteSelection = () => {
        setSelectedRouteIds(new Set());
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

    const filterStops = (stops: RouteStop[], routeCreatedAt: Date | Timestamp) => {
        if (statusFilter === "all") return stops;
        if (statusFilter === "completed") return stops.filter(s => isStopCompleted(s, routeCreatedAt));
        if (statusFilter === "pending") return stops.filter(s => !isStopCompleted(s, routeCreatedAt));
        return stops;
    };

    const displayedRoutes = useMemo(() =>
        activeRoutes.filter(r => selectedRouteIds.has(r.id)),
        [activeRoutes, selectedRouteIds]
    );

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

            {/* Filter Panel */}
            <Card className="border-border/60">
                <CardContent className="p-4 space-y-4">
                    {/* Route selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                                <LayoutList className="h-4 w-4" />
                                Rotas Exibidas
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={selectAllRoutes}
                                    disabled={selectedRouteIds.size === activeRoutes.length}
                                >
                                    Selecionar todas
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-muted-foreground"
                                    onClick={clearRouteSelection}
                                    disabled={selectedRouteIds.size === 0}
                                >
                                    Limpar
                                </Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {activeRoutes.map(route => {
                                const isSelected = selectedRouteIds.has(route.id);
                                return (
                                    <button
                                        key={route.id}
                                        onClick={() => toggleRouteSelection(route.id)}
                                        className={`
                                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150
                                            ${isSelected
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                                            }
                                        `}
                                    >
                                        <RouteIcon className="h-3.5 w-3.5" />
                                        {route.name}
                                        {route.technicianName && (
                                            <span className={`text-xs opacity-70 hidden sm:inline`}>
                                                · {route.technicianName}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Status filter */}
                    <div className="space-y-2">
                        <p className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                            <Filter className="h-4 w-4" />
                            Filtrar OS por Status
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {(["all", "pending", "completed"] as StatusFilter[]).map(filter => {
                                const labels: Record<StatusFilter, { label: string; icon: React.ReactNode }> = {
                                    all: { label: "Todas", icon: <LayoutList className="h-3.5 w-3.5" /> },
                                    pending: { label: "A Fazer / Pendentes", icon: <Clock className="h-3.5 w-3.5" /> },
                                    completed: { label: "Concluídas", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
                                };
                                const isActive = statusFilter === filter;
                                const colorMap: Record<StatusFilter, string> = {
                                    all: isActive ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
                                    pending: isActive ? "bg-orange-500 text-white border-orange-500 shadow-sm" : "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800",
                                    completed: isActive ? "bg-green-600 text-white border-green-600 shadow-sm" : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
                                };
                                return (
                                    <button
                                        key={filter}
                                        onClick={() => setStatusFilter(filter)}
                                        className={`
                                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150
                                            ${colorMap[filter]}
                                        `}
                                    >
                                        {labels[filter].icon}
                                        {labels[filter].label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Empty state when no routes are selected */}
            {displayedRoutes.length === 0 && (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <LayoutList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Nenhuma rota selecionada</p>
                        <p className="text-sm mt-1">Selecione uma ou mais rotas acima para visualizá-las.</p>
                    </CardContent>
                </Card>
            )}

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

                const filteredStops = filterStops(route.stops, route.createdAt as Date | Timestamp);
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
                                        {statusFilter !== "all" && (
                                            <Badge className="ml-2 h-5 px-1.5 text-[10px]" variant="secondary">
                                                {filteredCount}
                                            </Badge>
                                        )}
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-6xl w-[95vw] md:w-full p-2 md:p-6 bg-muted md:bg-background">
                                    <DialogHeader>
                                        <DialogTitle>Detalhes da Rota: {route.name}</DialogTitle>
                                        <DialogDescription>
                                            {statusFilter === "all"
                                                ? "Use a legenda de cores para identificar os tipos de parada."
                                                : statusFilter === "pending"
                                                    ? `Exibindo ${filteredCount} OS a fazer / pendentes.`
                                                    : `Exibindo ${filteredCount} OS concluídas.`
                                            }
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
                                                <p className="text-sm mt-1">Não há OS com o filtro selecionado para esta rota.</p>
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
