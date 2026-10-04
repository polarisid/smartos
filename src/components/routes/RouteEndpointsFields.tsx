"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { geocodeAddressText } from "@/lib/geocode";
import type { RoutePoint } from "@/lib/data";

// Saída e chegada opcionais de uma rota (vazio = base da unidade).
export function RouteEndpointsFields({ start, end, onStartChange, onEndChange, disabled }: {
    start: RoutePoint | null;
    end: RoutePoint | null;
    onStartChange: (p: RoutePoint | null) => void;
    onEndChange: (p: RoutePoint | null) => void;
    disabled?: boolean;
}) {
    const { toast } = useToast();
    const [texts, setTexts] = useState({ start: "", end: "" });
    const [resolving, setResolving] = useState<"start" | "end" | null>(null);

    const handleSet = async (kind: "start" | "end") => {
        const text = texts[kind].trim();
        if (!text) return;
        setResolving(kind);
        try {
            const found = await geocodeAddressText(text);
            if (!found) {
                toast({ variant: "destructive", title: "Endereço não encontrado", description: "Tente o CEP, ou cidade, bairro e UF (ex.: Recife, Boa Viagem, PE)." });
                return;
            }
            const point: RoutePoint = { address: found.label, lat: found.coords[0], lng: found.coords[1] };
            (kind === "start" ? onStartChange : onEndChange)(point);
            setTexts(t => ({ ...t, [kind]: "" }));
        } finally {
            setResolving(null);
        }
    };

    const items = [
        { kind: "start" as const, label: "Saída", icon: "🚩", point: start, clear: () => onStartChange(null) },
        { kind: "end" as const, label: "Chegada", icon: "🏁", point: end, clear: () => onEndChange(null) },
    ];

    return (
        <div className="rounded-lg border p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saída e chegada das rotas (opcional)</p>
            <div className="grid gap-3 sm:grid-cols-2">
                {items.map(({ kind, label, icon, point, clear }) => (
                    <div key={kind} className="space-y-1">
                        <Label className="text-xs">{icon} {label}</Label>
                        {point ? (
                            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span className="text-xs flex-1 min-w-0 truncate" title={point.address}>{point.address}</span>
                                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clear} disabled={disabled}>Usar base</Button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Input
                                    value={texts[kind]}
                                    onChange={e => setTexts(t => ({ ...t, [kind]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleSet(kind); } }}
                                    placeholder="Padrão: base da unidade — CEP ou endereço"
                                    className="h-8 text-xs"
                                    disabled={disabled || resolving !== null}
                                />
                                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={() => handleSet(kind)} disabled={disabled || !texts[kind].trim() || resolving !== null}>
                                    {resolving === kind ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Definir"}
                                </Button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
                Vale para todas as rotas criadas aqui: a otimização de cada rota parte da saída e termina na chegada.
            </p>
        </div>
    );
}
