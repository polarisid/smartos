import type { RouteStop } from "./data";
import { getCoordinates, parseFullAddress } from "./geocode";
import { fetchOsrmDrivingMatrix, haversineDistanceKm, type PointCoord } from "./routingEngine";

const DEFAULT_BASE: PointCoord = { lat: -10.9142, lng: -37.0545 }; // Base Aracaju
const FALLBACK_KMH = 40; // usado só quando OSRM está indisponível

export async function geocodeStop(stop: RouteStop): Promise<[number, number] | null> {
  return getCoordinates(
    stop.city,
    stop.neighborhood,
    stop.state || "Sergipe",
    stop.addressDetails,
    stop.zipCode
  );
}

export async function geocodeBase(baseAddress: string): Promise<[number, number] | null> {
  const { city, state, street } = parseFullAddress(baseAddress);
  return getCoordinates(city || "Aracaju", "", state || "Sergipe", street || baseAddress);
}

export type LegDistancesAndDurations = {
  km: number[];
  durationMin: number[];
};

/**
 * Km e minutos reais de deslocamento por trecho, para o circuito fechado
 * Base → parada 1 → ... → parada N → Base. Usa a mesma matriz OSRM
 * (distância + duração) já usada pela otimização, com fallback Haversine.
 */
export async function fetchLegDistancesAndDurations(
  stops: RouteStop[],
  baseAddress: string
): Promise<LegDistancesAndDurations> {
  const [baseCoord, ...stopCoords] = await Promise.all([
    geocodeBase(baseAddress),
    ...stops.map(geocodeStop),
  ]);

  const base: PointCoord = baseCoord ? { lat: baseCoord[0], lng: baseCoord[1] } : DEFAULT_BASE;
  const points: PointCoord[] = [
    base,
    ...stopCoords.map(c => (c ? { lat: c[0], lng: c[1] } : base)),
    base,
  ];

  if (points.length < 2) return { km: [], durationMin: [] };
  const n = points.length - 1;

  const matrix = await fetchOsrmDrivingMatrix(points);
  if (matrix) {
    const km: number[] = [];
    const durationMin: number[] = [];
    for (let i = 0; i < n; i++) {
      const meters = matrix.distanceMatrix[i]?.[i + 1] ?? 0;
      const seconds = matrix.durationMatrix[i]?.[i + 1] ?? 0;
      km.push(Math.round((meters / 1000) * 10) / 10);
      durationMin.push(Math.round(seconds / 60));
    }
    if (km.some(v => v > 0)) return { km, durationMin };
  }

  // Fallback Haversine (OSRM indisponível)
  const km: number[] = [];
  const durationMin: number[] = [];
  for (let i = 0; i < n; i++) {
    const legKm = Math.round(haversineDistanceKm(points[i], points[i + 1]) * 10) / 10;
    km.push(legKm);
    durationMin.push(Math.round((legKm / FALLBACK_KMH) * 60));
  }
  return { km, durationMin };
}
