"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Copy, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { warmOfflinePages } from "@/lib/offlinePages";
import { diagnosticsToText, runDiagnostics, type DiagnosticLine } from "@/lib/diagnostics";

// Testa passo a passo o que o envio de relatório precisa (aparelho, rede, servidor, upload de
// 3 tamanhos) e mostra onde quebra - o resultado pode ser copiado e enviado ao suporte.
export function ConnectionDiagnostics({ trigger }: { trigger?: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<DiagnosticLine[]>([]);

  const start = async () => {
    setLines([]);
    setRunning(true);
    try {
      await runDiagnostics(l => setLines(prev => [...prev, l]));
    } catch (e: any) {
      setLines(prev => [...prev, { label: "Diagnóstico", status: "fail", detail: e?.message || String(e) }]);
    } finally {
      setRunning(false);
    }
  };

  const prepare = async () => {
    if (!navigator.onLine) { toast({ variant: "destructive", title: "Sem internet", description: "Conecte-se para preparar o uso sem sinal." }); return; }
    setRunning(true);
    const n = await warmOfflinePages(true);
    toast({ title: n > 0 ? "Telas guardadas no aparelho" : "Não deu para guardar as telas", description: n > 0 ? "Rotas, Relatório e as demais telas já abrem sem sinal." : "Tente de novo com sinal melhor." });
    await start();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsToText(lines));
      toast({ title: "Resultado copiado", description: "Cole na conversa com o suporte." });
    } catch {
      toast({ variant: "destructive", title: "Não deu para copiar", description: "Selecione o texto e copie à mão." });
    }
  };

  const failed = lines.filter(l => l.status === "fail").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && lines.length === 0) void start(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-1.5"><Stethoscope className="h-3.5 w-3.5" /> Diagnosticar</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Diagnóstico do envio de relatórios</DialogTitle>
          <DialogDescription>Testa o aparelho, a internet, o servidor e o envio de fotos. Os arquivos de teste são apagados em seguida.</DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              l.status === "fail" && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
              l.status === "warn" && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30")}>
              {l.status === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                : l.status === "warn" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />}
              <span><strong>{l.label}</strong><br /><span className="text-xs text-muted-foreground break-words">{l.detail}</span></span>
            </li>
          ))}
          {running && <li className="flex items-center gap-2 text-sm text-muted-foreground px-1"><Loader2 className="h-4 w-4 animate-spin" /> Testando…</li>}
        </ul>

        {!running && lines.length > 0 && (
          <p className="text-sm">
            {failed === 0 ? "Tudo certo por aqui. Se o relatório ainda falhar, copie o resultado e envie ao suporte." : `${failed} teste(s) falharam. Copie o resultado e envie ao suporte.`}
          </p>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={copy} disabled={lines.length === 0}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar resultado</Button>
          <Button variant="outline" size="sm" onClick={prepare} disabled={running}>Preparar para usar sem sinal</Button>
          <Button size="sm" onClick={start} disabled={running}>Testar de novo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
