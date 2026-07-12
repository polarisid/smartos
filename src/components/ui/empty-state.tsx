import React from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 text-center border-2 border-dashed border-border/40 rounded-xl bg-card/20 backdrop-blur-sm animate-in fade-in zoom-in duration-300">
      <div className="p-4 bg-primary/10 rounded-full text-primary mb-4 animate-bounce-slow">
        <Icon className="h-10 w-10 opacity-80" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {action && <div className="animate-in fade-in slide-in-from-bottom-2 delay-100">{action}</div>}
    </div>
  );
}
