"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { RepairCenterInfo } from "@/lib/data";
import { buildAndDownloadQuotePdf } from "@/lib/quotePdf";
import { FileText, User, CreditCard, Plus, Trash2, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toNum = (s: string) => parseFloat(s.replace(",", ".")) || 0;

const COMPLETION_PRESETS = [
  "Mesmo dia útil",
  "1 dia útil",
  "2 dias úteis",
  "3 dias úteis",
  "5 dias úteis",
  "7 dias úteis",
  "Sob consulta / avaliação técnica",
];

type QuoteItemRow = {
  id: string;
  code: string;
  description: string;
  valueText: string;
  kind: "peca" | "servico";
};

const newItem = (patch?: Partial<QuoteItemRow>): QuoteItemRow => ({
  id: crypto.randomUUID(),
  code: "",
  description: "",
  valueText: "",
  kind: "peca",
  ...patch,
});

export function QuoteBuilder({
  repairCenter,
  travelSuggestion,
  partSuggestions,
}: {
  repairCenter: RepairCenterInfo;
  travelSuggestion?: { label: string; value: number } | null;
  partSuggestions: { description: string; value: number }[];
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const [osNumber, setOsNumber] = useState("");
  const [clientNumber, setClientNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCpf, setClientCpf] = useState("");

  const [symptom, setSymptom] = useState("");
  const [accessory, setAccessory] = useState("");
  const [defectFound, setDefectFound] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [completionTime, setCompletionTime] = useState("");

  const [items, setItems] = useState<QuoteItemRow[]>([]);
  const [discountText, setDiscountText] = useState("");
  const [roundValues, setRoundValues] = useState(false);

  // Carrega automaticamente do cálculo na primeira vez que houver algo pra carregar.
  const [autoLoaded, setAutoLoaded] = useState(false);
  useEffect(() => {
    if (autoLoaded) return;
    if (!travelSuggestion && partSuggestions.length === 0) return;
    handleLoadFromCalculation();
    setAutoLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelSuggestion, partSuggestions]);

  const handleLoadFromCalculation = () => {
    const loaded: QuoteItemRow[] = [];
    if (travelSuggestion) {
      loaded.push(newItem({ description: travelSuggestion.label, valueText: String(travelSuggestion.value).replace(".", ","), kind: "servico" }));
    }
    partSuggestions.forEach(p => {
      loaded.push(newItem({ description: p.description, valueText: String(p.value).replace(".", ","), kind: "peca" }));
    });
    setItems(loaded);
  };

  const updateItem = (id: string, patch: Partial<QuoteItemRow>) => {
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const round = (n: number) => (roundValues ? Math.round(n) : n);
  const computedItems = items.map(it => ({ ...it, value: round(toNum(it.valueText)) }));
  const partsTotal = computedItems.filter(i => i.kind === "peca").reduce((a, i) => a + i.value, 0);
  const serviceTotal = computedItems.filter(i => i.kind === "servico").reduce((a, i) => a + i.value, 0);
  const discount = round(toNum(discountText));
  const grandTotal = partsTotal + serviceTotal - discount;

  const handleGenerate = async () => {
    if (!clientName.trim() || !clientCpf.trim()) {
      toast({ variant: "destructive", title: "Informe nome e CPF do cliente para gerar o orçamento." });
      return;
    }
    setIsGenerating(true);
    try {
      await buildAndDownloadQuotePdf({
        repairCenter,
        osNumber: osNumber.trim() || undefined,
        clientNumber: clientNumber.trim() || undefined,
        clientName: clientName.trim(),
        clientCpf: clientCpf.trim(),
        symptom, accessory, defectFound, serviceDescription, observations,
        completionTime,
        items: computedItems.map(i => ({ code: i.code || undefined, description: i.description, value: i.value, kind: i.kind })),
        discount,
      });
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gerar orçamento", description: e?.message });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border border-primary/40 shadow-sm">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Gerar Orçamento (PDF)</CardTitle>
            <CardDescription className="text-xs mt-1">
              Segue o template padrão Samsung. Nada aqui é salvo, só vai para o PDF.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 shrink-0" onClick={e => { e.stopPropagation(); setIsExpanded(v => !v); }}>
            {isExpanded ? <>Recolher <ChevronUp className="h-4 w-4" /></> : <>Preencher orçamento <ChevronDown className="h-4 w-4" /></>}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs flex items-center gap-1.5"><User className="h-3 w-3" /> Nome do Cliente *</Label>
            <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex: Maria Silva" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> CPF *</Label>
            <Input value={clientCpf} onChange={e => setClientCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nº da OS</Label>
            <Input value={osNumber} onChange={e => setOsNumber(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nº do Cliente</Label>
            <Input value={clientNumber} onChange={e => setClientNumber(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Tempo de Conclusão</Label>
            <Input
              list="completion-presets"
              value={completionTime}
              onChange={e => setCompletionTime(e.target.value)}
              placeholder="Selecione ou digite..."
            />
            <datalist id="completion-presets">
              {COMPLETION_PRESETS.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Sintoma do Cliente</Label>
            <Input value={symptom} onChange={e => setSymptom(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Acessório</Label>
            <Input value={accessory} onChange={e => setAccessory(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Defeito Constatado</Label>
            <Textarea value={defectFound} onChange={e => setDefectFound(e.target.value)} placeholder="Opcional" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição do Serviço</Label>
            <Textarea value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} placeholder="Opcional" rows={2} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Observações</Label>
            <Textarea value={observations} onChange={e => setObservations(e.target.value)} placeholder="Opcional" rows={2} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens do Orçamento</Label>
            <Button type="button" variant="ghost" size="sm" onClick={handleLoadFromCalculation} className="gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" /> Carregar do cálculo
            </Button>
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center border rounded-lg">Nenhum item ainda. Calcule acima e clique em "Carregar do cálculo", ou adicione manualmente.</p>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-muted-foreground text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <Input
                    value={item.code}
                    onChange={e => updateItem(item.id, { code: e.target.value })}
                    placeholder="Código (opcional)"
                    className="w-28 shrink-0"
                  />
                  <Input
                    value={item.description}
                    onChange={e => updateItem(item.id, { description: e.target.value })}
                    placeholder="Descrição"
                    className="flex-1 min-w-[140px]"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    {(["peca", "servico"] as const).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => updateItem(item.id, { kind: k })}
                        className={`px-2 py-1 rounded text-[10px] font-bold border ${item.kind === k ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-input"}`}
                      >
                        {k === "peca" ? "Peça" : "Serviço"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">R$</span>
                    <Input
                      value={item.valueText}
                      onChange={e => updateItem(item.id, { valueText: e.target.value.replace(/[^\d.,]/g, "") })}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="w-24"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Adicionar Item
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-4 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Desconto (R$)</Label>
            <Input
              value={discountText}
              onChange={e => setDiscountText(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="0,00"
              inputMode="decimal"
              className="w-32"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox id="round-values" checked={roundValues} onCheckedChange={c => setRoundValues(c === true)} />
            <Label htmlFor="round-values" className="text-xs font-medium cursor-pointer">Arredondar valores (reais inteiros)</Label>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total de peças</span><span className="font-medium">{brl(partsTotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Mão de obra</span><span className="font-medium">{brl(serviceTotal)}</span></div>
          {discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="font-medium">-{brl(discount)}</span></div>}
          <div className="flex justify-between border-t pt-1 mt-1"><span className="font-bold">Total</span><span className="font-bold text-primary text-base">{brl(grandTotal)}</span></div>
        </div>

        <Button onClick={handleGenerate} disabled={isGenerating} className="gap-2">
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Gerar Orçamento em PDF
        </Button>
      </CardContent>
      )}
    </Card>
  );
}
