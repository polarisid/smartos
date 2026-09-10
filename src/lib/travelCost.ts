import type { TravelCostParams } from "@/lib/data";

export const DEFAULT_TRAVEL_COST_PARAMS: TravelCostParams = {
  costPerKm: 2.5,
  fixedFee: 0,
  costPerHour: 0,
  tollFlat: 0,
  roundTrip: true,
  marginPct: 0,
  minFee: 0,
};

export type VisitCostBreakdown = {
  oneWayKm: number;
  oneWayMinutes: number;
  distanceKm: number;   // já com ida+volta, se aplicável
  timeMinutes: number;  // já com ida+volta, se aplicável
  kmCost: number;
  timeCost: number;
  fixedFee: number;
  tollFlat: number;
  subtotal: number;     // soma dos custos, antes da margem
  marginValue: number;  // R$ adicionados pela margem
  visitFee: number;     // valor final cobrado do cliente
  minFeeApplied: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Calcula a taxa de visita a partir da distância/tempo rodoviário (OSRM) e dos
 * parâmetros de custo configurados no SmartOS.
 */
export function computeVisitCost(
  params: TravelCostParams,
  roadKm: number,
  roadDurationSeconds: number
): VisitCostBreakdown {
  const oneWayKm = Math.max(0, roadKm);
  const oneWayMinutes = Math.max(0, roadDurationSeconds / 60);
  const mult = params.roundTrip ? 2 : 1;

  const distanceKm = oneWayKm * mult;
  const timeMinutes = oneWayMinutes * mult;

  const kmCost = distanceKm * (params.costPerKm || 0);
  const timeCost = (timeMinutes / 60) * (params.costPerHour || 0);
  const fixedFee = params.fixedFee || 0;
  const tollFlat = params.tollFlat || 0;

  const subtotal = kmCost + timeCost + fixedFee + tollFlat;
  const marginValue = subtotal * ((params.marginPct || 0) / 100);
  const withMargin = subtotal + marginValue;
  const visitFee = Math.max(withMargin, params.minFee || 0);

  return {
    oneWayKm: round2(oneWayKm),
    oneWayMinutes: Math.round(oneWayMinutes),
    distanceKm: round2(distanceKm),
    timeMinutes: Math.round(timeMinutes),
    kmCost: round2(kmCost),
    timeCost: round2(timeCost),
    fixedFee: round2(fixedFee),
    tollFlat: round2(tollFlat),
    subtotal: round2(subtotal),
    marginValue: round2(marginValue),
    visitFee: round2(visitFee),
    minFeeApplied: (params.minFee || 0) > withMargin,
  };
}
