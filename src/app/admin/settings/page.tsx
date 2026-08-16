"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { configService } from "@/services/supabase/configService";
import { getCoordinates, parseFullAddress } from "@/lib/geocode";
import { Settings, MapPin, Save, Loader2, Sparkles, Building2, Globe, LocateFixed } from "lucide-react";

const BaseLocationPicker = dynamic(() => import("@/components/BaseLocationPicker"), { ssr: false });

const DEFAULT_COORDS: [number, number] = [-14.235, -51.9253]; // centro do Brasil, sem base configurada ainda

export default function SettingsPage() {
  const { toast } = useToast();
  const [baseAddress, setBaseAddress] = useState("");
  const [baseCoords, setBaseCoords] = useState<[number, number] | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [savingWebhook, setSavingWebhook] = useState(false);

  useEffect(() => {
    async function loadConfigs() {
      try {
        setLoading(true);
        const [base, storedCoords, webhook] = await Promise.all([
          configService.getBaseAddress(),
          configService.getBaseCoords(),
          configService.getWebhookUrl(),
        ]);
        setBaseAddress(base || "Aracaju");
        setWebhookUrl(webhook || "");

        if (storedCoords) {
          setBaseCoords([storedCoords.lat, storedCoords.lng]);
        } else if (base) {
          // Sem pino salvo ainda - geocodifica o endereço atual só pra centralizar o mapa.
          const { city, state, street } = parseFullAddress(base);
          const coords = await getCoordinates(city, "", state, street || base);
          setBaseCoords(coords || DEFAULT_COORDS);
        } else {
          setBaseCoords(DEFAULT_COORDS);
        }
      } catch (err: any) {
        console.error("Erro ao carregar configurações:", err);
        setBaseCoords(DEFAULT_COORDS);
      } finally {
        setLoading(false);
      }
    }
    loadConfigs();
  }, []);

  const handleLocateAddress = async () => {
    if (!baseAddress.trim()) {
      toast({ variant: "destructive", title: "Digite o endereço ou cidade da base" });
      return;
    }
    setIsLocating(true);
    try {
      const { city, state, street } = parseFullAddress(baseAddress.trim());
      const coords = await getCoordinates(city, "", state, street || baseAddress.trim());
      if (coords) {
        setBaseCoords(coords);
        toast({ title: "Localização encontrada!", description: "Ajuste arrastando o marcador no mapa, se precisar." });
      } else {
        toast({ variant: "destructive", title: "Endereço não encontrado", description: "Ajuste manualmente arrastando o marcador no mapa." });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao localizar endereço", description: err.message });
    } finally {
      setIsLocating(false);
    }
  };

  const handleSaveBaseAddress = async () => {
    if (!baseAddress.trim()) {
      toast({ variant: "destructive", title: "Digite o endereço ou cidade da base" });
      return;
    }
    setSavingBase(true);
    try {
      const coords = baseCoords ? { lat: baseCoords[0], lng: baseCoords[1] } : null;
      await configService.setBaseAddress(baseAddress.trim(), coords);
      toast({
        title: "Ponto de Saída Atualizado!",
        description: `Base operacional configurada como "${baseAddress.trim()}". As otimizações de rotas usarão este ponto por padrão.`,
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: err.message });
    } finally {
      setSavingBase(false);
    }
  };

  const handleSaveWebhook = async () => {
    setSavingWebhook(true);
    try {
      await configService.setWebhookUrl(webhookUrl.trim());
      toast({
        title: "Webhook Salvo!",
        description: "URL de notificação de rotas atualizada com sucesso.",
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao salvar webhook", description: err.message });
    } finally {
      setSavingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 w-full bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações do Sistema</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie o endereço base operacional, integrações e parâmetros das rotas.
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Endereço Base da Operação */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Ponto de Saída Padrão (Base Operacional)
            </CardTitle>
            <CardDescription className="text-xs">
              Este endereço ou cidade é utilizado pela inteligência artificial como o ponto inicial e final (retorno à base) na otimização de percursos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="base-address" className="text-xs font-semibold flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-500" />
                Cidade / Endereço da Base
              </Label>
              <div className="flex flex-col sm:flex-row gap-2 max-w-lg">
                <Input
                  id="base-address"
                  value={baseAddress}
                  onChange={(e) => setBaseAddress(e.target.value)}
                  placeholder="Ex: Aracaju, Maceió, Recife, Salvador, Campina Grande..."
                />
                <Button type="button" variant="outline" onClick={handleLocateAddress} disabled={isLocating} className="gap-2 shrink-0">
                  {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  Localizar no mapa
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Exemplos comuns: <span className="font-medium text-foreground">Aracaju</span>, <span className="font-medium text-foreground">Maceió</span>, <span className="font-medium text-foreground">João Pessoa</span>, <span className="font-medium text-foreground">Recife</span>, <span className="font-medium text-foreground">Campina Grande</span>.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Ajuste fino no mapa</Label>
              <p className="text-[11px] text-muted-foreground">
                Arraste o marcador para o ponto exato de saída - isso passa a valer sobre a geocodificação automática do endereço.
              </p>
              {baseCoords ? (
                <>
                  <BaseLocationPicker position={baseCoords} onChange={setBaseCoords} />
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {baseCoords[0].toFixed(6)}, {baseCoords[1].toFixed(6)}
                  </p>
                </>
              ) : (
                <div className="h-[320px] w-full rounded-xl bg-muted animate-pulse" />
              )}
            </div>

            <Button
              onClick={handleSaveBaseAddress}
              disabled={savingBase}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              {savingBase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Endereço da Base
            </Button>
          </CardContent>
        </Card>

        {/* Configuração de Webhook */}
        <Card className="border border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              URL do Webhook (Integração n8n / WhatsApp)
            </CardTitle>
            <CardDescription className="text-xs">
              URL notificada automaticamente quando novas rotas são publicadas no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url" className="text-xs font-semibold">
                Endpoint do Webhook
              </Label>
              <Input
                id="webhook-url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-n8n.com/webhook/rotas"
                className="max-w-xl"
              />
            </div>

            <Button
              onClick={handleSaveWebhook}
              disabled={savingWebhook}
              variant="outline"
              className="gap-2"
            >
              {savingWebhook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Webhook
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
