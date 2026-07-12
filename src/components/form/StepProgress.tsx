import React from "react";
import { Progress } from "@/components/ui/progress";
import { LucideIcon } from "lucide-react";

interface Step {
  step: number;
  title: string;
  icon: LucideIcon;
}

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: Step[];
}

export function StepProgress({ currentStep, totalSteps, steps }: StepProgressProps) {
  const percent = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full space-y-4 md:space-y-6">
      {/* Horizontal Progress Bar */}
      <div className="relative w-full h-[3px] bg-muted dark:bg-[#1E2436] rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-[#1a85ff] transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Step Badges Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide select-none">
        {steps.map((s, index) => {
          const Icon = s.icon;
          const isActive = currentStep === s.step;
          const isCompleted = currentStep > s.step;

          return (
            <div key={s.step} className="flex items-center min-w-max">
              <div
                className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 ${
                  isActive
                    ? "border-[#1a85ff] bg-[#1a85ff]/15 text-[#1a85ff] dark:bg-[#1a85ff] dark:text-white"
                    : isCompleted
                    ? "border-[#1a85ff]/40 bg-[#1a85ff]/5 text-[#1a85ff]/80"
                    : "border-muted bg-transparent text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>
                  {s.step}. {s.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-4 md:w-8 h-[1px] ml-2 ${
                    isCompleted ? "bg-[#1a85ff]/50" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
