import { getCoordinates, parseFullAddress } from "@/lib/geocode";
import type { RouteStop } from "@/lib/data";

const CHUNK_SIZE = 25;
const DEFAULT_BASE: [number, number] = [-10.9142, -37.0545]; // Aracaju

async function coordOf(stop: RouteStop, defaultState: string = "Sergipe"): Promise<[number, number] | null> {
  return getCoordinates(
    stop.city,
    stop.neighborhood,
    stop.state || defaultState,
    stop.addressDetails,
    stop.zipCode
  );
}

async function baseCoord(baseAddress: string): Promise<[number, number]> {
  const { city, state, street } = parseFullAddress(baseAddress);
  const c = await getCoordinates(city || "Aracaju", "", state || "Sergipe", street || baseAddress);
  return c ?? DEFAULT_BASE;
}

function waypoint([lat, lng]: [number, number]) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

async function optimizeChunk(
  originCoord: [number, number],
  chunk: RouteStop[],
  destCoord: [number, number],
  apiKey: string,
  defaultState: string
): Promise<RouteStop[]> {
  if (chunk.length <= 1) return chunk;

  const coords = await Promise.all(chunk.map(stop => coordOf(stop, defaultState)));
  const intermediates = coords.map((c) => waypoint(c ?? originCoord));

  const body = {
    origin: waypoint(originCoord),
    destination: waypoint(destCoord),
    intermediates,
    travelMode: "DRIVE",
    optimizeWaypointOrder: true,
  };

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Google Routes ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  const order: number[] | undefined = json?.routes?.[0]?.optimizedIntermediateWaypointIndex;

  if (!Array.isArray(order) || order.length !== chunk.length) {
    return chunk;
  }
  return order.map((idx) => chunk[idx]);
}

/**
 * Otimiza a ordem das paradas usando o Google Routes API.
 * Em caso de erro, devolve a ordem original + a mensagem.
 */
export async function optimizeWithGoogle(
  stops: RouteStop[],
  baseAddress: string
): Promise<{ stops: RouteStop[]; error?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return { stops, error: "Chave da Google Maps API não configurada (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)." };
  }
  if (stops.length < 2) return { stops };

  try {
    const { state: baseState } = parseFullAddress(baseAddress);
    const defaultState = baseState || "Sergipe";
    const base = await baseCoord(baseAddress);

    const chunks: RouteStop[][] = [];
    for (let i = 0; i < stops.length; i += CHUNK_SIZE) {
      chunks.push(stops.slice(i, i + CHUNK_SIZE));
    }

    const result: RouteStop[] = [];
    let originCoord = base;

    for (const chunk of chunks) {
      const optimized = await optimizeChunk(originCoord, chunk, base, apiKey, defaultState);
      result.push(...optimized);

      const lastCoord = await coordOf(optimized[optimized.length - 1], defaultState);
      originCoord = lastCoord ?? base;
    }

    return { stops: result };
  } catch (e: any) {
    return { stops, error: e?.message || "Falha ao otimizar via Google Routes." };
  }
}

/**
 * Resumo determinístico a partir dos km reais (OSRM). Nunca mente sobre a economia.
 */
export function buildGoogleSummary(
  origTotalKm: number,
  propTotalKm: number,
  movedCount: number,
  totalStops: number
): string {
  const saved = origTotalKm - propTotalKm;
  const pct = origTotalKm > 0 ? Math.round((saved / origTotalKm) * 100) : 0;

  if (movedCount === 0) {
    return "O Google Routes avaliou a rota e a ordem atual já é a mais eficiente — nenhuma parada precisou ser movida.";
  }
  if (saved <= 0.5) {
    return `Ordem reorganizada pelo Google Routes (${movedCount} de ${totalStops} paradas), mas o percurso total ficou praticamente igual em distância.`;
  }
  return `Ordem otimizada pelo Google Routes: ${movedCount} de ${totalStops} paradas reordenadas, reduzindo o percurso em ${saved.toFixed(1)} km (${pct}%).`;
}