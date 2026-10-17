"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LifeBuoy, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { helpFor, type HelpSection } from "@/lib/helpContent";

// Central de Ajuda: o que cada função faz e como usar. Busca por texto; abre direto numa seção pelo #id do endereço.
export function HelpCenter({ audience }: { audience: "admin" | "tech" }) {
    const sections = useMemo(() => helpFor(audience), [audience]);
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fromHash = () => {
            const id = window.location.hash.replace("#", "");
            if (id && sections.some(s => s.id === id)) {
                setOpen(new Set([id]));
                setTimeout(() => document.getElementById("ajuda-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
            }
        };
        fromHash();
        window.addEventListener("hashchange", fromHash);
        return () => window.removeEventListener("hashchange", fromHash);
    }, [sections]);

    const q = query.trim().toLowerCase();
    const visible = sections.filter((s: HelpSection) =>
        !q || [s.title, s.summary, s.where, ...s.steps, ...(s.tips || [])].join(" ").toLowerCase().includes(q)
    );
    const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    return (
        <div className="max-w-3xl mx-auto w-full space-y-4 p-4 sm:p-6">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2"><LifeBuoy className="h-6 w-6" /> Ajuda</h1>
                <p className="text-sm text-muted-foreground">Como usar as funções do SmartOS. Em várias telas também há um botão “?” com um resumo rápido.</p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar na ajuda (ex.: planejamento, rastreio, sem sinal)…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>

            <div className="space-y-2">
                {visible.map(s => {
                    const isOpen = open.has(s.id) || !!q;
                    return (
                        <section key={s.id} id={"ajuda-" + s.id} className="rounded-lg border bg-card scroll-mt-4">
                            <button type="button" onClick={() => toggle(s.id)} className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left">
                                <span>
                                    <span className="block font-semibold">{s.title}</span>
                                    <span className="block text-xs text-muted-foreground mt-0.5">{s.summary}</span>
                                </span>
                                <ChevronDown className={cn("h-4 w-4 mt-1 shrink-0 transition-transform", isOpen && "rotate-180")} />
                            </button>
                            {isOpen && (
                                <div className="px-4 pb-4 space-y-3 border-t pt-3">
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {s.where}</p>
                                    <ol className="list-decimal pl-5 space-y-1.5 text-sm">
                                        {s.steps.map((st, i) => <li key={i}>{st}</li>)}
                                    </ol>
                                    {s.tips && s.tips.length > 0 && (
                                        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 space-y-1">
                                            <p className="text-[11px] font-bold uppercase tracking-wide text-primary">Bom saber</p>
                                            <ul className="list-disc pl-4 text-xs space-y-0.5">
                                                {s.tips.map((t, i) => <li key={i}>{t}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })}
                {visible.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nada encontrado para “{query}”.</p>}
            </div>
        </div>
    );
}
