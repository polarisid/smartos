"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { routeExpenseService } from "@/services/supabase/routeExpenseService";

// Abre a foto do comprovante (bucket privado: o link é assinado e dura 1 hora).
export function ReceiptViewer({ path, title, onClose }: { path: string | null; title?: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    setError(null);
    if (!path) return;
    let cancelled = false;
    routeExpenseService.getReceiptUrl(path)
      .then(u => { if (!cancelled) setUrl(u); })
      .catch(e => { if (!cancelled) setError(e?.message || "Não foi possível abrir o comprovante."); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <Dialog open={!!path} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comprovante</DialogTitle>
          <DialogDescription>{title || "Foto enviada no lançamento do gasto."}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[200px] items-center justify-center overflow-auto rounded-md bg-muted">
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : !url ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Comprovante do gasto" className="max-h-[70vh] w-auto max-w-full object-contain" />
          )}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            <ExternalLink className="h-3 w-3" /> Abrir em outra aba
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
