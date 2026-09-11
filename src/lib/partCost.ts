import type { PartCostParams } from "@/lib/data";

export const DEFAULT_PART_COST_PARAMS: PartCostParams = {
  marginPct: 30,
  laborCostPerHour: 0,
};

export type PartCostLine = {
  cost: number;
  marginValue: number;
  laborMinutes: number;
  laborCost: number;
  finalValue: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aplica a margem sobre o valor de custo e soma o custo de mão de obra
 * estimado (tempo de troca x valor/hora) para chegar no valor final da peça.
 */
export function computePartFinalValue(cost: number, marginPct: number, laborMinutes: number, laborCostPerHour: number): PartCostLine {
  const safeCost = Math.max(0, cost);
  const marginValue = safeCost * ((marginPct || 0) / 100);
  const laborCost = (Math.max(0, laborMinutes) / 60) * (laborCostPerHour || 0);
  return {
    cost: round2(safeCost),
    marginValue: round2(marginValue),
    laborMinutes: Math.max(0, laborMinutes),
    laborCost: round2(laborCost),
    finalValue: round2(safeCost + marginValue + laborCost),
  };
}
