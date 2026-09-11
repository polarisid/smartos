"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { configService } from "@/services/supabase/configService";
import { computePartFinalValue, DEFAULT_PART_COST_PARAMS } from "@/lib/partCost";
import { Wrench, Plus, Trash2, Copy, Settings2 } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Presets de tempo estimado para a troca da peça (minutos).
const TIME_PRESETS: { value: string; label: string; minutes: number }[] = [
  { value: "0", label: "Não considerar", minutes: 0 },
  { value: "15", label: "15 min", minutes: 15 },
  { value: "30", label: "30 min", minutes: 30 },
  { value: "45", label: "45 min", minutes: 45 },
  { value: "60", label: "1h", minutes: 60 },
  { value: "90", label: "1h30", minutes: 90 },
  { value: "120", label: "2h", minutes: 120 },
  { value: "180", label: "3h", minutes: 180 },
  { value: "240", label: "4h", minutes: 240 },
];

type PartRow = {
  id: string;
  description: string;
  costText: string; // texto livre enquanto edita (aceita vírgula/ponto)
  laborMinutes: number;
};

const newRow = (): PartRow => ({ id: crypto.randomUUID(), description: "", costText: "", laborMinutes: 0 });

const toNum = (s: string) => parseFloat(s.replace(",", ".")) || 0;

export type PartCostSummary = {
  totalFinal: number;
  items: { description: string; value: number }[];
};

export function PartCostCalculator({ onSummaryChange }: { onSummaryChange?: (summary: PartCostSummary | null) => void }) {
  const { toast } = useToast();
  const [defaultMarginPct, setDefaultMarginPct] = useState(DEFAULT_PART_COST_PARAMS.marginPct);
  const [laborCostPerHour, setLaborCostPerHour] = useState(DEFAULT_PART_COST_PARAMS.laborCostPerHour);
  const [marginText, setMarginText] = useState("");
  const [rows, setRows] = useState<PartRow[]>([newRow()]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const p = await configService.getPartCostParams();
        setDefaultMarginPct(p.marginPct);
        setLaborCostPerHour(p.laborCostPerHour);
        setMarginText(p.marginPct === 0 ? "" : String(p.marginPct).replace(".", ","));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const marginPct = marginText.trim() ? toNum(marginText) : defaultMarginPct;

  const updateRow = (id: string, patch: Partial<PartRow>) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows(prev => [...prev, newRow()]);

  const removeRow = (id: string) => setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));

  const lines = rows.map(r => ({ row: r, calc: computePartFinalValue(toNum(r.costText), marginPct, r.laborMinutes, laborCostPerHour) }));
  const hasAnyCost = lines.some(l => l.calc.cost > 0);
  const totalCost = lines.reduce((a, l) => a + l.calc.cost, 0);
  const totalMargin = lines.reduce((a, l) => a + l.calc.marginValue, 0);
  const totalLabor = lines.reduce((a, l) => a + l.calc.laborCost, 0);
  const totalFinal = lines.reduce((a, l) => a + l.calc.finalValue, 0);

  useEffect(() => {
    if (!onSummaryChange) return;
    if (!hasAnyCost) {
      onSummaryChange(null);
      return;
    }
    onSummaryChange({
      totalFinal,
      items: lines
        .filter(l => l.calc.cost > 0)
        .map((l, i) => ({ description: l.row.description.trim() || `Peça ${i + 1}`, value: l.calc.finalValue })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, marginPct, laborCostPerHour, hasAnyCost, totalFinal]);

  const handleCopy = () => {
    if (!hasAnyCost) return;
    const parts = lines
      .filter(l => l.calc.cost > 0)
      .map(l => `${l.row.description.trim() || "Peça"}: custo ${brl(l.calc.cost)}${l.calc.laborCost > 0 ? ` + mão de obra ${brl(l.calc.laborCost)}` : ""} → final ${brl(l.calc.finalValue)}`);
    const text = [...parts, "", `Total custo: ${brl(totalCost)}`, `Total margem: ${brl(totalMargin)}`, totalLabor > 0 ? `Total mão de obra: ${brl(totalLabor)}` : "", `Total final: ${brl(totalFinal)}`].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Resumo copiado!" });
  };

  return (
    <div className="space-y-6">
      <Card className="border border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Peças</CardTitle>
          <CardDescription className="text-xs">
            Informe o valor de custo e o tempo estimado de troca de cada peça para calcular o valor final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2 max-w-xs">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="part-margin-override" className="text-xs font-semibold">Margem aplicada (%)</Label>
              <Input
                id="part-margin-override"
                inputMode="decimal"
                value={marginText}
                onChange={e => setMarginText(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder={isLoading ? "..." : String(defaultMarginPct)}
              />
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => {
              const calc = computePartFinalValue(toNum(row.costText), marginPct, row.laborMinutes, laborCostPerHour);
              return (
                <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <Input
                    value={row.description}
                    onChange={e => updateRow(row.id, { description: e.target.value })}
                    placeholder="Peça (opcional): código ou descrição"
                    className="flex-1 min-w-[160px]"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">Custo</span>
                    <Input
                      value={row.costText}
                      onChange={e => updateRow(row.id, { costText: e.target.value.replace(/[^\d.,]/g, "") })}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="w-24"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">Tempo troca</span>
                    <Select value={String(row.laborMinutes)} onValueChange={v => updateRow(row.id, { laborMinutes: Number(v) })}>
                      <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_PRESETS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                    <span className="text-xs text-muted-foreground">Final</span>
                    <span className="font-mono font-bold text-sm min-w-[80px] text-right text-primary">
                      {calc.cost > 0 ? brl(calc.finalValue) : "—"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Adicionar Peça
          </Button>
        </CardContent>
      </Card>

      {hasAnyCost && (
        <Card className="border border-primary/30 shadow-sm">
          <CardHeader>
            <CardDescription className="text-xs">Valor final total ({lines.filter(l => l.calc.cost > 0).length} peça(s))</CardDescription>
            <CardTitle className="text-3xl font-bold text-primary">{brl(totalFinal)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="Total de custo" value={brl(totalCost)} />
            <Row label={`Margem (${marginPct.toLocaleString("pt-BR")}%)`} value={brl(totalMargin)} />
            {totalLabor > 0 && <Row label="Mão de obra (troca)" value={brl(totalLabor)} />}
            <div className="border-t my-1.5" />
            <Row label="Valor final total" value={brl(totalFinal)} bold />

            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
                <Copy className="h-3.5 w-3.5" /> Copiar resumo
              </Button>
              <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground">
                <Link href="/admin/settings"><Settings2 className="h-3.5 w-3.5" /> Ajustar parâmetros padrão</Link>
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
