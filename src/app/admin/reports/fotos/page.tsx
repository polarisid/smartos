"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useProductPhotoConfig } from "@/hooks/queries";
import { configService } from "@/services/supabase/configService";
import {
  DEFAULT_PRODUCT_SLOTS,
  PRODUCT_LINES,
  PRODUCT_LINE_LABELS,
  slotKeyFromLabel,
  type ProductLine,
  type ProductPhotoConfig,
} from "@/lib/productLine";
import { cn } from "@/lib/utils";

// Regra da linha pela 1ª letra do modelo (mostrada abaixo do nome de cada linha).
const LINE_RULE: Record<ProductLine, string> = {
  maquina_lavar: "modelo começa com W",
  ar_condicionado: "modelo começa com A",
  tv: "modelo começa com U, Q ou L",
  refrigerador: "modelo começa com R",
  outros: "qualquer outra letra",
};

// Linha em edição: foto nova ainda não tem chave definitiva (ela sai do nome ao salvar).
type DraftSlot = { key: string; label: string; required: boolean; isNew?: boolean };
type Draft = Record<ProductLine, DraftSlot[]>;

const toDraft = (config: ProductPhotoConfig): Draft =>
  Object.fromEntries(PRODUCT_LINES.map(line => [line, config[line].map(s => ({ ...s }))])) as Draft;

export default function ProductPhotosConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { appUser, activeUnidadeId } = useAuth();
  const isMaster = appUser?.role === "master";
  const { data: saved, isLoading } = useProductPhotoConfig();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [line, setLine] = useState<ProductLine>("maquina_lavar");
  const [isSaving, setIsSaving] = useState(false);

  // Carrega a configuração salva (e de novo se a unidade do master mudar).
  useEffect(() => {
    if (saved) setDraft(toDraft(saved));
  }, [saved]);

  const slots = draft?.[line] ?? [];
  const update = (next: DraftSlot[]) => setDraft(prev => (prev ? { ...prev, [line]: next } : prev));
  const patch = (index: number, change: Partial<DraftSlot>) => update(slots.map((s, i) => (i === index ? { ...s, ...change } : s)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    const next = slots.slice();
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const handleSave = async () => {
    if (!draft) return;
    if (isMaster && !activeUnidadeId) {
      toast({ variant: "destructive", title: "Selecione uma unidade", description: "Escolha uma unidade no seletor no topo antes de salvar." });
      return;
    }
    const config = {} as ProductPhotoConfig;
    for (const l of PRODUCT_LINES) {
      const used: string[] = draft[l].filter(s => !s.isNew).map(s => s.key);
      const labels = new Set<string>();
      config[l] = [];
      for (const s of draft[l]) {
        const label = s.label.trim();
        if (!label) {
          toast({ variant: "destructive", title: `${PRODUCT_LINE_LABELS[l]}: foto sem nome`, description: "Dê um nome à foto ou remova a linha em branco." });
          setLine(l);
          return;
        }
        if (labels.has(label.toLowerCase())) {
          toast({ variant: "destructive", title: `${PRODUCT_LINE_LABELS[l]}: nome repetido`, description: `Há mais de uma foto chamada "${label}".` });
          setLine(l);
          return;
        }
        labels.add(label.toLowerCase());
        let key = s.key;
        if (s.isNew) {
          key = slotKeyFromLabel(label, used);
          used.push(key);
        }
        config[l].push({ key, label, required: s.required });
      }
    }

    setIsSaving(true);
    try {
      await configService.setProductPhotoConfig(config, isMaster ? activeUnidadeId : undefined);
      await queryClient.invalidateQueries({ queryKey: ["product-photo-config"] });
      setDraft(toDraft(config));
      toast({ title: "Fotos salvas!", description: "Os técnicos passam a ver essa lista no próximo relatório." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar", description: e?.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/reports"><ArrowLeft className="mr-1 h-4 w-4" /> Relatórios Fotográficos</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Fotos do produto por linha</CardTitle>
          <CardDescription>
            O app identifica a linha do produto pela primeira letra do modelo e pede ao técnico só as fotos que você definir para ela.
            Defeito apresentado e pós-reparo continuam iguais para todas as linhas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRODUCT_LINES.map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLine(l)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  line === l ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span className="block text-sm font-semibold">{PRODUCT_LINE_LABELS[l]}</span>
                <span className="block text-[11px] opacity-80">{LINE_RULE[l]}</span>
              </button>
            ))}
          </div>

          {isLoading || !draft ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Fotos pedidas para {PRODUCT_LINE_LABELS[line]}</p>
              {slots.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhuma foto do produto para esta linha. Adicione abaixo.
                </p>
              )}
              {slots.map((slot, i) => (
                <div key={slot.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <Input
                    value={slot.label}
                    onChange={e => patch(i, { label: e.target.value })}
                    placeholder="Nome da foto (ex.: Etiqueta do tambor)"
                    className="min-w-[10rem] flex-1"
                  />
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Switch checked={slot.required} onCheckedChange={v => patch(i, { required: v })} />
                    Obrigatória
                  </label>
                  <div className="ml-auto flex items-center">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === slots.length - 1} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => update(slots.filter((_, k) => k !== i))} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => update([...slots, { key: `novo_${crypto.randomUUID()}`, label: "", required: true, isNew: true }])}
                >
                  <Plus className="mr-1 h-4 w-4" /> Adicionar foto
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update(DEFAULT_PRODUCT_SLOTS.map(s => ({ ...s })))}
                  title="Frontal, traseira e serial"
                >
                  <RotateCcw className="mr-1 h-4 w-4" /> Voltar ao padrão
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">Vale para as 5 linhas de uma vez.</p>
            <Button type="button" onClick={handleSave} disabled={isSaving || !draft}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
