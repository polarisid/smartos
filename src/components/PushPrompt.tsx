"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { pushService } from "@/services/supabase/pushService";

const DISMISSED_KEY = "pushPromptDismissedAt";
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

// Convite para ligar os avisos no aparelho (push com o app fechado). Aparece pro técnico que
// ainda não ligou; "Agora não" esconde por 7 dias. Sai sozinho se o navegador não suporta,
// já está ligado ou foi bloqueado (nesse caso o sino explica como liberar).
export function PushPrompt() {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isTech = appUser?.role === "technician" || appUser?.role === "counter_technician";
    if (!isTech || pushService.support() !== "ready") return;
    try {
      const dismissed = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      if (dismissed && Date.now() - dismissed < REPEAT_AFTER_MS) return;
    } catch { /* sem localStorage: mostra mesmo assim */ }
    let cancelled = false;
    pushService.getCurrent().then(sub => { if (!cancelled && !sub) setVisible(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [appUser?.role]);

  if (!visible || !appUser) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ok */ }
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      await pushService.subscribe(appUser.uid);
      toast({ title: "Avisos ativados", description: "Você será avisado das mudanças nas suas rotas mesmo com o app fechado." });
      setVisible(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Não foi possível ativar", description: e?.message || "Tente novamente pelo sino." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-primary/20 bg-primary/5 text-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <BellRing className="h-4 w-4 shrink-0 text-primary" />
          <span>Receba aviso no celular quando uma rota nova chegar ou a sua mudar — mesmo com o app fechado.</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" className="h-7" onClick={enable} disabled={busy}>{busy ? "Ativando..." : "Ativar"}</Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={dismiss} aria-label="Agora não" title="Agora não"><X className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
