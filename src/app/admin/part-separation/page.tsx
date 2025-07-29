
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
import { ChevronDown, PackageSearch, Save, Search, FileDown, CheckCircle, ScanLine } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);


function RouteList({ routes, onSaveChanges, onSavePart, isSubmitting, trackingCodes, onTrackingCodeChange, onGeneratePdf, onOpenScanner, isHistory = false }: {
    routes: Route[],
    onSaveChanges?: (routeId: string) => void,
    onSavePart: (routeId: string, stopServiceOrder: string, part: RoutePart) => Promise<void>,
    isSubmitting: boolean,
    trackingCodes: Record<string, Record<string, Record<string, string>>>,
    onTrackingCodeChange: (routeId: string, stopServiceOrder: string, partCode: string, value: string) => void,
    onGeneratePdf: (route: Route) => void,
    onOpenScanner: (target: { routeId: string, stopServiceOrder: string, partCode: string }) => void,
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
                
                const allPartsInRoute = route.stops.flatMap(stop => 
                    stop.parts.map(part => ({ ...part, serviceOrder: stop.serviceOrder }))
                );

                const areAllPartsTracked = allPartsInRoute.length > 0 && allPartsInRoute.every(part => {
                    const code = trackingCodes[route.id]?.[part.serviceOrder]?.[part.code] || "";
                    return code.trim() !== "";
                });

                return (
                    <Card key={route.id} className={cn(areAllPartsTracked && "bg-green-100 dark:bg-green-900/50")}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {areAllPartsTracked && <CheckCircle className="h-6 w-6 text-green-600" />}
                                {route.name}
                            </CardTitle>
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
                                    {filteredStops.filter(stop => stop.parts.length > 0).map(stop => {
                                        const areAllPartsInStopTracked = stop.parts.length > 0 && stop.parts.every(part => {
                                            const code = trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || "";
                                            return code.trim() !== "";
                                        });

                                        return (
                                        <div key={stop.serviceOrder} className={cn(
                                            "border p-3 rounded-lg",
                                            areAllPartsInStopTracked && "bg-green-100/50 dark:bg-green-900/30"
                                        )}>
                                            <div className="flex flex-wrap items-baseline gap-x-4">
                                                <h3 className="font-semibold text-lg">{stop.serviceOrder}</h3>
                                                <p className="text-sm text-muted-foreground">{stop.model}</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-4">{stop.consumerName}</p>
                                            
                                            <div className="space-y-3">
                                                {stop.parts.map(part => {
                                                    const trackingCodeValue = trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || "";
                                                    return (
                                                        <div key={part.code} className="border-t pt-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-end sm:gap-4 space-y-2 sm:space-y-0">
                                                                <div className="flex-1 space-y-1">
                                                                     <div className="flex items-baseline gap-4">
                                                                        <div className="flex-1">
                                                                            <Label className="text-xs sm:hidden">Peça:</Label>
                                                                            <p className="font-mono">{part.code}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <Label className="text-xs sm:hidden">Qtd:</Label>
                                                                            <p className="font-semibold">x{part.quantity}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1 flex items-end gap-2">
                                                                    <div className="flex-1 space-y-1">
                                                                        <Label className="text-xs sm:hidden">Rastreio:</Label>
                                                                        <Input
                                                                            placeholder={isHistory ? "Sem rastreio" : "Insira o cód. de rastreio"}
                                                                            value={trackingCodeValue}
                                                                            onChange={(e) => onTrackingCodeChange(route.id, stop.serviceOrder, part.code, e.target.value)}
                                                                            disabled={isHistory}
                                                                        />
                                                                    </div>
                                                                    {!isHistory && (
                                                                        <>
                                                                             <Button 
                                                                                size="icon" 
                                                                                variant="outline"
                                                                                type="button"
                                                                                onClick={() => onOpenScanner({ routeId: route.id, stopServiceOrder: stop.serviceOrder, partCode: part.code })}
                                                                                disabled={isSubmitting}
                                                                            >
                                                                                <ScanLine className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button 
                                                                                size="icon" 
                                                                                onClick={() => onSavePart(route.id, stop.serviceOrder, { ...part, trackingCode: trackingCodeValue })}
                                                                                disabled={isSubmitting || !trackingCodeValue}
                                                                            >
                                                                                <Save className="h-4 w-4" />
                                                                            </Button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )})}
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        {!isHistory && onSaveChanges && (
                                            <Button onClick={() => onSaveChanges(route.id)} disabled={isSubmitting} className="w-full sm:w-auto">
                                                <Save className="mr-2 h-4 w-4" />
                                                {isSubmitting ? "Salvando..." : "Salvar Todos os Rastreios da Rota"}
                                            </Button>
                                        )}
                                        <Button variant="secondary" onClick={() => onGeneratePdf(route)} className="w-full sm:w-auto">
                                            <FileDown className="mr-2 h-4 w-4" />
                                            Gerar Extrato PDF
                                        </Button>
                                    </div>
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
    
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<{ routeId: string, stopServiceOrder: string, partCode: string } | null>(null);

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
            
            // Update state locally instead of refetching
            setAllRoutes(prevRoutes => prevRoutes.map(route => 
                route.id === routeId ? { ...route, stops: updatedStops } : route
            ));

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
                    trackingCode: trackingCodes[routeId]?.[stop.serviceOrder]?.[part.code] || part.trackingCode || "",
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

    const handleGeneratePdf = (route: Route) => {
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text(`Extrato de Peças - Rota: ${route.name}`, 14, 20);
        doc.setFontSize(10);
        doc.text(`Data de Criação: ${route.createdAt.toDate().toLocaleDateString('pt-BR')}`, 14, 26);

        type Row = (string | number | { content: string | number, rowSpan: number, styles: { valign: 'middle' } })[];
        const tableBody: Row[] = [];
        
        route.stops.forEach(stop => {
            if (stop.parts && stop.parts.length > 0) {
                stop.parts.forEach((part, partIndex) => {
                    const trackingCode = trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || part.trackingCode || "";
                    const row: Row = [];
                    if (partIndex === 0) {
                        row.push({
                            content: stop.serviceOrder,
                            rowSpan: stop.parts.length,
                            styles: { valign: 'middle' },
                        });
                    }
                    row.push(part.code);
                    row.push(part.quantity);
                    row.push(trackingCode);
                    tableBody.push(row);
                });
            }
        });

        if (tableBody.length > 0) {
            (doc as any).autoTable({
                startY: 35,
                head: [['OS', 'Peça', 'Qtd', 'Código de Rastreio']],
                body: tableBody,
                theme: 'grid',
            });
        } else {
            doc.text("Nenhuma peça encontrada para esta rota.", 14, 35);
        }

        doc.save(`extrato-${route.name.replace(/\s+/g, '-')}.pdf`);
    };

    const handleOpenScanner = (target: { routeId: string, stopServiceOrder: string, partCode: string }) => {
        setScanTarget(target);
        setIsScannerOpen(true);
    };
    
    const handleScanSuccess = (decodedText: string) => {
        if (scanTarget) {
            const { routeId, stopServiceOrder, partCode } = scanTarget;
            handleTrackingCodeChange(routeId, stopServiceOrder, partCode, decodedText);
        }
        setIsScannerOpen(false);
        setScanTarget(null);
        toast({ title: "Código lido com sucesso!", description: "O código de rastreio foi preenchido." });
    };

    return (
        <>
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
                                onGeneratePdf={handleGeneratePdf}
                                onOpenScanner={handleOpenScanner}
                            />
                        </TabsContent>
                        <TabsContent value="history" className="mt-6">
                            <RouteList
                                routes={completedRoutes}
                                onSavePart={handleSavePartTrackingCode}
                                isSubmitting={isSubmitting}
                                trackingCodes={trackingCodes}
                                onTrackingCodeChange={handleTrackingCodeChange}
                                onGeneratePdf={handleGeneratePdf}
                                onOpenScanner={handleOpenScanner}
                                isHistory={true}
                            />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
            
            <ScannerDialog 
                isOpen={isScannerOpen} 
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleScanSuccess}
            />
        </>
    );
}
 
    

    



