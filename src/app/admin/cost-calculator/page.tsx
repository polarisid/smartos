"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { configService } from "@/services/supabase/configService";
import { getCoordinates, parseFullAddress } from "@/lib/geocode";
import { fetchOsrmDrivingMatrix, haversineDistanceKm, type PointCoord } from "@/lib/routingEngine";
import { computeVisitCost, DEFAULT_TRAVEL_COST_PARAMS, type VisitCostBreakdown } from "@/lib/travelCost";
import type { TravelCostParams } from "@/lib/data";
import { Calculator, Loader2, MapPin, Copy, Settings2, TriangleAlert } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Geocodifica um endereço em texto livre (ex: "João Pessoa, Bancários, PB")
// via Photon, com Nominatim como fallback. Usado quando o operador digita um
// endereço em vez de um CEP, ou quando o CEP não é encontrado.
async function geocodeFreeText(q: string): Promise<{ coords: PointCoord; label: string } | null> {
  const query = /brasil|brazil/i.test(q) ? q : `${q}, Brasil`;
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=default`);
    if (r.ok) {
      const d = await r.json();
      const f = d?.features?.[0];
      if (f?.geometry?.coordinates?.length === 2) {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        const label = [p.name, p.district, [p.city || p.county || p.name, p.state].filter(Boolean).join(" - ")]
          .filter(Boolean)
          .join(", ") || q;
        return { coords: { lat, lng }, label };
      }
    }
  } catch { /* tenta o fallback */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=1&q=${encodeURIComponent(query)}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.[0]) return { coords: { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }, label: d[0].display_name || q };
    }
  } catch { /* sem resultado */ }
  return null;
}

type CalcResult = {
  breakdown: VisitCostBreakdown;
  destLabel: string;
  estimated: boolean;
};

export default function CostCalculatorPage() {
  const { toast } = useToast();
  const [cep, setCep] = useState("");
  const [params, setParams] = useState<TravelCostParams>(DEFAULT_TRAVEL_COST_PARAMS);
  const [baseCoords, setBaseCoords] = useState<PointCoord | null>(null);
  const [baseLabel, setBaseLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, coords, address] = await Promise.all([
          configService.getTravelCostParams(),
          configService.getBaseCoords(),
          configService.getBaseAddress(),
        ]);
        setParams(p);
        setBaseLabel(address || "");
        if (coords) {
          setBaseCoords(coords);
        } else if (address) {
          const { city, state, street } = parseFullAddress(address);
          const geo = await getCoordinates(city, "", state, street || address);
          if (geo) setBaseCoords({ lat: geo[0], lng: geo[1] });
        }
      } catch (e) {
        console.error(e);
        toast({ variant: "destructive", title: "Erro ao carregar parâmetros de custo" });
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCalculate = async () => {
    const raw = cep.trim();
    if (!raw) {
      toast({ variant: "destructive", title: "Informe o CEP ou o endereço do cliente." });
      return;
    }
    if (!baseCoords) {
      toast({ variant: "destructive", title: "Base não configurada", description: "Defina o ponto de saída em Configurações." });
      return;
    }

    const digits = raw.replace(/\D/g, "");
    const isCep = digits.length === 8 && !/[a-zA-ZÀ-ÿ]/.test(raw);

    setIsCalculating(true);
    setResult(null);
    try {
      let destCoords: PointCoord;
      let destLabel: string;

      if (isCep) {
        // 1. Detalhes do CEP (cidade/UF/bairro/logradouro) via ViaCEP, quando houver.
        let city = "", state = "", neighborhood = "", street = "";
        try {
          const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
          if (res.ok) {
            const d = await res.json();
            if (d && !d.erro) {
              city = d.localidade || "";
              state = d.uf || "";
              neighborhood = d.bairro || "";
              street = d.logradouro || "";
            }
          }
        } catch { /* segue sem detalhe do CEP */ }

        // 2. Coordenadas do destino - tenta pelo CEP; se falhar, cai pra busca por texto.
        const geo = await getCoordinates(city, neighborhood, state, street, digits);
        if (geo) {
          destCoords = { lat: geo[0], lng: geo[1] };
          destLabel = [street, neighborhood, [city, state].filter(Boolean).join(" - ")]
            .filter(Boolean)
            .join(", ") || `CEP ${digits.slice(0, 5)}-${digits.slice(5)}`;
        } else {
          const byText = city ? await geocodeFreeText([street, neighborhood, city, state].filter(Boolean).join(", ")) : null;
          if (!byText) {
            toast({ variant: "destructive", title: "CEP não localizado", description: "Tente digitar o endereço (cidade, bairro, UF)." });
            return;
          }
          destCoords = byText.coords;
          destLabel = byText.label;
        }
      } else {
        // Busca por endereço em texto livre.
        const byText = await geocodeFreeText(raw);
        if (!byText) {
          toast({ variant: "destructive", title: "Endereço não encontrado", description: "Tente ser mais específico (cidade, bairro, UF)." });
          return;
        }
        destCoords = byText.coords;
        destLabel = byText.label;
      }

      // 3. Distância e tempo rodoviário (OSRM) entre a base e o destino.
      let roadKm: number;
      let roadSeconds: number;
      let estimated = false;
      const matrix = await fetchOsrmDrivingMatrix([baseCoords, destCoords]);
      if (matrix && matrix.distanceMatrix?.[0]?.[1] != null && matrix.durationMatrix?.[0]?.[1] != null) {
        roadKm = matrix.distanceMatrix[0][1] / 1000;
        roadSeconds = matrix.durationMatrix[0][1];
      } else {
        // Fallback: linha reta com fator rodoviário e velocidade média de 50 km/h.
        const straight = haversineDistanceKm(baseCoords, destCoords);
        roadKm = straight * 1.35;
        roadSeconds = (roadKm / 50) * 3600;
        estimated = true;
      }

      const breakdown = computeVisitCost(params, roadKm, roadSeconds);
      setResult({ breakdown, destLabel, estimated });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro no cálculo", description: e?.message });
    } finally {
      setIsCalculating(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    const b = result.breakdown;
    const lines = [
      `Taxa de visita: ${brl(b.visitFee)}`,
      `Destino: ${result.destLabel}`,
      `Distância: ${b.oneWayKm.toLocaleString("pt-BR")} km (só ida)${params.roundTrip ? ` · ${b.distanceKm.toLocaleString("pt-BR")} km ida e volta` : ""}`,
      `Tempo estimado: ${b.timeMinutes} min`,
      `Custo por km: ${brl(b.kmCost)}`,
      b.timeCost > 0 ? `Custo por tempo: ${brl(b.timeCost)}` : "",
      b.fixedFee > 0 ? `Taxa fixa: ${brl(b.fixedFee)}` : "",
      b.tollFlat > 0 ? `Pedágio: ${brl(b.tollFlat)}` : "",
      `Subtotal: ${brl(b.subtotal)}`,
      b.marginValue > 0 ? `Margem: ${brl(b.marginValue)}` : "",
      result.estimated ? "(distância estimada — roteirizador indisponível)" : "",
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Resumo copiado!" });
  };

  const paramsUnset = params.costPerKm === 0 && params.fixedFee === 0 && params.costPerHour === 0;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calculadora de Custo de Deslocamento</h1>
          <p className="text-sm text-muted-foreground">
            Estime a taxa de visita para um cliente a partir do CEP ou endereço de destino.
          </p>
        </div>
      </div>

      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">CEP ou endereço do cliente</CardTitle>
          <CardDescription className="text-xs flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-rose-500" />
            Saída de: <span className="font-medium text-foreground">{baseLabel || "base não configurada"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {paramsUnset && !isLoading && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Os parâmetros de custo ainda não foram configurados.{" "}
                <Link href="/admin/settings" className="underline font-semibold">Configurar agora</Link>.
              </span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={cep}
              onChange={e => setCep(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCalculate()}
              placeholder="CEP (00000-000) ou endereço: cidade, bairro, UF"
              className="sm:flex-1"
            />
            <Button onClick={handleCalculate} disabled={isLoading || isCalculating} className="gap-2 shrink-0">
              {isCalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Calcular
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Digite o CEP quando tiver. Se não souber ou não for encontrado, informe o endereço (ex: "João Pessoa, Bancários, PB").
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card className="border border-primary/30 shadow-sm">
          <CardHeader>
            <CardDescription className="text-xs">Taxa de visita estimada</CardDescription>
            <CardTitle className="text-3xl font-bold text-primary">{brl(result.breakdown.visitFee)}</CardTitle>
            <p className="text-xs text-muted-foreground pt-1">{result.destLabel}</p>
            {result.estimated && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 pt-1">
                <TriangleAlert className="h-3 w-3" /> Distância estimada (roteirizador indisponível no momento).
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label={`Distância (só ida)`} value={`${result.breakdown.oneWayKm.toLocaleString("pt-BR")} km`} />
            {params.roundTrip && (
              <Row label="Distância (ida e volta)" value={`${result.breakdown.distanceKm.toLocaleString("pt-BR")} km`} />
            )}
            <Row label="Tempo estimado" value={`${result.breakdown.timeMinutes} min`} />
            <div className="border-t my-1.5" />
            <Row label="Custo por km" value={brl(result.breakdown.kmCost)} />
            {result.breakdown.timeCost > 0 && <Row label="Custo por tempo" value={brl(result.breakdown.timeCost)} />}
            {result.breakdown.fixedFee > 0 && <Row label="Taxa fixa" value={brl(result.breakdown.fixedFee)} />}
            {result.breakdown.tollFlat > 0 && <Row label="Pedágio" value={brl(result.breakdown.tollFlat)} />}
            <Row label="Subtotal" value={brl(result.breakdown.subtotal)} bold />
            {result.breakdown.marginValue > 0 && (
              <Row label={`Margem (${params.marginPct.toLocaleString("pt-BR")}%)`} value={brl(result.breakdown.marginValue)} />
            )}
            {result.breakdown.minFeeApplied && (
              <Row label="Taxa mínima aplicada" value={brl(params.minFee)} />
            )}
            <div className="border-t my-1.5" />
            <Row label="Taxa de visita" value={brl(result.breakdown.visitFee)} bold />

            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                <Copy className="h-3.5 w-3.5" /> Copiar resumo
              </Button>
              <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground">
                <Link href="/admin/settings"><Settings2 className="h-3.5 w-3.5" /> Ajustar parâmetros</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={bold ? "font-bold text-foreground" : "font-medium text-foreground"}>{value}</span>
    </div>
  );
}
