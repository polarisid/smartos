import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { AutoSaveIndicator, AutoSaveStatus } from "./AutoSaveIndicator";

interface FormBottomBarProps {
  currentStep: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => void;
  isFinalized: boolean;
  isSubmitting?: boolean;
  onClear: () => void;
  autoSaveStatus: AutoSaveStatus;
}

export function FormBottomBar({
  currentStep,
  totalSteps,
  onPrev,
  onNext,
  onSubmit,
  isFinalized,
  isSubmitting = false,
  onClear,
  autoSaveStatus,
}: FormBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[#161B26] border-t border-border/40 flex items-center justify-between gap-3 md:relative md:bg-transparent md:border-none md:p-0 md:mt-6 animate-in slide-in-from-bottom duration-300">
      {/* Left side actions: Clear Form or Go Back */}
      <div className="flex items-center gap-2">
        {currentStep === 1 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="h-11 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
            title="Limpar formulário"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline ml-1.5 text-xs font-semibold">Limpar</span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={onPrev}
            className="h-11 px-4 text-muted-foreground hover:text-foreground hover:bg-muted/10 rounded-xl flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs font-semibold">Voltar</span>
          </Button>
        )}
      </div>

      {/* Auto-save Status Indicator */}
      <div className="hidden xs:block">
        <AutoSaveIndicator status={autoSaveStatus} />
      </div>

      {/* Right side: Next Step / Submit OS */}
      <div>
        {currentStep < totalSteps ? (
          <Button
            type="button"
            onClick={onNext}
            className="h-11 px-6 bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm rounded-full shadow-lg shadow-blue-500/10 flex items-center gap-2"
          >
            <span>Avançar</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={onSubmit}
            className={`h-11 px-6 text-white font-semibold text-sm rounded-full shadow-lg flex items-center gap-2 ${
              isFinalized
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10"
                : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/10"
            }`}
          >
            {isFinalized ? (
              <>
                <CheckCircle className="h-4 w-4" />
                <span>Salvar OS</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                <span>Salvar Pendência</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
