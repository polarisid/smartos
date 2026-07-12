import React, { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

export type AutoSaveStatus = "idle" | "saving" | "saved";

interface AutoSaveIndicatorProps {
  status: AutoSaveStatus;
}

export function AutoSaveIndicator({ status }: AutoSaveIndicatorProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status !== "idle") {
      setVisible(true);
    } else {
      // Small timeout to fade out before hiding completely
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
        status === "saving"
          ? "bg-amber-100/10 text-amber-500 border border-amber-500/25"
          : status === "saved"
          ? "bg-emerald-100/10 text-emerald-500 border border-emerald-500/25 animate-in fade-in"
          : "opacity-0"
      }`}
    >
      {status === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
          <span className="text-[10px] sm:text-xs">Salvando...</span>
        </>
      ) : (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          <span className="text-[10px] sm:text-xs">Salvo</span>
        </>
      )}
    </div>
  );
}
