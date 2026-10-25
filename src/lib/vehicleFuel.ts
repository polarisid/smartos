import type { Vehicle, VehicleFuelLog } from "@/lib/data";

export type FuelLogStats = {
  /** Km rodados desde o abastecimento de tanque cheio anterior. */
  kmSincePrev: number;
  /** Litros colocados desde então (inclui abastecimentos parciais no meio do caminho). */
  litersSincePrev: number;
  /** km/l real do trecho. */
  kml: number;
  /** R$ por km do trecho. */
  costPerKm: number;
};

/**
 * Consumo pelo método do "tanque cheio": só um abastecimento de tanque cheio fecha um trecho, e o
 * combustível dele (mais o dos parciais no meio) é o que foi gasto desde o tanque cheio anterior.
 * Retorna um mapa id do abastecimento -> estatísticas; abastecimentos sem trecho fechado ficam de fora
 * (o primeiro tanque cheio, parciais, ou hodômetro sem avanço).
 */
export function computeFuelStats(logs: VehicleFuelLog[]): Map<string, FuelLogStats> {
  const stats = new Map<string, FuelLogStats>();
  const sorted = [...logs].sort((a, b) => a.odometerKm - b.odometerKm || a.fuelDate.localeCompare(b.fuelDate));

  let prevFullOdometer: number | null = null;
  let litersAcc = 0;
  let valueAcc = 0;
  for (const log of sorted) {
    if (prevFullOdometer !== null) {
      litersAcc += log.liters;
      valueAcc += log.totalValue;
    }
    if (!log.fullTank) continue;
    if (prevFullOdometer !== null) {
      const km = log.odometerKm - prevFullOdometer;
      if (km > 0 && litersAcc > 0) {
        stats.set(log.id, { kmSincePrev: km, litersSincePrev: litersAcc, kml: km / litersAcc, costPerKm: valueAcc / km });
      }
    }
    prevFullOdometer = log.odometerKm;
    litersAcc = 0;
    valueAcc = 0;
  }
  return stats;
}

/** Quanto o consumo real ficou abaixo do de referência do veículo (0.2 = 20% pior). Negativo = melhor. */
export function consumptionDeficit(kml: number, referenceKml?: number): number | null {
  if (!referenceKml || referenceKml <= 0) return null;
  return (referenceKml - kml) / referenceKml;
}

export type RentalStatus = {
  usedKm: number | null;
  limitKm: number | null;
  /** 0..n (1 = franquia toda usada). */
  usedRatio: number | null;
  daysToReturn: number | null;
};

/** Situação do contrato de um veículo locado: franquia de km usada e dias até a devolução. */
export function rentalStatus(v: Vehicle, today: Date = new Date()): RentalStatus {
  let usedKm: number | null = null;
  if (v.rentalStartOdometerKm != null && v.currentOdometerKm != null) {
    usedKm = Math.max(0, v.currentOdometerKm - v.rentalStartOdometerKm);
  }
  const limitKm = v.rentalKmLimit ?? null;
  const usedRatio = usedKm != null && limitKm ? usedKm / limitKm : null;

  let daysToReturn: number | null = null;
  if (v.rentalEndDate) {
    const end = new Date(`${v.rentalEndDate}T00:00:00`);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    daysToReturn = Math.round((end.getTime() - start.getTime()) / 86400000);
  }
  return { usedKm, limitKm, usedRatio, daysToReturn };
}
