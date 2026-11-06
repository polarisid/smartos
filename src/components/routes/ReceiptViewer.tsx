"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { routeExpenseService, isPdfPath } from "@/services/supabase/routeExpenseService";

// Abre as fotos e PDFs do comprovante (bucket privado: o link é assinado e dura 1 hora).
// Com mais de um arquivo, mostra "1 de 3" e botões para passar de um para o outro.
export function ReceiptViewer({ paths, title, onClose }: { paths: string[] | null; title?: string; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = paths || [];
  const path = list[index] ?? null;

  // ao abrir outro gasto, volta para o primeiro arquivo
  useEffect(() => { setIndex(0); }, [paths]);

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

  const many = list.length > 1;

  return (
    <Dialog open={list.length > 0} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{many ? `Comprovante ${index + 1} de ${list.length}` : "Comprovante"}</DialogTitle>
          <DialogDescription>{title || "Foto ou PDF enviado no lançamento do gasto."}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[200px] items-center justify-center overflow-auto rounded-md bg-muted">
          {error ? (
            <p className="p-6 text-center text-sm text-destructive">{error}</p>
          ) : !url ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : isPdfPath(path) ? (
            <iframe src={url} title="Comprovante em PDF" className="h-[70vh] w-full border-0" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Comprovante do gasto" className="max-h-[70vh] w-auto max-w-full object-contain" />
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          {many ? (
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="outline" className="gap-1" disabled={index === 0} onClick={() => setIndex(i => i - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Button>
              <Button type="button" size="sm" variant="outline" className="gap-1" disabled={index >= list.length - 1} onClick={() => setIndex(i => i + 1)}>Próximo <ChevronRight className="h-4 w-4" /></Button>
            </div>
          ) : <span />}
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
              <ExternalLink className="h-3 w-3" /> Abrir em outra aba
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
