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
 */
function parseTatDays(tat: string): number {
  if (!tat) return Infinity;
  const match = tat.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

/**
 * Approximate GPS coordinates for cities in Northeast Brazil (Sergipe, Alagoas, Paraíba, Pernambuco, Bahia)
 */
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Sergipe
  "aracaju": { lat: -10.9472, lng: -37.0731 },
  "nossa senhora do socorro": { lat: -10.8546, lng: -37.1264 },
  "socorro": { lat: -10.8546, lng: -37.1264 },
  "barra dos coqueiros": { lat: -10.9089, lng: -37.0381 },
  "sao cristovao": { lat: -11.0147, lng: -37.2064 },
  "laranjeiras": { lat: -10.8039, lng: -37.1714 },
  "maruim": { lat: -10.7408, lng: -37.0817 },
  "itabaiana": { lat: -10.6853, lng: -37.4269 },
  "lagarto": { lat: -10.9172, lng: -37.6631 },
  "estancia": { lat: -11.2683, lng: -37.4383 },
  "propria": { lat: -10.2108, lng: -36.8417 },
  "capela": { lat: -10.5036, lng: -37.0528 },
  "igreja nova": { lat: -10.1264, lng: -36.6617 },
  "tobias barreto": { lat: -11.1839, lng: -37.9986 },
  "simao dias": { lat: -10.7439, lng: -37.8108 },
  "nossa senhora da gloria": { lat: -10.2189, lng: -37.4217 },
  "itaporanga d'ajuda": { lat: -10.9972, lng: -37.3056 },
  "japaratuba": { lat: -10.5939, lng: -36.9381 },
  "neopolis": { lat: -10.3208, lng: -36.5794 },

  // Alagoas
  "maceio": { lat: -9.6658, lng: -35.7353 },
  "arapiraca": { lat: -9.7517, lng: -36.6606 },
  "penedo": { lat: -10.2906, lng: -36.5864 },
  "palmeira dos indios": { lat: -9.4072, lng: -36.6264 },
  "delmiro gouveia": { lat: -9.3878, lng: -37.9981 },
  "uniao dos palmares": { lat: -9.1628, lng: -36.0317 },
  "coruripe": { lat: -10.1256, lng: -36.1756 },
  "rio largo": { lat: -9.4789, lng: -35.8528 },
  "marechal deodoro": { lat: -9.7117, lng: -35.8956 },
  "campo alegre": { lat: -9.7817, lng: -36.3508 },
  "sao miguel dos campos": { lat: -9.7811, lng: -36.0944 },

  // Paraíba
  "joao pessoa": { lat: -7.1195, lng: -34.8450 },
  "campina grande": { lat: -7.2219, lng: -35.8828 },
  "santa rita": { lat: -7.1139, lng: -34.9781 },
  "patos": { lat: -7.0264, lng: -37.2797 },
  "bayeux": { lat: -7.1256, lng: -34.9328 },
  "cabedelo": { lat: -6.9811, lng: -34.8339 },

  // Pernambuco
  "recife": { lat: -8.0476, lng: -34.8770 },
  "olinda": { lat: -8.0089, lng: -34.8553 },
  "jaboatao dos guararapes": { lat: -8.1131, lng: -35.0147 },
  "caruaru": { lat: -8.2839, lng: -35.9761 },
  "petrolina": { lat: -9.3892, lng: -40.5028 },
  "garanhuns": { lat: -8.8906, lng: -36.4928 },

  // Bahia
  "salvador": { lat: -12.9777, lng: -38.5016 },
  "feira de santana": { lat: -12.2664, lng: -38.9664 },
  "alagoinhas": { lat: -12.1356, lng: -38.4192 },
  "paulo afonso": { lat: -9.4069, lng: -38.2208 },
  "juazeiro": { lat: -9.4144, lng: -40.5033 },
};

/**
 * Approximate geographic zones for main city neighborhoods to ensure smooth route progression
 */
const NEIGHBORHOOD_ZONES: Record<string, number> = {
  // Aracaju (Norte -> Centro -> Sul)
  "aracaju:porto dantas": 10, "aracaju:soledade": 11, "aracaju:japaozinho": 12, "aracaju:coqueiral": 13,
  "aracaju:bugio": 15, "aracaju:jardim centenario": 16, "aracaju:olaria": 17, "aracaju:santos dumont": 18,
  "aracaju:18 do forte": 20, "aracaju:cidade nova": 21, "aracaju:santo antonio": 22, "aracaju:bairro industrial": 23,
  "aracaju:centro": 30, "aracaju:getulio vargas": 31, "aracaju:cirurgia": 32, "aracaju:suissa": 33,
  "aracaju:siqueira campos": 34, "aracaju:america": 35, "aracaju:novo paraiso": 36, "aracaju:jose conrado de araujo": 37,
  "aracaju:sao jose": 38, "aracaju:treze de julho": 39,
  "aracaju:salgado filho": 40, "aracaju:grageru": 41, "aracaju:jardins": 42, "aracaju:luzia": 43,
  "aracaju:ponto novo": 44, "aracaju:inacio barbosa": 45, "aracaju:jabotiana": 46, "aracaju:jk": 47,
  "aracaju:farolandia": 50, "aracaju:augusto franco": 51, "aracaju:coroa do meio": 52, "aracaju:atalaia": 53,
  "aracaju:aruana": 54, "aracaju:robalo": 55, "aracaju:zona de expansao": 56, "aracaju:mosqueiro": 57,

  // Maceió (Centro -> Farol -> Orla -> Tabuleiro)
  "maceio:pontal da barra": 10, "maceio:trapiche da barra": 11, "maceio:prado": 12, "maceio:jaragua": 13,
  "maceio:centro": 14, "maceio:poco": 15, "maceio:pajucara": 16, "maceio:ponta verde": 17, "maceio:jatiuca": 18, "maceio:cruz das almas": 19,
  "maceio:farol": 25, "maceio:pinheiro": 26, "maceio:bebedouro": 27, "maceio:mutange": 28,
  "maceio:tabuleiro do martins": 35, "maceio:cleto marques luz": 36, "maceio:santa lucia": 37,
  "maceio:benedito bentes": 40,

  // Campina Grande
  "campina grande:centro": 10, "campina grande:prata": 12, "campina grande:alto branco": 14, "campina grande:lauritzen": 15,
  "campina grande:catole": 20, "campina grande:tres irmas": 22, "campina grande:liberdade": 24, "campina grande:cruzeiro": 25,
  "campina grande:bodocongo": 30, "campina grande:malvinas": 32,
};

function getNeighborhoodZoneScore(cityKey: string, nKey: string): number {
  const fullKey = `${cityKey}:${nKey}`;
  return NEIGHBORHOOD_ZONES[fullKey] ?? NEIGHBORHOOD_ZONES[nKey] ?? 100;
}

/**
 * Calculates approximate distance in km between two cities.
 */
function getCityDistance(cityA: string, cityB: string): number {
  const normA = normalize(cityA);
  const normB = normalize(cityB);
  if (normA === normB) return 0;

  const coordA = CITY_COORDINATES[normA];
  const coordB = CITY_COORDINATES[normB];

  if (coordA && coordB) {
    const dLat = (coordB.lat - coordA.lat) * Math.PI / 180;
    const dLng = (coordB.lng - coordA.lng) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(coordA.lat * Math.PI / 180) * Math.cos(coordB.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
  }

  return 100;
}

/**
 * Optimizes the order of route stops starting from an origin/departure city (Base)
 * using Nearest Neighbor TSP clustering.
 *
 * Hierarchical Optimization:
 * 1. CIDADE: Nearest-Neighbor TSP starting from originCity (Base).
 * 2. BAIRRO: Strict grouping by neighborhood + geographic zone sequence.
 * 3. PARADA/OS: Sorted by TAT urgency (LP/OW priority) within each neighborhood.
 *
 * @param stops - Array of RouteStop objects
 * @param originCity - Departure/Return base city (e.g. "Aracaju")
 * @returns New array with stops reordered for optimal route circuit
 */
export function optimizeRouteStops(stops: RouteStop[], originCity: string = "Aracaju"): RouteStop[] {
  if (!stops || stops.length <= 1) return stops;

  // Step 1: Group by city
  const cityMap = new Map<string, { rawName: string; stops: RouteStop[] }>();
  for (const stop of stops) {
    const cityKey = normalize(stop.city) || "sem_cidade";
    if (!cityMap.has(cityKey)) {
      cityMap.set(cityKey, { rawName: stop.city || "Sem Cidade", stops: [] });
    }
    cityMap.get(cityKey)!.stops.push(stop);
  }

  // Step 2: Nearest-Neighbor TSP city ordering starting from originCity
  const unvisited = new Set(cityMap.keys());
  const orderedCityKeys: string[] = [];

  let currentCityKey = normalize(originCity);
  if (!cityMap.has(currentCityKey) && unvisited.size > 0) {
    // Find closest city in route to the requested origin
    let closestKey = Array.from(unvisited)[0];
    let minDistance = Infinity;
    for (const key of unvisited) {
      const d = getCityDistance(originCity, cityMap.get(key)!.rawName);
      if (d < minDistance) {
        minDistance = d;
        closestKey = key;
      }
    }
    currentCityKey = closestKey;
  }

  while (unvisited.size > 0) {
    if (unvisited.has(currentCityKey)) {
      orderedCityKeys.push(currentCityKey);
      unvisited.delete(currentCityKey);
    }

    if (unvisited.size === 0) break;

    // Find nearest next city
    let nearestKey = Array.from(unvisited)[0];
    let minDistance = Infinity;

    for (const candidateKey of unvisited) {
      const d = getCityDistance(
        cityMap.get(currentCityKey)?.rawName || currentCityKey,
        cityMap.get(candidateKey)?.rawName || candidateKey
      );
      if (d < minDistance) {
        minDistance = d;
        nearestKey = candidateKey;
      }
    }

    currentCityKey = nearestKey;
  }

  // Step 3: Flatten ordered cities with neighborhood & TAT sorting inside
  const result: RouteStop[] = [];

  for (const cityKey of orderedCityKeys) {
    const cityData = cityMap.get(cityKey);
    if (!cityData) continue;

    // Group stops strictly by neighborhood
    const neighborhoodMap = new Map<string, RouteStop[]>();
    for (const stop of cityData.stops) {
      const nKey = normalize(stop.neighborhood) || "sem_bairro";
      if (!neighborhoodMap.has(nKey)) neighborhoodMap.set(nKey, []);
      neighborhoodMap.get(nKey)!.push(stop);
    }

    // Sort neighborhoods by geographic zone score first, then by stop count
    const sortedNeighborhoods = [...neighborhoodMap.entries()].sort(
      ([keyA, listA], [keyB, listB]) => {
        const scoreA = getNeighborhoodZoneScore(cityKey, keyA);
        const scoreB = getNeighborhoodZoneScore(cityKey, keyB);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return listB.length - listA.length;
      }
    );

    for (const [, neighborhoodStops] of sortedNeighborhoods) {
      // Sort within neighborhood by TAT ascending (most urgent first)
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
export function describeOptimization(
  original: RouteStop[],
  optimized: RouteStop[],
  originCity: string = "Aracaju"
): string {
  const cities = new Set(optimized.map(s => s.city).filter(Boolean));
  const neighborhoods = new Set(optimized.map(s => s.neighborhood).filter(Boolean));
  return `Circuito otimizado a partir de ${originCity}: ${optimized.length} paradas em ${cities.size} cidade(s) e ${neighborhoods.size} bairro(s), organizadas com agrupamento estrito por bairro e percurso de retorno à base.`;
}
