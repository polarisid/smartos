import React from "react";
import { Monitor, Refrigerator } from "lucide-react";

interface EquipmentToggleProps {
  value: string;
  onChange: (val: string) => void;
}

export function EquipmentToggle({ value, onChange }: EquipmentToggleProps) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      <button
        type="button"
        onClick={() => onChange("TV/AV")}
        className={`flex items-center justify-center gap-2.5 h-12 rounded-xl border text-sm font-semibold transition-all duration-200 ${
          value === "TV/AV"
            ? "border-[#1a85ff] bg-[#1a85ff]/10 text-[#1a85ff] shadow-sm shadow-[#1a85ff]/5"
            : "border-border bg-card/45 text-muted-foreground hover:bg-card/85 hover:text-foreground"
        }`}
      >
        <Monitor className="h-4 w-4" />
        <span>TV/AV</span>
      </button>

      <button
        type="button"
        onClick={() => onChange("DA")}
        className={`flex items-center justify-center gap-2.5 h-12 rounded-xl border text-sm font-semibold transition-all duration-200 ${
          value === "DA"
            ? "border-[#1a85ff] bg-[#1a85ff]/10 text-[#1a85ff] shadow-sm shadow-[#1a85ff]/5"
            : "border-border bg-card/45 text-muted-foreground hover:bg-card/85 hover:text-foreground"
        }`}
      >
        <Refrigerator className="h-4 w-4" />
        <span>Linha Branca (DA)</span>
      </button>
    </div>
  );
}
