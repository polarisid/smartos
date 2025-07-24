
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { type Route, type RouteStop, type RoutePart } from "@/lib/data";
import { collection, doc, getDocs, query, setDoc, Timestamp, orderBy, getDoc } from "firebase/firestore";
import { ChevronDown, PackageSearch, Save, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";


function RouteList({ routes, onSaveChanges, onSavePart, isSubmitting, trackingCodes, onTrackingCodeChange, isHistory = false }: {
    routes: Route[],
    onSaveChanges?: (routeId: string) => void,
    onSavePart: (routeId: string, stopServiceOrder: string, part: RoutePart) => Promise<void>,
    isSubmitting: boolean,
    trackingCodes: Record<string, Record<string, Record<string, string>>>,
    onTrackingCodeChange: (routeId: string, stopServiceOrder: string, partCode: string, value: string) => void,
    isHistory?: boolean
}) {
    const [internalFilters, setInternalFilters] = useState<Record<string, string>>({});

    if (routes.length === 0) {
        return (
            <Card>
                <CardContent className="text-center text-muted-foreground py-10">
                    <p>Nenhuma rota encontrada para esta categoria ou filtro.</p>
                </CardContent>
            </Card>
        );
    }
    
    const handleInternalFilterChange = (routeId: string, value: string) => {
        setInternalFilters(prev => ({ ...prev, [routeId]: value }));
    };

    return (
         <div className="space-y-4">
            {routes.map((route) => {
                const internalFilter = internalFilters[route.id] || "";
                const filteredStops = internalFilter ? route.stops.filter(stop => 
                    stop.serviceOrder.toLowerCase().includes(internalFilter.toLowerCase()) ||
                    stop.consumerName.toLowerCase().includes(internalFilter.toLowerCase()) ||
                    stop.model.toLowerCase().includes(internalFilter.toLowerCase()) ||
                    stop.parts.some(part => part.code.toLowerCase().includes(internalFilter.toLowerCase()))
                ) : route.stops;
                
                return (
                    <Card key={route.id}>
                        <CardHeader>
                            <CardTitle>{route.name}</CardTitle>
                            <CardDescription>
                                Rota criada em {route.createdAt.toDate().toLocaleDateString('pt-BR')} com {route.stops.length} paradas.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Collapsible className="space-y-2">
                                <CollapsibleTrigger asChild>
                                    <Button variant="outline" className="w-full">
                                        <PackageSearch className="mr-2 h-4 w-4" />
                                        {isHistory ? "Ver Peças da Rota" : "Ver e Inserir Rastreios das Peças"}
                                        <ChevronDown className="ml-auto h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-4 space-y-4">
                                     <div className="space-y-2">
                                        <Label htmlFor={`internal-filter-${route.id}`}>Pesquisar OS ou Peça na Rota</Label>
                                         <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id={`internal-filter-${route.id}`}
                                                placeholder="Filtrar por OS, cliente, modelo ou peça..."
                                                value={internalFilter}
                                                onChange={(e) => handleInternalFilterChange(route.id, e.target.value)}
                                                className="pl-8"
                                            />
                                        </div>
                                    </div>
                                    {filteredStops.filter(stop => stop.parts.length > 0).map(stop => (
                                        <div key={stop.serviceOrder} className="border p-4 rounded-lg">
                                            <h3 className="font-semibold">OS: {stop.serviceOrder} - {stop.consumerName}</h3>
                                            <p className="text-sm text-muted-foreground">{stop.model}</p>
                                            <Table className="mt-2">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Código da Peça</TableHead>
                                                        <TableHead>Qtd</TableHead>
                                                        <TableHead>Código de Rastreio</TableHead>
                                                        {!isHistory && <TableHead className="w-[100px] text-right">Ação</TableHead>}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {stop.parts.map(part => {
                                                        const trackingCodeValue = trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || "";
                                                        return (
                                                            <TableRow key={part.code}>
                                                                <TableCell className="font-mono">{part.code}</TableCell>
                                                                <TableCell>{part.quantity}</TableCell>
                                                                <TableCell>
                                                                    <Input
                                                                        placeholder={isHistory ? "Sem rastreio" : "Insira o cód. de rastreio"}
                                                                        value={trackingCodeValue}
                                                                        onChange={(e) => onTrackingCodeChange(route.id, stop.serviceOrder, part.code, e.target.value)}
                                                                        disabled={isHistory}
                                                                    />
                                                                </TableCell>
                                                                {!isHistory && (
                                                                    <TableCell className="text-right">
                                                                        <Button 
                                                                            size="sm" 
                                                                            onClick={() => onSavePart(route.id, stop.serviceOrder, { ...part, trackingCode: trackingCodeValue })}
                                                                            disabled={isSubmitting || !trackingCodeValue}
                                                                        >
                                                                            <Save className="h-4 w-4" />
                                                                        </Button>
                                                                    </TableCell>
                                                                )}
                                                            </TableRow>
                                                        )
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    ))}
                                    {!isHistory && onSaveChanges && (
                                        <Button onClick={() => onSaveChanges(route.id)} disabled={isSubmitting}>
                                            <Save className="mr-2 h-4 w-4" />
                                            {isSubmitting ? "Salvando..." : "Salvar Todos os Rastreios da Rota"}
                                        </Button>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );
}

export default function PartSeparationPage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allRoutes, setAllRoutes] = useState<Route[]>([]);
    const [trackingCodes, setTrackingCodes] = useState<Record<string, Record<string, Record<string, string>>>>({}); // { routeId: { stopServiceOrder: { partCode: trackingCode } } }
    const [partCodeFilter, setPartCodeFilter] = useState("");

    const fetchAllRoutes = async () => {
        setIsLoading(true);
        try {
            const q = query(collection(db, "routes"), orderBy("createdAt", "desc"));
            const querySnapshot = await getDocs(q);
            const routesData = querySnapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt as Timestamp,
                    } as Route;
                });

            setAllRoutes(routesData);

            // Initialize tracking codes state from fetched routes data
            const initialTrackingCodes: typeof trackingCodes = {};
            routesData.forEach(route => {
                initialTrackingCodes[route.id] = {};
                route.stops.forEach(stop => {
                    initialTrackingCodes[route.id][stop.serviceOrder] = {};
                    if(stop.parts) {
                        stop.parts.forEach(part => {
                            initialTrackingCodes[route.id][stop.serviceOrder][part.code] = part.trackingCode || "";
                        });
                    }
                });
            });
            setTrackingCodes(initialTrackingCodes);

        } catch (error) {
            console.error("Error fetching routes:", error);
            toast({ variant: "destructive", title: "Erro ao buscar rotas", description: "Não foi possível carregar as rotas." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllRoutes();
    }, [toast]);

    const filteredRoutes = useMemo(() => {
        if (!partCodeFilter) {
            return allRoutes;
        }
        return allRoutes.filter(route =>
            route.stops.some(stop =>
                stop.parts.some(part =>
                    part.code.toLowerCase().includes(partCodeFilter.toLowerCase())
                )
            )
        );
    }, [allRoutes, partCodeFilter]);

    const activeRoutes = useMemo(() => filteredRoutes.filter(r => r.isActive), [filteredRoutes]);
    const completedRoutes = useMemo(() => filteredRoutes.filter(r => !r.isActive), [filteredRoutes]);

    const handleTrackingCodeChange = (routeId: string, stopServiceOrder: string, partCode: string, value: string) => {
        setTrackingCodes(prev => ({
            ...prev,
            [routeId]: {
                ...prev[routeId],
                [stopServiceOrder]: {
                    ...prev[routeId]?.[stopServiceOrder],
                    [partCode]: value,
                },
            },
        }));
    };
    
    const handleSavePartTrackingCode = async (routeId: string, stopServiceOrder: string, partToUpdate: RoutePart) => {
        setIsSubmitting(true);
        try {
            const routeDocRef = doc(db, "routes", routeId);
            const routeDoc = await getDoc(routeDocRef);
            if (!routeDoc.exists()) {
                throw new Error("Rota não encontrada");
            }
            const routeData = routeDoc.data() as Route;
            
            const updatedStops = routeData.stops.map(stop => {
                if (stop.serviceOrder === stopServiceOrder) {
                    return {
                        ...stop,
                        parts: stop.parts.map(part => 
                            part.code === partToUpdate.code 
                                ? { ...part, trackingCode: partToUpdate.trackingCode } 
                                : part
                        ),
                    };
                }
                return stop;
            });

            await setDoc(routeDocRef, { stops: updatedStops }, { merge: true });
            toast({ title: "Código de rastreio salvo!", description: `Rastreio para a peça ${partToUpdate.code} salvo.` });

        } catch (error) {
            console.error("Error saving part tracking code:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o código de rastreio da peça." });
        } finally {
            setIsSubmitting(false);
        }
    };


    const handleSaveChanges = async (routeId: string) => {
        setIsSubmitting(true);
        try {
            const routeToUpdate = allRoutes.find(r => r.id === routeId);
            if (!routeToUpdate) {
                toast({ variant: "destructive", title: "Erro", description: "Rota não encontrada." });
                return;
            }

            const updatedStops = routeToUpdate.stops.map(stop => ({
                ...stop,
                parts: stop.parts.map(part => ({
                    ...part,
                    trackingCode: trackingCodes[routeId]?.[stop.serviceOrder]?.[part.code] || "",
                })),
            }));
            
            await setDoc(doc(db, "routes", routeId), { stops: updatedStops }, { merge: true });

            toast({ title: "Códigos de rastreio salvos!", description: `As informações para a rota ${routeToUpdate.name} foram atualizadas.` });
            await fetchAllRoutes(); // Refresh data from db
        } catch (error) {
            console.error("Error saving tracking codes:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os códigos de rastreio." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Separação de Peças</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="max-w-sm space-y-2">
                        <Label htmlFor="part-code-filter">Pesquisar por Código de Peça</Label>
                        <div className="relative">
                             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input 
                                id="part-code-filter"
                                placeholder="Ex: BN96-12345A"
                                value={partCodeFilter}
                                onChange={(e) => setPartCodeFilter(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {isLoading ? (
                <p className="text-center text-muted-foreground py-10">Carregando rotas...</p>
            ) : (
                <Tabs defaultValue="active">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="active">Separação Ativa</TabsTrigger>
                        <TabsTrigger value="history">Histórico de Rotas</TabsTrigger>
                    </TabsList>
                    <TabsContent value="active" className="mt-6">
                        <RouteList
                            routes={activeRoutes}
                            onSaveChanges={handleSaveChanges}
                            onSavePart={handleSavePartTrackingCode}
                            isSubmitting={isSubmitting}
                            trackingCodes={trackingCodes}
                            onTrackingCodeChange={handleTrackingCodeChange}
                        />
                    </TabsContent>
                    <TabsContent value="history" className="mt-6">
                         <RouteList
                            routes={completedRoutes}
                            onSavePart={handleSavePartTrackingCode}
                            isSubmitting={isSubmitting}
                            trackingCodes={trackingCodes}
                            onTrackingCodeChange={handleTrackingCodeChange}
                            isHistory={true}
                        />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
 