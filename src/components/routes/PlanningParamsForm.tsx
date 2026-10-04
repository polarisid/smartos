"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeProductKey, type PlanningParams } from "@/lib/routePlanning";

// Campos de tempo de atendimento por produto + expediente do modo planejamento.
// Usado na janela do próprio Planejamento e na tela de Configurações.
export function PlanningParamsForm({ value, onChange, suggestedProducts = [] }: {
    value: PlanningParams;
    onChange: (p: PlanningParams) => void;
    // Produtos já vistos nas rotas: aparecem na lista mesmo sem tempo definido.
    suggestedProducts?: string[];
}) {
    const [extraProduct, setExtraProduct] = useState("");

    const products = useMemo(() => {
        const set = new Set<string>([...suggestedProducts, ...Object.keys(value.durationByProduct)]);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [suggestedProducts, value.durationByProduct]);

    const setProductMinutes = (key: string, text: string) => {
        const n = Math.round(Number(text.replace(/\D/g, "")));
        const next = { ...value.durationByProduct };
        if (!text.trim() || !n) delete next[key]; else next[key] = Math.min(n, 600);
        onChange({ ...value, durationByProduct: next });
    };

    const addProduct = () => {
        const key = normalizeProductKey(extraProduct);
        if (!key) return;
        onChange({ ...value, durationByProduct: { ...value.durationByProduct, [key]: value.durationByProduct[key] ?? value.defaultMinutes } });
        setExtraProduct("");
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <Label className="text-xs">Tempo padrão (min)</Label>
                    <Input type="number" min={1} value={value.defaultMinutes} onChange={e => onChange({ ...value, defaultMinutes: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Almoço (min, 0 = sem)</Label>
                    <Input type="number" min={0} value={value.lunchMinutes} onChange={e => onChange({ ...value, lunchMinutes: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Início do expediente</Label>
                    <Input type="time" value={value.dayStart} onChange={e => onChange({ ...value, dayStart: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Fim do expediente</Label>
                    <Input type="time" value={value.dayEnd} onChange={e => onChange({ ...value, dayEnd: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs" title="Se a próxima cidade for alcançada até esse horário, o técnico segue viagem e dorme lá">Pode dirigir até</Label>
                    <Input type="time" value={value.travelUntil} onChange={e => onChange({ ...value, travelUntil: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Almoço a partir de</Label>
                    <Input type="time" value={value.lunchStart} onChange={e => onChange({ ...value, lunchStart: e.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs" title="Rota em andamento com atraso maior que isso aparece como atrasada no painel de rotas">Avisar atraso a partir de (min)</Label>
                    <Input type="number" min={5} value={value.delayAlertMin} onChange={e => onChange({ ...value, delayAlertMin: Number(e.target.value) })} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={value.workSaturday} onChange={e => onChange({ ...value, workSaturday: e.target.checked })} />
                    Trabalha aos sábados
                </label>
            </div>

            <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tempo por tipo de produto (min)</Label>
                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                    {products.length === 0 && (
                        <p className="text-xs text-muted-foreground p-3">Nenhum produto ainda. Adicione abaixo.</p>
                    )}
                    {products.map(key => (
                        <div key={key} className="flex items-center gap-3 px-3 py-1.5">
                            <span className="text-xs flex-1 min-w-0 truncate" title={key}>{key}</span>
                            <Input
                                inputMode="numeric"
                                className="h-7 w-20 text-xs text-center"
                                placeholder={String(value.defaultMinutes)}
                                value={value.durationByProduct[key] ? String(value.durationByProduct[key]) : ""}
                                onChange={e => setProductMinutes(key, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        className="h-8 text-xs"
                        placeholder="Adicionar produto (ex.: REFRIGERATOR)"
                        value={extraProduct}
                        onChange={e => setExtraProduct(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addProduct(); } }}
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={addProduct} disabled={!extraProduct.trim()}>Adicionar</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Produto sem tempo definido usa o tempo padrão.</p>
            </div>
        </div>
    );
}
