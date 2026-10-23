"use client";

import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { copyToClipboard } from "@/lib/clipboard";
import { routeCode } from "@/lib/routeCode";
import { cn } from "@/lib/utils";

// Código único da rota. Tocar copia (para colar numa busca ou numa conversa).
export function RouteCodeTag({ id, className }: { id?: string | null; className?: string }) {
    const { toast } = useToast();
    const code = routeCode(id);
    if (!code) return null;
    return (
        <button
            type="button"
            title="Código da rota — toque para copiar"
            onClick={async (e) => {
                e.stopPropagation();
                if (await copyToClipboard(code)) toast({ title: "Código copiado", description: code });
            }}
            className={cn("inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0 font-mono text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground", className)}
        >
            {code} <Copy className="h-2.5 w-2.5 opacity-60" />
        </button>
    );
}
