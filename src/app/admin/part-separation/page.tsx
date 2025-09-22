

"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { type Route, type RouteStop, type RoutePart, type ServiceOrder } from "@/lib/data";
import { collection, doc, getDocs, query, setDoc, Timestamp, orderBy, getDoc } from "firebase/firestore";
import { ChevronDown, PackageSearch, Save, Search, FileDown, CheckCircle, ScanLine, FileBarChart2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { isAfter } from "date-fns";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);


function RouteList({ routes, onSaveChanges, onSavePart, isSubmitting, trackingCodes, onTrackingCodeChange, onGeneratePdf, onOpenScanner, externalFilter, isHistory = false }: {
    routes: Route[],
    onSaveChanges?: (routeId: string) => void,
    onSavePart: (routeId: string, stopServiceOrder: string, part: RoutePart) => Promise<void>,
    isSubmitting: boolean,
    trackingCodes: Record<string, Record<string, Record<string, string>>>,
    onTrackingCodeChange: (routeId: string, stopServiceOrder: string, partCode: string, value: string) => void,
    onGeneratePdf: (route: Route) => void,
    onOpenScanner: (target: { routeId: string, stopServiceOrder: string, partCode: string }) => void,
    externalFilter: string;
    isHistory?: boolean
}) {

    if (routes.length === 0) {
        return (
            <Card>
                <CardContent className="text-center text-muted-foreground py-10">
                    <p>Nenhuma rota encontrada para esta categoria ou filtro.</p>
                </CardContent>
            </Card>
        );
    }
    
    return (
         <div className="space-y-4">
            {routes.map((route) => {
                const filteredStops = externalFilter ? route.stops.filter(stop => 
                    stop.serviceOrder.toLowerCase().includes(externalFilter.toLowerCase()) ||
                    stop.consumerName.toLowerCase().includes(externalFilter.toLowerCase()) ||
                    stop.model.toLowerCase().includes(externalFilter.toLowerCase()) ||
                    (stop.parts || []).some(part => part.code.toLowerCase().includes(externalFilter.toLowerCase()))
                ) : route.stops;
                
                const allPartsInRoute = route.stops.flatMap(stop => 
                    (stop.parts || []).map(part => ({ ...part, serviceOrder: stop.serviceOrder }))
                );

                const areAllPartsTracked = allPartsInRoute.length > 0 && allPartsInRoute.every(part => {
                    const code = trackingCodes[route.id]?.[part.serviceOrder]?.[part.code] || "";
                    return code.trim() !== "";
                });

                if (filteredStops.length === 0) {
                    return null;
                }

                return (
                    <Card key={route.id} className={cn(areAllPartsTracked && "bg-green-100 dark:bg-green-900/50")}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {areAllPartsTracked && <CheckCircle className="h-6 w-6 text-green-600" />}
                                {route.name}
                            </CardTitle>
                            <CardDescription>
                                Rota criada em {route.createdAt instanceof Date ? route.createdAt.toLocaleDateString('pt-BR') : 'N/A'} com {route.stops.length} paradas.
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
                                    {filteredStops.filter(stop => stop.parts && stop.parts.length > 0).map(stop => {
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
                                                                            <p className="text-xs text-muted-foreground">{part.description}</p>
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

function PartsSummary({ routes, serviceOrders }: { routes: Route[], serviceOrders: ServiceOrder[] }) {
    const { toast } = useToast();

    const summaryData = useMemo(() => {
        return routes.map(route => {
            const allStopsWithParts = route.stops.filter(s => s.parts && s.parts.length > 0);
            
            const plannedParts: { [partCode: string]: { description: string, quantity: number } } = {};
            allStopsWithParts.forEach(stop => {
                (stop.parts || []).forEach(part => {
                    if (plannedParts[part.code]) {
                        plannedParts[part.code].quantity += part.quantity;
                    } else {
                        plannedParts[part.code] = { description: part.description, quantity: part.quantity };
                    }
                });
            });

            const usedParts: { [partCode: string]: { count: number; osNumbers: string[] } } = {};
            const routeStopOSNumbers = new Set(route.stops.map(s => s.serviceOrder));
            
            serviceOrders.forEach(os => {
                const createdAtDate = route.createdAt instanceof Timestamp ? route.createdAt.toDate() : route.createdAt;
                if (routeStopOSNumbers.has(os.serviceOrderNumber) && os.replacedPart && createdAtDate && isAfter(os.date, createdAtDate)) {
                    const partsUsedInOS = os.replacedPart.split(',').map(p => p.trim());
                    partsUsedInOS.forEach(partCode => {
                        if (usedParts[partCode]) {
                            usedParts[partCode].count++;
                            if (!usedParts[partCode].osNumbers.includes(os.serviceOrderNumber)) {
                                usedParts[partCode].osNumbers.push(os.serviceOrderNumber);
                            }
                        } else {
                            usedParts[partCode] = { count: 1, osNumbers: [os.serviceOrderNumber] };
                        }
                    });
                }
            });

            const summary = Object.entries(plannedParts).map(([partCode, partData]) => {
                const usedInfo = usedParts[partCode] || { count: 0, osNumbers: [] };
                let status: 'usada' | 'extra' | 'nova' | 'parcial' = 'nova';

                if (usedInfo.count === 0) {
                    status = 'nova';
                } else if (usedInfo.count === partData.quantity) {
                    status = 'usada';
                } else if (usedInfo.count > partData.quantity) {
                    status = 'extra';
                } else {
                    status = 'parcial';
                }

                return {
                    partCode,
                    description: partData.description,
                    plannedQty: partData.quantity,
                    usedQty: usedInfo.count,
                    osNumbers: usedInfo.osNumbers,
                    status
                };
            });

            return {
                route,
                summary
            };
        }).filter(item => item.summary.length > 0);
    }, [routes, serviceOrders]);

    if (summaryData.length === 0) {
        return (
             <Card>
                <CardContent className="text-center text-muted-foreground py-10">
                    <p>Nenhuma rota com peças encontradas para gerar um resumo.</p>
                </CardContent>
            </Card>
        );
    }
    
    const handleGenerateSummaryPdf = (route: Route) => {
        try {
            const doc = new jsPDF();
            doc.setFontSize(16);
            doc.text(`Resumo de Utilização de Peças - Rota: ${route.name}`, 14, 20);

            type Row = (string | number)[];
            const tableBody: Row[] = [];
            
            const routeStopsWithParts = route.stops.filter(s => s.parts && s.parts.length > 0);
            
            routeStopsWithParts.forEach(stop => {
                stop.parts.forEach(part => {
                    const osRecord = serviceOrders.find(os => 
                        os.serviceOrderNumber === stop.serviceOrder && 
                        route.createdAt && 
                        isAfter(os.date, route.createdAt)
                    );

                    let status = "Nova"; // Default status
                    if (osRecord && osRecord.replacedPart?.includes(part.code)) {
                        status = "Usada";
                    }

                    tableBody.push([
                        stop.serviceOrder,
                        part.code,
                        part.description,
                        part.trackingCode || 'N/A',
                        status
                    ]);
                });
            });


            (doc as any).autoTable({
                startY: 30,
                head: [['OS', 'Peça', 'Descrição', 'Cód. Rastreio', 'Status']],
                body: tableBody,
                theme: 'grid',
            });

            doc.save(`resumo-detalhado-pecas-${route.name.replace(/\s+/g, '-')}.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({
                variant: "destructive",
                title: "Erro ao gerar PDF",
                description: "Não foi possível gerar o arquivo PDF do resumo.",
            });
        }
    };


    const getStatusBadge = (status: 'usada' | 'extra' | 'nova' | 'parcial') => {
        switch (status) {
            case 'usada': return <Badge variant="default" className="bg-green-600">Usada</Badge>;
            case 'extra': return <Badge variant="destructive">A mais</Badge>;
            case 'nova': return <Badge variant="secondary">Nova</Badge>;
            case 'parcial': return <Badge variant="default">Parcial</Badge>;
        }
    };

    return (
        <div className="space-y-4">
            {summaryData.map(({ route, summary }) => (
                <Card key={route.id}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>{route.name}</CardTitle>
                            <CardDescription>Resumo de utilização de peças para esta rota.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => handleGenerateSummaryPdf(route)}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Exportar Resumo PDF
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Peça</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Ordens de Serviço (OS)</TableHead>
                                    <TableHead className="text-center">Qtd. Solicitada</TableHead>
                                    <TableHead className="text-center">Qtd. Usada</TableHead>
                                    <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.map(item => (
                                    <TableRow key={item.partCode}>
                                        <TableCell className="font-mono">{item.partCode}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{item.description}</TableCell>
                                        <TableCell className="font-mono text-xs">{item.osNumbers.join(', ')}</TableCell>
                                        <TableCell className="text-center font-semibold">{item.plannedQty}</TableCell>
                                        <TableCell className="text-center font-semibold">{item.usedQty}</TableCell>
                                        <TableCell className="text-right">{getStatusBadge(item.status)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export default function PartSeparationPage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allRoutes, setAllRoutes] = useState<Route[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
    const [trackingCodes, setTrackingCodes] = useState<Record<string, Record<string, Record<string, string>>>>({}); // { routeId: { stopServiceOrder: { partCode: trackingCode } } }
    const [filterText, setFilterText] = useState("");
    
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<{ routeId: string, stopServiceOrder: string, partCode: string } | null>(null);

    const fetchAllData = async () => {
        setIsLoading(true);
        try {
            const [routesSnapshot, ordersSnapshot] = await Promise.all([
                getDocs(query(collection(db, "routes"), orderBy("createdAt", "desc"))),
                getDocs(collection(db, "serviceOrders"))
            ]);

            const routesData = routesSnapshot.docs.map(doc => {
                const data = doc.data();
                const toDate = (ts: any) => ts instanceof Timestamp ? ts.toDate() : ts;
                return {
                    id: doc.id,
                    ...data,
                    createdAt: toDate(data.createdAt),
                    departureDate: toDate(data.departureDate),
                    arrivalDate: toDate(data.arrivalDate),
                } as Route;
            });
            setAllRoutes(routesData);
            
            const ordersData = ordersSnapshot.docs.map(doc => {
                 const data = doc.data();
                 return { id: doc.id, ...data, date: (data.date as Timestamp).toDate() } as ServiceOrder;
            });
            setServiceOrders(ordersData);

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
            console.error("Error fetching data:", error);
            toast({ variant: "destructive", title: "Erro ao buscar dados", description: "Não foi possível carregar os dados." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [toast]);

    const filteredRoutes = useMemo(() => {
        return allRoutes.filter(route => {
             if (!filterText) return true;
            const filterLower = filterText.toLowerCase();

            return route.stops.some(stop =>
                stop.serviceOrder.toLowerCase().includes(filterLower) ||
                stop.consumerName.toLowerCase().includes(filterLower) ||
                stop.model.toLowerCase().includes(filterLower) ||
                (stop.parts || []).some(part => part.code.toLowerCase().includes(filterLower))
            );
        });
    }, [allRoutes, filterText]);

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
                        parts: (stop.parts || []).map(part => 
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
                parts: (stop.parts || []).map(part => ({
                    ...part,
                    trackingCode: trackingCodes[routeId]?.[stop.serviceOrder]?.[part.code] || part.trackingCode || "",
                })),
            }));
            
            await setDoc(doc(db, "routes", routeId), { stops: updatedStops }, { merge: true });

            toast({ title: "Códigos de rastreio salvos!", description: `As informações para a rota ${routeToUpdate.name} foram atualizadas.` });
            await fetchAllData(); // Refresh data from db
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
        const createdAtDate = route.createdAt instanceof Date ? route.createdAt : (route.createdAt as unknown as Timestamp).toDate();
        doc.text(`Data de Criação: ${createdAtDate.toLocaleDateString('pt-BR')}`, 14, 26);

        type Row = (string | number)[];
        const tableBody: Row[] = [];
        
        route.stops.forEach(stop => {
            if (stop.parts && stop.parts.length > 0) {
                 stop.parts.forEach((part, partIndex) => {
                    const trackingCode = trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || part.trackingCode || "";
                    if (partIndex === 0) {
                        tableBody.push([
                            { content: stop.serviceOrder, rowSpan: stop.parts.length, styles: { valign: 'middle' } },
                            { content: stop.model, rowSpan: stop.parts.length, styles: { valign: 'middle' } },
                            part.code, 
                            part.quantity, 
                            trackingCode
                        ]);
                    } else {
                        tableBody.push([part.code, part.quantity, trackingCode]);
                    }
                });
            }
        });

        if (tableBody.length > 0) {
            (doc as any).autoTable({
                startY: 35,
                head: [['OS', 'Modelo', 'Peça', 'Qtd', 'Código de Rastreio']],
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
                        <CardTitle>Filtro Geral</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label htmlFor="os-filter">Pesquisar por OS, Cliente, Modelo ou Peça</Label>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    id="os-filter"
                                    placeholder="Digite para filtrar..."
                                    value={filterText}
                                    onChange={(e) => setFilterText(e.target.value)}
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
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="active">Separação Ativa</TabsTrigger>
                            <TabsTrigger value="history">Histórico de Rotas</TabsTrigger>
                            <TabsTrigger value="summary">
                                <FileBarChart2 className="mr-2 h-4 w-4" /> Resumo de Peças
                            </TabsTrigger>
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
                                externalFilter={filterText}
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
                                externalFilter={filterText}
                                isHistory={true}
                            />
                        </TabsContent>
                         <TabsContent value="summary" className="mt-6">
                           <PartsSummary routes={filteredRoutes} serviceOrders={serviceOrders} />
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
 
    

    















    
