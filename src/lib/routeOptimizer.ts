import { type RouteStop } from "@/lib/data";

/**
 * Normalizes a string for comparison: lowercase, no accents, trimmed.
 */
function normalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Parses a TAT string like "5 days", "3 dias", "10d" into a number of days.
 * Returns Infinity if not parseable (treat as least urgent).
 */
function parseTatDays(tat: string): number {
  if (!tat) return Infinity;
  const match = tat.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

/**
 * Optimizes the order of route stops by grouping geographically
 * (city → neighborhood) and sorting by urgency (TAT) within each group.
 *
 * Algorithm:
 * 1. Group stops by normalized city name.
 * 2. Sort cities by descending stop count (denser cities first = more efficient).
 * 3. Within each city, group by neighborhood.
 * 4. Within each neighborhood, sort by TAT ascending (most urgent first).
 * 5. Flatten into a single ordered list.
 *
 * @param stops - Array of RouteStop objects to optimize
 * @returns New array with stops reordered for geographic efficiency
 */
export function optimizeRouteStops(stops: RouteStop[]): RouteStop[] {
  if (!stops || stops.length <= 1) return stops;

  // Step 1: Group by city
  const cityMap = new Map<string, RouteStop[]>();
  for (const stop of stops) {
    const cityKey = normalize(stop.city) || "sem_cidade";
    if (!cityMap.has(cityKey)) cityMap.set(cityKey, []);
    cityMap.get(cityKey)!.push(stop);
  }

  // Step 2: Sort cities by stop count descending
  const sortedCities = [...cityMap.entries()].sort(
    ([, a], [, b]) => b.length - a.length
  );

  const result: RouteStop[] = [];

  for (const [, cityStops] of sortedCities) {
    // Step 3: Group by neighborhood within the city
    const neighborhoodMap = new Map<string, RouteStop[]>();
    for (const stop of cityStops) {
      const neighborhoodKey = normalize(stop.neighborhood) || "sem_bairro";
      if (!neighborhoodMap.has(neighborhoodKey)) neighborhoodMap.set(neighborhoodKey, []);
      neighborhoodMap.get(neighborhoodKey)!.push(stop);
    }

    // Sort neighborhoods by stop count descending
    const sortedNeighborhoods = [...neighborhoodMap.entries()].sort(
      ([, a], [, b]) => b.length - a.length
    );

    for (const [, neighborhoodStops] of sortedNeighborhoods) {
      // Step 4: Sort within neighborhood by TAT ascending (most urgent first)
      const sortedByTat = [...neighborhoodStops].sort(
        (a, b) => parseTatDays(a.tat) - parseTatDays(b.tat)
      );
      result.push(...sortedByTat);
    }
  }

  return result;
}

/**
 * Returns a human-readable summary of the optimization results.
 */
export function describeOptimization(original: RouteStop[], optimized: RouteStop[]): string {
  const cities = new Set(optimized.map(s => s.city).filter(Boolean));
  const neighborhoods = new Set(optimized.map(s => s.neighborhood).filter(Boolean));
  return `Rota otimizada: ${optimized.length} paradas em ${cities.size} cidade(s) e ${neighborhoods.size} bairro(s), agrupadas por proximidade geográfica.`;
}
