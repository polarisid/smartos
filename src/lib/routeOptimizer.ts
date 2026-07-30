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
/**
 * Approximate GPS coordinates for cities in Northeast Brazil (Sergipe, Alagoas, Bahia, Pernambuco, Paraíba)
 */
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // ── Sergipe (SE) - Todos os 75 municípios ──
  "amparo de sao francisco": { lat: -10.1333, lng: -36.9333 },
  "aquidaba": { lat: -10.2811, lng: -37.0183 },
  "aracaju": { lat: -10.9472, lng: -37.0731 },
  "araua": { lat: -11.2608, lng: -37.6239 },
  "areia branca": { lat: -10.7583, lng: -37.3556 },
  "barra dos coqueiros": { lat: -10.9089, lng: -37.0381 },
  "boquim": { lat: -11.1464, lng: -37.6214 },
  "brejo grande": { lat: -10.4333, lng: -36.4667 },
  "campo do brito": { lat: -10.7331, lng: -37.4928 },
  "canhoba": { lat: -10.1333, lng: -36.9833 },
  "caninde de sao francisco": { lat: -9.6439, lng: -37.7894 },
  "capela": { lat: -10.5036, lng: -37.0528 },
  "carira": { lat: -10.3608, lng: -37.7008 },
  "carmopolis": { lat: -10.6453, lng: -36.9889 },
  "cedro de sao joao": { lat: -10.2528, lng: -36.8839 },
  "cristinapolis": { lat: -11.4747, lng: -37.7553 },
  "cumbe": { lat: -10.3547, lng: -37.1792 },
  "divina pastora": { lat: -10.6789, lng: -37.1478 },
  "estancia": { lat: -11.2683, lng: -37.4383 },
  "feira nova": { lat: -10.2667, lng: -37.3147 },
  "gararu": { lat: -9.9667, lng: -37.0833 },
  "general maynard": { lat: -10.6917, lng: -36.9856 },
  "graccho cardoso": { lat: -10.2264, lng: -37.2028 },
  "ilha das flores": { lat: -10.4333, lng: -36.5333 },
  "indiaroba": { lat: -11.5189, lng: -37.5117 },
  "itabaiana": { lat: -10.6853, lng: -37.4269 },
  "itabaianinha": { lat: -11.2739, lng: -37.7892 },
  "itabi": { lat: -10.1264, lng: -37.1028 },
  "itaporanga d'ajuda": { lat: -10.9961, lng: -37.3056 },
  "itaporanga": { lat: -10.9961, lng: -37.3056 },
  "japaratuba": { lat: -10.5939, lng: -36.9381 },
  "japoata": { lat: -10.3508, lng: -36.8008 },
  "lagarto": { lat: -10.9172, lng: -37.6631 },
  "laranjeiras": { lat: -10.8039, lng: -37.1714 },
  "macambira": { lat: -10.7139, lng: -37.5458 },
  "malhada dos bois": { lat: -10.3500, lng: -36.9333 },
  "malhador": { lat: -10.6578, lng: -37.3064 },
  "maruim": { lat: -10.7408, lng: -37.0817 },
  "moita bonita": { lat: -10.5772, lng: -37.3428 },
  "monte alegre de sergipe": { lat: -10.0264, lng: -37.5611 },
  "muribeca": { lat: -10.4333, lng: -36.9667 },
  "neopolis": { lat: -10.3208, lng: -36.5794 },
  "nossa senhora aparecida": { lat: -10.4439, lng: -37.4892 },
  "aparecida": { lat: -10.4439, lng: -37.4892 },
  "nossa senhora da gloria": { lat: -10.2189, lng: -37.4217 },
  "gloria": { lat: -10.2189, lng: -37.4217 },
  "nossa senhora das dores": { lat: -10.4939, lng: -37.1908 },
  "dores": { lat: -10.4939, lng: -37.1908 },
  "nossa senhora do socorro": { lat: -10.8546, lng: -37.1264 },
  "socorro": { lat: -10.8546, lng: -37.1264 },
  "pacatuba": { lat: -10.4508, lng: -36.6508 },
  "pedra mole": { lat: -10.6139, lng: -37.5189 },
  "pedrinhas": { lat: -11.1897, lng: -37.5258 },
  "pinhao": { lat: -10.5694, lng: -37.5819 },
  "pirambu": { lat: -10.7408, lng: -36.8569 },
  "poco redondo": { lat: -9.8064, lng: -37.6839 },
  "poco verde": { lat: -10.7089, lng: -38.1814 },
  "porto da folha": { lat: -9.9172, lng: -37.2778 },
  "propria": { lat: -10.2108, lng: -36.8417 },
  "riachao do dantas": { lat: -10.9089, lng: -37.7214 },
  "riachuelo": { lat: -10.7783, lng: -37.1856 },
  "ribeiropolis": { lat: -10.5386, lng: -37.4267 },
  "rosario do catete": { lat: -10.6969, lng: -37.0306 },
  "salgado": { lat: -11.0319, lng: -37.4728 },
  "santa luzia do itanhy": { lat: -11.3528, lng: -37.4478 },
  "santana do sao francisco": { lat: -10.2833, lng: -36.6000 },
  "santa rosa de lima": { lat: -10.6483, lng: -37.1953 },
  "santo amaro das brotas": { lat: -10.7889, lng: -36.9897 },
  "sao cristovao": { lat: -11.0147, lng: -37.2064 },
  "sao domingos": { lat: -10.7917, lng: -37.5681 },
  "sao francisco": { lat: -10.3333, lng: -36.8839 },
  "sao miguel do aleixo": { lat: -10.3889, lng: -37.3808 },
  "aleixo": { lat: -10.3889, lng: -37.3808 },
  "simao dias": { lat: -10.7439, lng: -37.8108 },
  "siriri": { lat: -10.6028, lng: -37.1128 },
  "telha": { lat: -10.2117, lng: -36.8839 },
  "tobias barreto": { lat: -11.1839, lng: -37.9986 },
  "tomar do geru": { lat: -11.3739, lng: -37.8428 },
  "umbauba": { lat: -11.3831, lng: -37.6569 },

  // ── Alagoas (AL) ──
  "maceio": { lat: -9.6658, lng: -35.7353 },
  "arapiraca": { lat: -9.7517, lng: -36.6606 },
  "penedo": { lat: -10.2906, lng: -36.5864 },
  "porto real do colegio": { lat: -10.1864, lng: -36.8394 },
  "sao bras": { lat: -10.1311, lng: -36.8839 },
  "igreja nova": { lat: -10.1264, lng: -36.6617 },
  "palmeira dos indios": { lat: -9.4072, lng: -36.6264 },
  "delmiro gouveia": { lat: -9.3878, lng: -37.9981 },
  "uniao dos palmares": { lat: -9.1628, lng: -36.0317 },
  "coruripe": { lat: -10.1256, lng: -36.1756 },
  "rio largo": { lat: -9.4789, lng: -35.8528 },
  "marechal deodoro": { lat: -9.7117, lng: -35.8956 },
  "campo alegre": { lat: -9.7817, lng: -36.3508 },
  "sao miguel dos campos": { lat: -9.7811, lng: -36.0944 },
  "teotonio vilela": { lat: -9.9056, lng: -36.3556 },
  "junqueiro": { lat: -9.9306, lng: -36.4756 },
  "batalha": { lat: -9.6789, lng: -37.1244 },
  "pao de acucar": { lat: -9.7489, lng: -37.4364 },
  "olho d'agua das flores": { lat: -9.5358, lng: -37.2956 },
  "santana do ipanema": { lat: -9.3789, lng: -37.2439 },

  // ── Bahia (BA) ──
  "salvador": { lat: -12.9777, lng: -38.5016 },
  "feira de santana": { lat: -12.2664, lng: -38.9664 },
  "alagoinhas": { lat: -12.1356, lng: -38.4192 },
  "paulo afonso": { lat: -9.4069, lng: -38.2208 },
  "juazeiro": { lat: -9.4144, lng: -40.5033 },
  "rio real": { lat: -11.4839, lng: -37.9333 },
  "jandaira": { lat: -11.5647, lng: -37.5256 },
  "conde": { lat: -11.8139, lng: -37.6117 },
  "esplanada": { lat: -11.7961, lng: -37.9547 },
  "entre rios": { lat: -11.9419, lng: -38.0839 },
  "catu": { lat: -12.3528, lng: -38.3789 },
  "pojuca": { lat: -12.4319, lng: -38.3347 },
  "camacari": { lat: -12.6975, lng: -38.3242 },
  "simoes filho": { lat: -12.7864, lng: -38.4039 },
  "lauro de freitas": { lat: -12.8947, lng: -38.3272 },
  "senhor do bonfim": { lat: -10.4619, lng: -40.1881 },
  "jacobina": { lat: -11.1811, lng: -40.5186 },
  "serrinha": { lat: -11.6608, lng: -39.0069 },
  "ribeira do pombal": { lat: -10.8358, lng: -38.5367 },
  "cipo": { lat: -11.0664, lng: -38.5139 },
  "jeremoabo": { lat: -10.0739, lng: -38.4808 },

  // ── Pernambuco (PE) ──
  "recife": { lat: -8.0476, lng: -34.8770 },
  "olinda": { lat: -8.0089, lng: -34.8553 },
  "jaboatao dos guararapes": { lat: -8.1131, lng: -35.0147 },
  "caruaru": { lat: -8.2839, lng: -35.9761 },
  "petrolina": { lat: -9.3892, lng: -40.5028 },
  "garanhuns": { lat: -8.8906, lng: -36.4928 },
  "arcoverde": { lat: -8.4189, lng: -37.0539 },
  "serra talhada": { lat: -7.9908, lng: -38.2981 },
  "salgueiro": { lat: -8.0739, lng: -39.1197 },

  // ── Paraíba (PB) ──
  "joao pessoa": { lat: -7.1195, lng: -34.8450 },
  "campina grande": { lat: -7.2219, lng: -35.8828 },
  "santa rita": { lat: -7.1139, lng: -34.9781 },
  "patos": { lat: -7.0264, lng: -37.2797 },
  "bayeux": { lat: -7.1256, lng: -34.9328 },
  "cabedelo": { lat: -6.9811, lng: -34.8339 },
  "guarabira": { lat: -6.8539, lng: -35.4889 },
  "sousa": { lat: -6.7619, lng: -38.2258 },
  "cajazeiras": { lat: -6.8889, lng: -38.5583 }
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
/**
 * Resolves approximate coordinates for a city using exact or fuzzy normalized matching.
 */
function getCityCoordinates(cityName: string): { lat: number; lng: number } | null {
  const norm = normalize(cityName)
    .replace(/\bn\.?\s*sra\.?\b/g, "nossa senhora")
    .replace(/\bsto\.?\b/g, "santo")
    .replace(/\bsta\.?\b/g, "santa")
    .replace(/\bs\.?\b/g, "sao")
    .trim();

  if (CITY_COORDINATES[norm]) return CITY_COORDINATES[norm];

  // Try partial key matching
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (norm.length >= 4 && (norm.includes(key) || key.includes(norm))) {
      return coords;
    }
  }

  return null;
}

/**
 * Calculates approximate distance in km between two cities.
 */
function getCityDistance(cityA: string, cityB: string): number {
  const normA = normalize(cityA);
  const normB = normalize(cityB);
  if (normA === normB) return 0;

  const coordA = getCityCoordinates(cityA);
  const coordB = getCityCoordinates(cityB);

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
 * 2-Opt local search refinement for circuit TSP starting and ending at originCity (Base).
 * Repeatedly eliminates crossing edges and un-tangles circuit sequences to minimize total distance.
 */
function apply2Opt(clusterKeys: string[], clusterMap: Map<string, { rawCity: string }>, originCity: string): string[] {
  if (clusterKeys.length <= 2) return clusterKeys;

  let bestRoute = [...clusterKeys];

  const getCityName = (key: string) => {
    return clusterMap.get(key)?.rawCity || key.split('|')[0];
  };

  function calculateTotalCircuitDistance(route: string[]): number {
    if (route.length === 0) return 0;
    let total = getCityDistance(originCity, getCityName(route[0]));
    for (let i = 0; i < route.length - 1; i++) {
      total += getCityDistance(getCityName(route[i]), getCityName(route[i + 1]));
    }
    total += getCityDistance(getCityName(route[route.length - 1]), originCity);
    return total;
  }

  let bestDist = calculateTotalCircuitDistance(bestRoute);
  let improved = true;
  let iterations = 0;
  const maxIterations = 1000;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const candidateRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];

        const candidateDist = calculateTotalCircuitDistance(candidateRoute);
        if (candidateDist < bestDist - 0.001) {
          bestRoute = candidateRoute;
          bestDist = candidateDist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return bestRoute;
}

/**
 * Optimizes the order of route stops starting from an origin/departure city (Base)
 * using 2-Opt refined TSP clustering.
 *
 * Hierarchical Optimization:
 * 1. CIDADE + UF (ESTADO): Grouping by City + State cluster, 2-Opt TSP circuit optimization starting/returning to originCity (Base).
 * 2. BAIRRO: Grouping strictly by neighborhood (bairro) within each city.
 * 3. PARADA/OS: Sorted by TAT urgency (LP/OW priority) within each neighborhood.
 *
 * @param stops - Array of RouteStop objects
 * @param originCity - Departure/Return base city (e.g. "Aracaju")
 * @returns New array with stops reordered for optimal route circuit
 */
export function optimizeRouteStops(stops: RouteStop[], originCity: string = "Aracaju"): RouteStop[] {
  if (!stops || stops.length <= 1) return stops;

  // Step 1: Group by location cluster (Cidade + UF)
  const locationClusterMap = new Map<string, { rawCity: string; rawState: string; stops: RouteStop[] }>();

  for (const stop of stops) {
    const cityNorm = normalize(stop.city) || "sem_cidade";
    const stateNorm = normalize(stop.state) || "se";
    const clusterKey = `${cityNorm}|${stateNorm}`;

    if (!locationClusterMap.has(clusterKey)) {
      locationClusterMap.set(clusterKey, {
        rawCity: stop.city || "Sem Cidade",
        rawState: stop.state || "SE",
        stops: []
      });
    }
    locationClusterMap.get(clusterKey)!.stops.push(stop);
  }

  // Step 2: Nearest-Neighbor initial tour
  const unvisited = new Set(locationClusterMap.keys());
  const initialClusterKeys: string[] = [];

  let currentClusterKey = Array.from(unvisited).find(k => k.startsWith(normalize(originCity))) || Array.from(unvisited)[0];

  while (unvisited.size > 0) {
    if (unvisited.has(currentClusterKey)) {
      initialClusterKeys.push(currentClusterKey);
      unvisited.delete(currentClusterKey);
    }

    if (unvisited.size === 0) break;

    // Find nearest next city cluster
    let nearestKey = Array.from(unvisited)[0];
    let minDistance = Infinity;

    const currentCluster = locationClusterMap.get(currentClusterKey);
    const currentName = currentCluster?.rawCity || currentClusterKey.split('|')[0];

    for (const candidateKey of unvisited) {
      const candidateCluster = locationClusterMap.get(candidateKey);
      const candidateName = candidateCluster?.rawCity || candidateKey.split('|')[0];

      const d = getCityDistance(currentName, candidateName);
      if (d < minDistance) {
        minDistance = d;
        nearestKey = candidateKey;
      }
    }

    currentClusterKey = nearestKey;
  }

  // Step 2b: Apply 2-Opt local search refinement to eliminate crossing paths & optimize circuit loop
  const orderedClusterKeys = apply2Opt(initialClusterKeys, locationClusterMap, originCity);

  // Step 3: Within each City, group strictly by Bairro (Neighborhood)
  const result: RouteStop[] = [];

  for (const clusterKey of orderedClusterKeys) {
    const clusterData = locationClusterMap.get(clusterKey);
    if (!clusterData) continue;

    // Group stops by neighborhood (Bairro)
    const neighborhoodMap = new Map<string, RouteStop[]>();
    for (const stop of clusterData.stops) {
      const nKey = normalize(stop.neighborhood) || "sem_bairro";
      if (!neighborhoodMap.has(nKey)) neighborhoodMap.set(nKey, []);
      neighborhoodMap.get(nKey)!.push(stop);
    }

    // Sort neighborhoods by zone score or stop count
    const sortedNeighborhoods = [...neighborhoodMap.entries()].sort(
      ([keyA, listA], [keyB, listB]) => {
        const scoreA = getNeighborhoodZoneScore(clusterData.rawCity, keyA);
        const scoreB = getNeighborhoodZoneScore(clusterData.rawCity, keyB);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return listB.length - listA.length;
      }
    );

    for (const [, neighborhoodStops] of sortedNeighborhoods) {
      // Sort within neighborhood by TAT urgency (LP/OW priority first)
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
