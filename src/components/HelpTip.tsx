"use client";

import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { helpById } from "@/lib/helpContent";
import { cn } from "@/lib/utils";

// Botão "?" que abre um resumo curto de uma função, com link para a explicação completa na Ajuda.
export function HelpTip({ topic, className, align = "start" }: { topic: string; className?: string; align?: "start" | "center" | "end" }) {
    const section = helpById(topic);
    if (!section) return null;
    const helpHref = section.audience === "tech" ? "/ajuda#" + section.id : "/admin/ajuda#" + section.id;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={"Ajuda: " + section.title}
                    title={"Ajuda: " + section.title}
                    className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors", className)}
                >
                    <HelpCircle className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-[min(92vw,360px)] space-y-2 text-sm">
                <p className="font-semibold leading-snug">{section.title}</p>
                <p className="text-xs text-muted-foreground">{section.summary}</p>
                <ol className="list-decimal pl-4 space-y-1 text-xs">
                    {section.steps.slice(0, 4).map((st, i) => <li key={i}>{st}</li>)}
                </ol>
                <Link href={helpHref} className="inline-block text-xs font-semibold text-primary hover:underline">Ver a explicação completa →</Link>
            </PopoverContent>
        </Popover>
    );
}
