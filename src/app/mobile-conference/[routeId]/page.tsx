"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { type Route } from "@/lib/data";
import { routeService } from "@/services/supabase/routeService";
import { entriesFromCodes, mergeServerCodes } from "@/lib/trackingCodes";
import { savePartTracking } from "@/lib/offlineTrackingQueue";
import { useTrackingQueue } from "@/hooks/useTrackingQueue";
import { PackageSearch, Save, ScanLine, Smartphone, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);

export default function MobileConferenceRoutePage() {
  const { routeId } = useParams() as { routeId: string };
  const { toast } = useToast();
  const [route, setRoute] = useState<Route | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trackingCodes, setTrackingCodes] = useState<Record<string, Record<string, string>>>({});

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ stopServiceOrder: string; partCode: string } | null>(null);
  const [filterText, setFilterText] = useState("");
  useTrackingQueue((sent) => { toast({ title: "Rastreios enviados", description: `${sent} código(s) guardados no aparelho foram salvos.` }); fetchData(); });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await routeService.getById(routeId);
      setRoute(data);

      const initialTrackingCodes: typeof trackingCodes = {};
      (data?.stops || []).forEach(stop => {
        initialTrackingCodes[stop.serviceOrder] = {};
        (stop.parts || []).forEach(part => {
          initialTrackingCodes[stop.serviceOrder][part.code] = part.trackingCode || "";
        });
      });
      setTrackingCodes(initialTrackingCodes);
    } catch (error) {
      console.error("Error fetching route:", error);
      toast({ variant: "destructive", title: "Erro ao buscar rota", description: "Não foi possível carregar os dados dessa rota." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (routeId) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleTrackingCodeChange = (stopServiceOrder: string, partCode: string, value: string) => {
    setTrackingCodes(prev => ({
      ...prev,
      [stopServiceOrder]: {
        ...prev[stopServiceOrder],
        [partCode]: value,
      },
    }));
  };

  // Várias pessoas podem bipar a mesma rota ao mesmo tempo: o salvamento lê a rota na hora e grava
  // só os códigos que ESTA tela tem preenchidos (nunca limpa/desfaz o que outra pessoa bipou).
  const applyServerRoute = (data: Route) => {
    setRoute(data);
    setTrackingCodes(prev => mergeServerCodes(prev, data));
  };

  const handleSavePartTrackingCode = async (stopServiceOrder: string, partCode: string) => {
    if (!route) return;
    setIsSubmitting(true);
    try {
      const { route: fresh, queued } = await savePartTracking(route.id, entriesFromCodes(trackingCodes, stopServiceOrder, partCode));
      if (queued) {
        toast({ title: "Guardado no aparelho", description: `Sem conexão: o rastreio da peça ${partCode} será enviado quando a internet voltar.` });
        return;
      }
      if (fresh) applyServerRoute(fresh);
      toast({ title: "Código de rastreio salvo!", description: `Rastreio para a peça ${partCode} salvo.` });
    } catch (error) {
      console.error("Error saving part tracking code:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o código de rastreio da peça." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!route) return;
    setIsSubmitting(true);
    try {
      const { route: fresh, written, queued } = await savePartTracking(route.id, entriesFromCodes(trackingCodes));
      if (queued) {
        toast({ title: "Guardado no aparelho", description: "Sem conexão: os rastreios serão enviados quando a internet voltar." });
        return;
      }
      if (fresh) applyServerRoute(fresh);
      toast({ title: "Códigos de rastreio salvos!", description: written > 0 ? `${written} peça(s) da rota "${route.name}" atualizada(s).` : "Nada novo para salvar." });
    } catch (error) {
      console.error("Error saving all tracking codes:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os códigos de rastreio." });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mostra na hora o que as outras pessoas bipam (a cada 8s, sem mexer no que você está digitando).
  useEffect(() => {
    if (!routeId) return;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const data = await routeService.getById(routeId);
        if (data) applyServerRoute(data);
      } catch { /* sem sinal: tenta no próximo ciclo */ }
    }, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleOpenScanner = (target: { stopServiceOrder: string; partCode: string }) => {
    setScanTarget(target);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (decodedText: string) => {
    if (scanTarget) {
      handleTrackingCodeChange(scanTarget.stopServiceOrder, scanTarget.partCode, decodedText);
    }
    setIsScannerOpen(false);
    setScanTarget(null);
    toast({ title: "Código lido com sucesso!" });
  };

  const stopsWithParts = (route?.stops || []).filter(stop => stop.parts && stop.parts.length > 0);
  const filteredStops = filterText
    ? stopsWithParts.filter(stop =>
        stop.serviceOrder.toLowerCase().includes(filterText.toLowerCase()) ||
        stop.consumerName.toLowerCase().includes(filterText.toLowerCase()) ||
        stop.model.toLowerCase().includes(filterText.toLowerCase()) ||
        (stop.parts || []).some(part => part.code.toLowerCase().includes(filterText.toLowerCase()))
      )
    : stopsWithParts;

  return (
    <>
      <div className="flex flex-col min-h-screen">
        <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold leading-tight">Conferência de Peças</h1>
              {route && <p className="text-xs text-muted-foreground">{route.name}</p>}
            </div>
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
          ) : !route ? (
            <Card>
              <CardContent className="text-center text-muted-foreground py-10">
                <p>Rota não encontrada. Confira se o link está correto.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageSearch className="h-5 w-5" /> {route.name}
                </CardTitle>
                <CardDescription>Técnico: {route.technicianName || "-"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="part-filter">Pesquisar por OS, Cliente, Modelo ou Peça</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="part-filter"
                      placeholder="Digite para filtrar..."
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <Button onClick={handleSaveAll} disabled={isSubmitting} className="w-full">
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmitting ? "Salvando..." : "Salvar Todos os Rastreios da Rota"}
                </Button>

                {filteredStops.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {route.stops.filter(stop => stop.parts && stop.parts.length > 0).length === 0
                      ? "Nenhuma peça para conferir nessa rota."
                      : "Nenhuma peça encontrada para esse filtro."}
                  </p>
                ) : (
                  filteredStops.map(stop => (
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
                                value={trackingCodes[stop.serviceOrder]?.[part.code] || ''}
                                onChange={(e) => handleTrackingCodeChange(stop.serviceOrder, part.code, e.target.value)}
                              />
                              <Button size="icon" variant="outline" type="button" onClick={() => handleOpenScanner({ stopServiceOrder: stop.serviceOrder, partCode: part.code })}>
                                <ScanLine className="h-5 w-5" />
                              </Button>
                              <Button size="icon" onClick={() => handleSavePartTrackingCode(stop.serviceOrder, part.code)} disabled={isSubmitting}>
                                <Save className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>
      <ScannerDialog
        isOpen={isScannerOpen}
        mode="tracking"
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
