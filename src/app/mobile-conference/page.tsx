
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { type Route, type RoutePart, type ServiceOrder } from "@/lib/data";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { PackageSearch, Save, ScanLine, Smartphone, Loader2, RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);

// The API returns dates as ISO strings, and enriched data.
type EnrichedRoute = Route & {
    serviceOrders: ServiceOrder[];
    createdAt: string;
    departureDate: string;
    arrivalDate: string;
};

export default function MobileConferencePage() {
    const { toast } = useToast();
    const [routes, setRoutes] = useState<EnrichedRoute[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [trackingCodes, setTrackingCodes] = useState<Record<string, Record<string, Record<string, string>>>>({});
    
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<{ routeId: string, stopServiceOrder: string, partCode: string } | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/service-orders');
            if (!response.ok) {
                throw new Error('Falha ao buscar dados da API');
            }
            const data: EnrichedRoute[] = await response.json();
            setRoutes(data);

            const initialTrackingCodes: typeof trackingCodes = {};
            data.forEach(route => {
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
            toast({ variant: "destructive", title: "Erro ao buscar rotas", description: "Não foi possível carregar os dados das rotas ativas." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const handleSavePartTrackingCode = async (routeId: string, stopServiceOrder: string, partCode: string) => {
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
                            part.code === partCode 
                                ? { ...part, trackingCode: trackingCodes[routeId][stopServiceOrder][partCode] } 
                                : part
                        ),
                    };
                }
                return stop;
            });

            await setDoc(routeDocRef, { stops: updatedStops }, { merge: true });

            toast({ title: "Código de rastreio salvo!", description: `Rastreio para a peça ${partCode} salvo.` });
        } catch (error) {
            console.error("Error saving part tracking code:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o código de rastreio da peça." });
        } finally {
            setIsSubmitting(false);
        }
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
        toast({ title: "Código lido com sucesso!" });
    };

    return (
        <>
            <div className="flex flex-col min-h-screen">
                <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
                    <div className="flex items-center gap-3">
                         <Smartphone className="w-6 h-6 text-primary" />
                         <h1 className="text-xl font-bold">Conferência Mobile</h1>
                    </div>
                     <Button variant="ghost" size="icon" onClick={fetchData} disabled={isLoading}>
                        <RefreshCw className={cn("h-5 w-5", isLoading && "animate-spin")} />
                    </Button>
                </header>
                <main className="flex-grow p-2 sm:p-4 space-y-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center pt-20">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : routes.length === 0 ? (
                        <Card>
                            <CardContent className="text-center text-muted-foreground py-10">
                                <p>Nenhuma rota ativa encontrada no momento.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        routes.map(route => (
                            <Card key={route.id}>
                                <CardHeader>
                                    <CardTitle>{route.name}</CardTitle>
                                    <CardDescription>
                                        Técnico: {route.technicianName}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {route.stops.filter(stop => stop.parts && stop.parts.length > 0).map(stop => (
                                         <div key={stop.serviceOrder} className="border p-3 rounded-lg bg-background">
                                             <div className="flex flex-wrap items-baseline gap-x-4">
                                                <h3 className="font-semibold text-lg">{stop.serviceOrder}</h3>
                                                <p className="text-sm text-muted-foreground">{stop.model}</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-4">{stop.consumerName}</p>
                                            <div className="space-y-4">
                                                {stop.parts.map(part => (
                                                    <div key={part.code} className="border-t pt-4">
                                                         <div className="space-y-1 mb-2">
                                                            <p className="font-mono">{part.code}</p>
                                                            <p className="text-xs text-muted-foreground">{part.description} (x{part.quantity})</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                placeholder="Insira o cód. de rastreio"
                                                                value={trackingCodes[route.id]?.[stop.serviceOrder]?.[part.code] || ''}
                                                                onChange={(e) => handleTrackingCodeChange(route.id, stop.serviceOrder, part.code, e.target.value)}
                                                            />
                                                            <Button size="icon" variant="outline" type="button" onClick={() => handleOpenScanner({ routeId: route.id, stopServiceOrder: stop.serviceOrder, partCode: part.code })}>
                                                                <ScanLine className="h-5 w-5" />
                                                            </Button>
                                                            <Button size="icon" onClick={() => handleSavePartTrackingCode(route.id, stop.serviceOrder, part.code)} disabled={isSubmitting}>
                                                                <Save className="h-5 w-5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                         </div>
                                    ))}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </main>
            </div>
            <ScannerDialog 
                isOpen={isScannerOpen} 
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleScanSuccess}
            />
        </>
    );
}
