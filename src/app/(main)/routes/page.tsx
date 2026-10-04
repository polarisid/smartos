"use client";

import { useState, useEffect, useMemo } from "react";
import { format, differenceInDays, isAfter } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveRoutes, useServiceOrders, useVisitTemplate } from "@/hooks/queries";
import { useAuth } from "@/context/AuthContext";
import { AlertCircle, PackageSearch } from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { MobileRouteStopCard } from "@/components/MobileRouteStopCard";
import { RouteDetailsRow } from "@/components/RouteDetailsRow";
import { RoutePartTracking } from "@/components/RoutePartTracking";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

import { Map as RouteIcon, Calendar, Sun, MapPin, Car, Eye, Filter, CheckCircle2, Clock, LayoutList, Pin, PinOff, History } from "lucide-react";
import type { Route, RouteStop } from "@/lib/data";

const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });
export default function RoutesPage() {
    const { data: activeRoutes = [], isError: errRoutes, isLoading: loadingRoutes } = useActiveRoutes();
    const { data: serviceOrders = [], isError: errSo, isLoading: loadingSo } = useServiceOrders(2000);
    const { data: visitTemplate = "", isError: errTemplate, isLoading: loadingTemplate } = useVisitTemplate();

    const dataFetchError = errRoutes || errSo || errTemplate;
    const isLoading = loadingRoutes || loadingSo || loadingTemplate;

    const { toast } = useToast();
    const { appUser } = useAuth();
    const queryClient = useQueryClient();

    const [blockedOrders, setBlockedOrders] = useState<Record<string, string>>({});
    const [isBlocksLoaded, setIsBlocksLoaded] = useState(false);
    const [pinnedRouteId, setPinnedRouteId] = useState<string | null>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem("blocked_route_orders");
            if (saved) setBlockedOrders(JSON.parse(saved));
            const savedPinned = localStorage.getItem("pinned_route_id");
            if (savedPinned) setPinnedRouteId(savedPinned);
        } catch (e) { console.error("Failed to load local data", e); }
        setIsBlocksLoaded(true);
    }, []);

    useEffect(() => {
        if (!isBlocksLoaded) return;
        localStorage.setItem("blocked_route_orders", JSON.stringify(blockedOrders));
        if (pinnedRouteId) {
            localStorage.setItem("pinned_route_id", pinnedRouteId);
        } else {
            localStorage.removeItem("pinned_route_id");
        }
    }, [blockedOrders, pinnedRouteId, isBlocksLoaded]);

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

    // Cor da parada no mapa: sem OS lançada depois da criação da rota = a fazer;
    // última OS finalizada = concluída; última com pendência = pendente.
    const stopMapStatus = (stop: RouteStop, routeCreatedAt: Date): "completed" | "pending" | "todo" => {
        const related = serviceOrders.filter(os => os.serviceOrderNumber === stop.serviceOrder && os.date.getTime() >= routeCreatedAt.getTime());
        if (related.length === 0) return "todo";
        const last = related.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a));
        return last.isFinalized === false ? "pending" : "completed";
    };

    // "Concluída" nos contadores/progresso da rota = a parada já foi atendida
    // (existe OS lançada depois da criação da rota, finalizada ou com pendência) -
    // mesmo critério do painel admin. Só finalizada deixava de fora as paradas
    // visitadas com pendência e o progresso no celular ficava menor que no admin.
    const isStopAttended = (stop: RouteStop, routeCreatedAt: Date) =>
        serviceOrders.some(os => os.serviceOrderNumber === stop.serviceOrder && os.date.getTime() >= routeCreatedAt.getTime());

    const displayedRoutes = useMemo(() => {
        const routes = [...activeRoutes];
        if (pinnedRouteId) {
            routes.sort((a, b) => {
                if (a.id === pinnedRouteId) return -1;
                if (b.id === pinnedRouteId) return 1;
                return 0;
            });
        }
        return routes;
    }, [activeRoutes, pinnedRouteId]);

    if (dataFetchError) {
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Erro de Conexão</h2>
            <p className="text-slate-500 max-w-md">Não foi possível conectar ao banco de dados. Verifique sua conexão com a internet ou tente novamente mais tarde.</p>
          </div>
        );
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
                const departure = route.departureDate ? route.departureDate : new Date();
                const arrival = route.arrivalDate ? route.arrivalDate : new Date();
                const duration = differenceInDays(arrival, departure) + 1;

                const totalStops = route.stops.length;
                const routeCreated = route.createdAt as Date;
                const completedStopsCount = route.stops.filter(stop => isStopAttended(stop, routeCreated)).length;
                const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;

                const filteredStops = route.stops || [];
                const filteredCount = filteredStops.length;
                const pendingCount = totalStops - completedStopsCount;
                const doneCount = completedStopsCount;

                // Rastreio de peças só é liberado na própria rota do técnico - as demais
                // rotas da equipe aparecem aqui (unidade toda), mas o técnico não deve
                // mexer no rastreio de peças que não são dele.
                const isOwnRoute = !!appUser?.uid && route.technicianId === appUser.uid;
                const partsInRoute = route.stops.flatMap(s => s.parts || []);
                const hasPartsToTrack = partsInRoute.length > 0;
                // Mesmo critério do card verde na Conferência de Peças (admin): só "tudo
                // rastreado" quando toda peça da rota já tem código preenchido.
                const areAllPartsTracked = hasPartsToTrack && partsInRoute.every(p => (p.trackingCode || "").trim() !== "");

                return (
                    <Card key={route.id} className="shadow-sm">
                        <CardHeader className="bg-muted/30">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-primary">
                                        <RouteIcon className="w-5 h-5" /> Rota: {route.name}
                                        {pinnedRouteId === route.id && <Pin className="w-4 h-4 text-primary fill-primary/20" />}
                                    </CardTitle>
                                    <CardDescription>
                                        Técnico responsável: <span className="font-medium text-foreground">{route.technicianName}</span>
                                    </CardDescription>
                                </div>
                                <div className="flex gap-2 flex-wrap items-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-6 px-2 text-xs ${pinnedRouteId === route.id ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'text-muted-foreground'}`}
                                        onClick={() => setPinnedRouteId(pinnedRouteId === route.id ? null : route.id)}
                                    >
                                        {pinnedRouteId === route.id ? (
                                            <><PinOff className="h-3 w-3 mr-1" /> Desfixar</>
                                        ) : (
                                            <><Pin className="h-3 w-3 mr-1" /> Fixar</>
                                        )}
                                    </Button>
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
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-violet-100 border border-violet-300 flex items-center justify-center"><History className="w-2 h-2 text-violet-600" /></div><span>Já Visitada</span></div>
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
                                                                <TableHead className="w-[130px]"></TableHead>
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

                            {filteredStops.length > 0 && (
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full md:w-auto mt-2 md:ml-2">
                                            <MapPin className="mr-2 h-4 w-4" />
                                            Ver Mapa
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-6xl w-[95vw] md:w-full p-2 md:p-6 bg-muted md:bg-background">
                                        <DialogHeader>
                                            <DialogTitle>Mapa da Rota: {route.name}</DialogTitle>
                                            <DialogDescription>
                                                Paradas numeradas na ordem da rota. Toque num ponto para ver a OS.
                                            </DialogDescription>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span>Concluída</span></div>
                                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span>Pendência</span></div>
                                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div><span>A fazer</span></div>
                                            </div>
                                        </DialogHeader>
                                        <div className="h-[65vh] rounded-lg overflow-hidden">
                                            <RouteMap
                                                routes={[route]}
                                                activeStops={filteredStops.map(stop => ({ stop, route, status: stopMapStatus(stop, routeCreated) }))}
                                                showPolyline
                                                height="100%"
                                            />
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}

                            {isOwnRoute && hasPartsToTrack && (
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className={cn(
                                                "w-full md:w-auto mt-2 md:ml-2",
                                                areAllPartsTracked && "bg-green-100 border-green-300 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/70"
                                            )}
                                        >
                                            {areAllPartsTracked ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <PackageSearch className="mr-2 h-4 w-4" />}
                                            Rastreios de Peças
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl w-[95vw] md:w-full p-2 md:p-6 bg-muted md:bg-background">
                                        <DialogHeader>
                                            <DialogTitle>Rastreios de Peças: {route.name}</DialogTitle>
                                            <DialogDescription>
                                                Insira ou leia o código de rastreio de cada peça desta rota.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="max-h-[70vh] overflow-y-auto">
                                            <RoutePartTracking
                                                route={route}
                                                onSaved={() => queryClient.invalidateQueries({ queryKey: ['routes'] })}
                                            />
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
