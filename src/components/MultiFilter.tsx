"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Filtro de múltipla escolha: marca quantos valores quiser (OU dentro do filtro; os filtros se combinam em E).
export function MultiFilter({ label, options, selected, onChange, searchable }: {
    label: string;
    options: Array<{ value: string; count: number }>;
    selected: Set<string>;
    onChange: (s: Set<string>) => void;
    searchable?: boolean;
}) {
    const [q, setQ] = useState("");
    const shown = options.filter(o => !q.trim() || o.value.toLowerCase().includes(q.trim().toLowerCase()));
    const toggle = (v: string) => { const n = new Set(selected); if (n.has(v)) n.delete(v); else n.add(v); onChange(n); };
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", selected.size > 0 && "border-primary bg-primary/5")}>
                    {label}{selected.size > 0 ? " (" + selected.size + ")" : ""} <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2">
                {searchable && <Input className="h-8 text-xs mb-1.5" placeholder={"Buscar " + label.toLowerCase() + "…"} value={q} onChange={e => setQ(e.target.value)} />}
                <div className="max-h-64 overflow-y-auto grid gap-0.5">
                    {shown.map(o => (
                        <label key={o.value} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted cursor-pointer">
                            <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                            <span className="flex-1 truncate">{o.value}</span>
                            <span className="text-muted-foreground tabular-nums">{o.count}</span>
                        </label>
                    ))}
                    {shown.length === 0 && <p className="text-xs text-muted-foreground px-1.5 py-2">Nada encontrado.</p>}
                </div>
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t">
                    <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => onChange(new Set(shown.map(o => o.value)))}>Marcar visíveis</button>
                    <button type="button" className="text-[11px] text-muted-foreground hover:underline" onClick={() => onChange(new Set())}>Limpar</button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

