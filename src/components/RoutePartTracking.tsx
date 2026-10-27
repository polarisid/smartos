"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { type Route } from "@/lib/data";
import { routeService } from "@/services/supabase/routeService";
import { entriesFromCodes, mergeServerCodes } from "@/lib/trackingCodes";
import { savePartTracking, overlayPendingCodes } from "@/lib/offlineTrackingQueue";
import { useTrackingQueue } from "@/hooks/useTrackingQueue";
import { Save, ScanLine, Search, CloudOff } from "lucide-react";
import { activeStops } from "@/lib/routeStops";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);

// Mesmo fluxo de coleta de rastreio da Conferência de Peças (admin) e do link
// mobile-conference, só que embutido na própria tela do técnico - usado quando
// a rota é dele, pra não depender de um admin preencher isso.
export function RoutePartTracking({ route, onSaved }: { route: Route; onSaved?: () => void }) {
  const { toast } = useToast();
  const [trackingCodes, setTrackingCodes] = useState<Record<string, Record<string, string>>>(() => {
    const initial: Record<string, Record<string, string>> = {};
    activeStops(route.stops).forEach(stop => {
      initial[stop.serviceOrder] = {};
      (stop.parts || []).forEach(part => {
        initial[stop.serviceOrder][part.code] = part.trackingCode || "";
      });
    });
    // O que foi bipado sem internet e ainda não subiu volta preenchido, mesmo depois de recarregar a página.
    return overlayPendingCodes(route.id, initial);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<{ stopServiceOrder: string; partCode: string } | null>(null);
  // Envia sozinho o que ficou guardado no aparelho assim que a internet volta.
  const pendingCount = useTrackingQueue(() => { onSaved?.(); });

  // Mostra na hora o que as outras pessoas bipam (a cada 8s, sem mexer no que você está digitando).
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden || !navigator.onLine) return;
      try {
        const data = await routeService.getById(route.id);
        if (data) setTrackingCodes(prev => mergeServerCodes(prev, data));
      } catch { /* sem sinal: tenta no próximo ciclo */ }
    }, 8000);
    return () => clearInterval(timer);
  }, [route.id]);

  const handleTrackingCodeChange = (stopServiceOrder: string, partCode: string, value: string) => {
    setTrackingCodes(prev => ({
      ...prev,
      [stopServiceOrder]: { ...prev[stopServiceOrder], [partCode]: value },
    }));
  };

  const handleSavePart = async (stopServiceOrder: string, partCode: string) => {
    setIsSubmitting(true);
    try {
      // Lê a rota na hora e grava só este código (outras pessoas podem estar bipando ao mesmo tempo).
      const { route: fresh, queued } = await savePartTracking(route.id, entriesFromCodes(trackingCodes, stopServiceOrder, partCode));
      if (queued) {
        toast({ title: "Guardado no aparelho", description: `Sem conexão: o rastreio da peça ${partCode} será enviado sozinho quando a internet voltar.` });
        return;
      }
      if (fresh) setTrackingCodes(prev => mergeServerCodes(prev, fresh));
      toast({ title: "Código de rastreio salvo!", description: `Rastreio para a peça ${partCode} salvo.` });
      onSaved?.();
    } catch (error) {
      console.error("Error saving part tracking code:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o código de rastreio da peça." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAll = async () => {
    setIsSubmitting(true);
    try {
      const { route: fresh, written, queued } = await savePartTracking(route.id, entriesFromCodes(trackingCodes));
      if (queued) {
        toast({ title: "Guardado no aparelho", description: "Sem conexão: os rastreios serão enviados sozinhos quando a internet voltar." });
        return;
      }
      if (fresh) setTrackingCodes(prev => mergeServerCodes(prev, fresh));
      toast({ title: "Códigos de rastreio salvos!", description: written > 0 ? `${written} peça(s) da rota "${route.name}" atualizada(s).` : "Nada novo para salvar." });
      onSaved?.();
    } catch (error) {
      console.error("Error saving all tracking codes:", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os códigos de rastreio." });
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const stopsWithParts = activeStops(route.stops).filter(stop => stop.parts && stop.parts.length > 0);
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
      <div className="space-y-4">
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

        {pendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <CloudOff className="h-4 w-4 shrink-0" />
            {pendingCount} rastreio(s) guardado(s) no aparelho, aguardando internet para enviar.
          </div>
        )}

        <Button onClick={handleSaveAll} disabled={isSubmitting} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {isSubmitting ? "Salvando..." : "Salvar Todos os Rastreios da Rota"}
        </Button>

        {filteredStops.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {stopsWithParts.length === 0
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
                      <Button size="icon" onClick={() => handleSavePart(stop.serviceOrder, part.code)} disabled={isSubmitting}>
                        <Save className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
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
