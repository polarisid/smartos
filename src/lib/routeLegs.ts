import type { RouteStop, RoutePoint } from "./data";
import { getCoordinates, parseFullAddress } from "./geocode";
import { fetchOsrmDrivingMatrix, haversineDistanceKm, type PointCoord } from "./routingEngine";
import { configService } from "@/services/supabase/configService";

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

export async function geocodeBase(baseAddress: string, unidadeId?: string | null): Promise<[number, number] | null> {
  // Pino fixado manualmente nas Configurações tem prioridade sobre
  // geocodificar o texto do endereço.
  const storedCoords = await configService.getBaseCoords(unidadeId);
  if (storedCoords) return [storedCoords.lat, storedCoords.lng];

  const { city, state, street } = parseFullAddress(baseAddress);
  return getCoordinates(city || "Aracaju", "", state || "Sergipe", street || baseAddress);
}

export type LegDistancesAndDurations = {
  km: number[];
  durationMin: number[];
};

// Saída/chegada específicas da rota (opcionais): sem elas, base da unidade.
export type RouteEndpoints = { start?: RoutePoint | null; end?: RoutePoint | null };

/**
 * Matriz de minutos de viagem entre todos os pontos: índice 0 = saída, 1..N = paradas
 * (na ordem recebida), N+1 = chegada. Usada pra testar várias ordens sem refazer
 * chamadas de rota a cada tentativa. Fallback Haversine se o OSRM estiver fora.
 */
export async function fetchDurationMatrixMin(
  stops: RouteStop[],
  baseAddress: string,
  unidadeId?: string | null,
  endpoints?: RouteEndpoints
): Promise<number[][]> {
  const [baseCoord, ...stopCoords] = await Promise.all([
    geocodeBase(baseAddress, unidadeId),
    ...stops.map(geocodeStop),
  ]);
  const base: PointCoord = baseCoord ? { lat: baseCoord[0], lng: baseCoord[1] } : DEFAULT_BASE;
  const start: PointCoord = endpoints?.start ? { lat: endpoints.start.lat, lng: endpoints.start.lng } : base;
  const end: PointCoord = endpoints?.end ? { lat: endpoints.end.lat, lng: endpoints.end.lng } : base;
  const points: PointCoord[] = [start, ...stopCoords.map(c => (c ? { lat: c[0], lng: c[1] } : start)), end];

  const matrix = await fetchOsrmDrivingMatrix(points);
  const n = points.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) { row.push(0); continue; }
      const sec = matrix?.durationMatrix[i]?.[j];
      row.push(typeof sec === "number" && sec >= 0
        ? Math.round(sec / 60)
        : Math.round((haversineDistanceKm(points[i], points[j]) / FALLBACK_KMH) * 60));
    }
    out.push(row);
  }
  return out;
}

/**
 * Km e minutos reais de deslocamento por trecho, para o circuito
 * Saída → parada 1 → ... → parada N → Chegada (saída e chegada = base da
 * unidade, a não ser que a rota tenha pontos próprios). Usa a mesma matriz
 * OSRM (distância + duração) já usada pela otimização, com fallback Haversine.
 */
export async function fetchLegDistancesAndDurations(
  stops: RouteStop[],
  baseAddress: string,
  unidadeId?: string | null,
  endpoints?: RouteEndpoints
): Promise<LegDistancesAndDurations> {
  const [baseCoord, ...stopCoords] = await Promise.all([
    geocodeBase(baseAddress, unidadeId),
    ...stops.map(geocodeStop),
  ]);

  const base: PointCoord = baseCoord ? { lat: baseCoord[0], lng: baseCoord[1] } : DEFAULT_BASE;
  const start: PointCoord = endpoints?.start ? { lat: endpoints.start.lat, lng: endpoints.start.lng } : base;
  const end: PointCoord = endpoints?.end ? { lat: endpoints.end.lat, lng: endpoints.end.lng } : base;
  const points: PointCoord[] = [
    start,
    ...stopCoords.map(c => (c ? { lat: c[0], lng: c[1] } : start)),
    end,
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
