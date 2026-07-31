const STATE_NAMES: Record<string, string> = {
    'se': 'Sergipe',
    'al': 'Alagoas',
    'ba': 'Bahia',
    'pe': 'Pernambuco',
    'pb': 'Paraíba',
    'rn': 'Rio Grande do Norte',
    'ce': 'Ceará',
    'ma': 'Maranhão',
    'pi': 'Piauí',
    'sp': 'São Paulo',
    'rj': 'Rio de Janeiro',
    'mg': 'Minas Gerais',
    'es': 'Espírito Santo',
    'pr': 'Paraná',
    'sc': 'Santa Catarina',
    'rs': 'Rio Grande do Sul',
    'go': 'Goiás',
    'df': 'Distrito Federal',
    'mt': 'Mato Grosso',
    'ms': 'Mato Grosso do Sul',
};

const CITY_FALLBACK_COORDINATES: Record<string, [number, number]> = {
  // ── Sergipe (SE) - Todos os 75 municípios ──
  "amparo de sao francisco": [-10.1333, -36.9333],
  "aquidaba": [-10.2811, -37.0183],
  "aracaju": [-10.9472, -37.0731],
  "araua": [-11.2608, -37.6239],
  "areia branca": [-10.7583, -37.3556],
  "barra dos coqueiros": [-10.9089, -37.0381],
  "boquim": [-11.1464, -37.6214],
  "brejo grande": [-10.4333, -36.4667],
  "campo do brito": [-10.7331, -37.4928],
  "canhoba": [-10.1333, -36.9833],
  "caninde de sao francisco": [-9.6439, -37.7894],
  "capela": [-10.5036, -37.0528],
  "carira": [-10.3608, -37.7008],
  "carmopolis": [-10.6453, -36.9889],
  "cedro de sao joao": [-10.2528, -36.8839],
  "cristinapolis": [-11.4747, -37.7553],
  "cumbe": [-10.3547, -37.1792],
  "divina pastora": [-10.6789, -37.1478],
  "estancia": [-11.2683, -37.4383],
  "feira nova": [-10.2667, -37.3147],
  "gararu": [-9.9667, -37.0833],
  "general maynard": [-10.6917, -36.9856],
  "graccho cardoso": [-10.2264, -37.2028],
  "ilha das flores": [-10.4333, -36.5333],
  "indiaroba": [-11.5189, -37.5117],
  "itabaiana": [-10.6853, -37.4269],
  "itabaianinha": [-11.2739, -37.7892],
  "itabi": [-10.1264, -37.1028],
  "itaporanga d'ajuda": [-10.9961, -37.3056],
  "itaporanga": [-10.9961, -37.3056],
  "japaratuba": [-10.5939, -36.9381],
  "japoata": [-10.3508, -36.8008],
  "lagarto": [-10.9172, -37.6631],
  "laranjeiras": [-10.8039, -37.1714],
  "macambira": [-10.7139, -37.5458],
  "malhada dos bois": [-10.3500, -36.9333],
  "malhador": [-10.6578, -37.3064],
  "maruim": [-10.7408, -37.0817],
  "moita bonita": [-10.5772, -37.3428],
  "monte alegre de sergipe": [-10.0264, -37.5611],
  "muribeca": [-10.4333, -36.9667],
  "neopolis": [-10.3208, -36.5794],
  "nossa senhora aparecida": [-10.4439, -37.4892],
  "aparecida": [-10.4439, -37.4892],
  "nossa senhora da gloria": [-10.2189, -37.4217],
  "gloria": [-10.2189, -37.4217],
  "nossa senhora das dores": [-10.4939, -37.1908],
  "dores": [-10.4939, -37.1908],
  "nossa senhora do socorro": [-10.8546, -37.1264],
  "socorro": [-10.8546, -37.1264],
  "pacatuba": [-10.4508, -36.6508],
  "pedra mole": [-10.6139, -37.5189],
  "pedrinhas": [-11.1897, -37.5258],
  "pinhao": [-10.5694, -37.5819],
  "pirambu": [-10.7408, -36.8569],
  "poco redondo": [-9.8064, -37.6839],
  "poco verde": [-10.7089, -38.1814],
  "porto da folha": [-9.9172, -37.2778],
  "propria": [-10.2108, -36.8417],
  "riachao do dantas": [-10.9089, -37.7214],
  "riachuelo": [-10.7783, -37.1856],
  "ribeiropolis": [-10.5386, -37.4267],
  "rosario do catete": [-10.6969, -37.0306],
  "salgado": [-11.0319, -37.4728],
  "santa luzia do itanhy": [-11.3528, -37.4478],
  "santana do sao francisco": [-10.2833, -36.6000],
  "santa rosa de lima": [-10.6483, -37.1953],
  "santo amaro das brotas": [-10.7889, -36.9897],
  "sao cristovao": [-11.0147, -37.2064],
  "sao domingos": [-10.7917, -37.5681],
  "sao francisco": [-10.3333, -36.8839],
  "sao miguel do aleixo": [-10.3889, -37.3808],
  "aleixo": [-10.3889, -37.3808],
  "simao dias": [-10.7439, -37.8108],
  "siriri": [-10.6028, -37.1128],
  "telha": [-10.2117, -36.8839],
  "tobias barreto": [-11.1839, -37.9986],
  "tomar do geru": [-11.3739, -37.8428],
  "umbauba": [-11.3831, -37.6569],

  // ── Alagoas (AL) / Bahia (BA) / Pernambuco (PE) / Paraíba (PB) / Maranhão (MA) ──
  "maceio": [-9.6658, -35.7353],
  "arapiraca": [-9.7517, -36.6606],
  "penedo": [-10.2906, -36.5864],
  "salvador": [-12.9777, -38.5016],
  "feira de santana": [-12.2664, -38.9664],
  "paulo afonso": [-9.4069, -38.2208],
  "recife": [-8.0476, -34.8770],
  "caruaru": [-8.2839, -35.9761],
  "petrolina": [-9.3892, -40.5028],
  "joao pessoa": [-7.1195, -34.8450],
  "campina grande": [-7.2219, -35.8828],
  "sao luis": [-2.5307, -44.3068],
  "imperatriz": [-5.5264, -47.4917],
  "caxias": [-4.8589, -43.3556],
  "timon": [-5.0939, -42.8364],
  "sao jose de ribamar": [-2.5619, -44.0542],
  "paco do lumiar": [-2.5317, -44.1081]
};

const STATE_BOUNDING_BOXES: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  'se': { minLat: -11.75, maxLat: -9.30, minLng: -38.45, maxLng: -36.20 },
  'sergipe': { minLat: -11.75, maxLat: -9.30, minLng: -38.45, maxLng: -36.20 },
  'al': { minLat: -10.60, maxLat: -8.70, minLng: -38.35, maxLng: -35.05 },
  'alagoas': { minLat: -10.60, maxLat: -8.70, minLng: -38.35, maxLng: -35.05 },
  'ba': { minLat: -18.45, maxLat: -8.40, minLng: -46.70, maxLng: -37.20 },
  'bahia': { minLat: -18.45, maxLat: -8.40, minLng: -46.70, maxLng: -37.20 },
  'pe': { minLat: -9.60, maxLat: -7.00, minLng: -41.45, maxLng: -34.70 },
  'pernambuco': { minLat: -9.60, maxLat: -7.00, minLng: -41.45, maxLng: -34.70 },
  'pb': { minLat: -8.45, maxLat: -5.90, minLng: -38.90, maxLng: -34.70 },
  'paraiba': { minLat: -8.45, maxLat: -5.90, minLng: -38.90, maxLng: -34.70 },
  'rn': { minLat: -6.90, maxLat: -4.80, minLng: -38.60, maxLng: -34.90 },
  'rio grande do norte': { minLat: -6.90, maxLat: -4.80, minLng: -38.60, maxLng: -34.90 },
  'ce': { minLat: -7.90, maxLat: -2.70, minLng: -41.50, maxLng: -37.20 },
  'ceara': { minLat: -7.90, maxLat: -2.70, minLng: -41.50, maxLng: -37.20 },
  'ma': { minLat: -10.50, maxLat: -1.00, minLng: -48.90, maxLng: -41.70 },
  'maranhao': { minLat: -10.50, maxLat: -1.00, minLng: -48.90, maxLng: -41.70 },
};

/**
 * Extracts city, state, and street address details from a full base address string.
 * Example: "Av. da Universidade, 5-1 - Cohafuma, São Luís - MA, 65074-380"
 * => { city: "São Luís", state: "MA", street: "Av. da Universidade, 5-1 - Cohafuma" }
 */
export function parseFullAddress(address: string): { city: string; state: string; street: string } {
  if (!address || !address.trim()) {
    return { city: 'Aracaju', state: 'SE', street: '' };
  }

  const clean = address.trim();
  const parts = clean.split(',').map(p => p.trim());
  let state = 'SE';
  let city = 'Aracaju';
  let street = clean;

  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const dashMatch = p.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s]+)\s*[-,\/]\s*([A-Za-z]{2})$/i);
    if (dashMatch) {
      city = dashMatch[1].trim();
      state = dashMatch[2].trim().toUpperCase();
      street = parts.slice(0, i).join(', ');
      return { city, state, street };
    }

    const stateOnlyMatch = p.match(/^([A-Za-z]{2})(?:\s*,\s*\d{5}-?\d{3})?$/i);
    if (stateOnlyMatch && i > 0) {
      state = stateOnlyMatch[1].trim().toUpperCase();
      city = parts[i - 1].replace(/[-,\/]/g, '').trim();
      street = parts.slice(0, i - 1).join(', ');
      return { city, state, street };
    }
  }

  const regexMatch = clean.match(/(?:,\s*|\s+-\s+)?([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,})\s*[-,\/]\s*([A-Za-z]{2})/i);
  if (regexMatch) {
    city = regexMatch[1].trim();
    state = regexMatch[2].trim().toUpperCase();
    return { city, state, street: clean };
  }

  return { city: 'Aracaju', state: 'SE', street: clean };
}

function isValidStateCoords(coords: [number, number], state: string): boolean {
    if (!coords || !Array.isArray(coords) || coords.length !== 2) return false;
    const [lat, lng] = coords;
    if (isNaN(lat) || isNaN(lng)) return false;

    // Valid Brazil bounding box check
    if (lat < -34.0 || lat > 5.5 || lng < -74.0 || lng > -32.0) return false;

    // Specific state bounding box check if state is configured (defaults to Sergipe box)
    const stKey = normalizeStr(state || 'SE');
    const box = STATE_BOUNDING_BOXES[stKey] || STATE_BOUNDING_BOXES['se'];
    if (box) {
        return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
    }

    return true;
}

function isValidBrazilCoords(coords: [number, number]): boolean {
    return isValidStateCoords(coords, 'SE');
}

function normalizeStr(str: string): string {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Automatically purge legacy invalid geocode cache from browser localStorage on load
if (typeof window !== 'undefined') {
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.includes('geocode_') && !k.startsWith('v3_geocode_')) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
}

export async function getCoordinates(city: string, neighborhood: string, state: string, addressDetails?: string, zipCode?: string): Promise<[number, number] | null> {
    if (!city && !zipCode) return null;

    const safeCity = (city || '').trim();
    const cityNorm = normalizeStr(safeCity);
    const safeNeighborhood = neighborhood ? neighborhood.replace(/[^\w\s\u00C0-\u00FF]/gi, '').trim() : '';
    const safeZip = zipCode ? zipCode.replace(/\D/g, '').trim() : '';
    
    // Resolve 2-letter state codes to full state names (e.g. SE -> Sergipe, AL -> Alagoas)
    const rawState = (state || 'SE').trim().toLowerCase();
    const fullState = STATE_NAMES[rawState] || state || 'Sergipe';
    const safeAddress = addressDetails ? addressDetails.replace(/[^\w\s\u00C0-\u00FF,]/gi, '').trim() : '';

    const key = `v4_geocode_${safeZip}_${safeAddress}_${safeNeighborhood}_${cityNorm}_${rawState}`.toLowerCase();
    
    // Check localStorage cache with strict state bounds validation
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(key);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (isValidStateCoords(parsed, rawState)) {
                    return parsed;
                } else {
                    // Purge bad cached location (e.g. Paraguay or Paraná)
                    localStorage.removeItem(key);
                }
            } catch(e) {}
        }
    }

    // Attempt 0: Fast fallback to static city coordinates in Brazil for Sergipe / Northeast cities
    const knownCoords = CITY_FALLBACK_COORDINATES[cityNorm] ||
      Object.entries(CITY_FALLBACK_COORDINATES).find(([k]) => cityNorm.length >= 4 && (cityNorm.includes(k) || k.includes(cityNorm)))?.[1];

    // If no address details provided, return fast fallback coordinates to avoid slow / inaccurate OSM queries
    if (!safeAddress && knownCoords && isValidStateCoords(knownCoords, rawState)) {
        const fastCoords: [number, number] = [
            knownCoords[0] + (Math.random() - 0.5) * 0.008,
            knownCoords[1] + (Math.random() - 0.5) * 0.008
        ];
        saveCache(key, fastCoords, rawState);
        return fastCoords;
    }

    // Add API rate limiter
    await delayQueue();

    try {
        // Attempt 0: ViaCEP lookup to get exact street & neighborhood from Brazilian CEP
        if (safeZip && safeZip.length === 8) {
            try {
                const viaCepRes = await fetch(`https://viacep.com.br/ws/${safeZip}/json/`);
                if (viaCepRes.ok) {
                    const viaCepData = await viaCepRes.json();
                    if (viaCepData && !viaCepData.erro) {
                        const streetFromCep = viaCepData.logradouro || safeAddress;
                        const neighborhoodFromCep = viaCepData.bairro || safeNeighborhood;
                        const cityFromCep = viaCepData.localidade || safeCity;
                        const stateFromCep = viaCepData.uf || rawState;

                        const qViaCep = `${streetFromCep ? streetFromCep + ', ' : ''}${neighborhoodFromCep ? neighborhoodFromCep + ', ' : ''}${cityFromCep}, ${stateFromCep}, Brasil`;
                        const urlViaCep = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(qViaCep)}`;
                        const resViaCep = await fetch(urlViaCep);
                        if (resViaCep.ok) {
                            const dataViaCep = await resViaCep.json();
                            if (dataViaCep && dataViaCep.length > 0) {
                                const coords: [number, number] = [parseFloat(dataViaCep[0].lat), parseFloat(dataViaCep[0].lon)];
                                if (isValidStateCoords(coords, stateFromCep)) {
                                    saveCache(key, coords, rawState);
                                    return coords;
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("ViaCEP lookup error, falling back to direct CEP/address search", e);
            }

            // Direct CEP query in Nominatim (fallback if ViaCEP is unavailable)
            const formattedCep = `${safeZip.slice(0, 5)}-${safeZip.slice(5)}`;
            const qCep = `${formattedCep}, ${safeCity || 'Brasil'}`;
            const urlCep = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(qCep)}`;
            const resCep = await fetch(urlCep);
            if (resCep.ok) {
                const dataCep = await resCep.json();
                if (dataCep && dataCep.length > 0) {
                    const coords: [number, number] = [parseFloat(dataCep[0].lat), parseFloat(dataCep[0].lon)];
                    if (isValidStateCoords(coords, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
            await delayQueue();
        }

        // Attempt 1: Detailed address with countrycodes=br
        if (safeAddress) {
            const q0 = `${safeAddress}, ${safeNeighborhood ? safeNeighborhood + ', ' : ''}${safeCity}, ${fullState}, Brasil`;
            const url0 = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(q0)}`;
            const res0 = await fetch(url0);
            if (res0.ok) {
                const data0 = await res0.json();
                if (data0 && data0.length > 0) {
                    const coords: [number, number] = [parseFloat(data0[0].lat), parseFloat(data0[0].lon)];
                    if (isValidStateCoords(coords, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
            await delayQueue();
        }

        // Attempt 2: Neighborhood + City + Full State + Brazil
        if (safeNeighborhood) {
            const q1 = `${safeNeighborhood}, ${safeCity}, ${fullState}, Brasil`;
            const url1 = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(q1)}`;
            const res1 = await fetch(url1);
            if (res1.ok) {
                const data1 = await res1.json();
                if (data1 && data1.length > 0) {
                    const coords: [number, number] = [parseFloat(data1[0].lat), parseFloat(data1[0].lon)];
                    if (isValidStateCoords(coords, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
            await delayQueue();
        }

        // Attempt 3: City + Full State + Brazil
        const q2 = `${safeCity}, ${fullState}, Brasil`;
        const url2 = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(q2)}`;
        const res2 = await fetch(url2);
        
        if (res2.ok) {
            const data2 = await res2.json();
            if (data2 && data2.length > 0) {
                const coords: [number, number] = [parseFloat(data2[0].lat), parseFloat(data2[0].lon)];
                if (isValidStateCoords(coords, rawState)) {
                    coords[0] += (Math.random() - 0.5) * 0.008;
                    coords[1] += (Math.random() - 0.5) * 0.008;
                    saveCache(key, coords, rawState);
                    return coords;
                }
            }
        }

    } catch (err) {
        console.error("Geocoding failed", err);
    }

    // Step 4: Fallback to static city coordinates in Brazil
    if (knownCoords) {
        const fallbackCoords: [number, number] = [
            knownCoords[0] + (Math.random() - 0.5) * 0.008,
            knownCoords[1] + (Math.random() - 0.5) * 0.008
        ];
        saveCache(key, fallbackCoords, rawState);
        return fallbackCoords;
    }

    return null;
}

function saveCache(key: string, coords: [number, number], state: string = '') {
    if (typeof window !== 'undefined' && isValidStateCoords(coords, state)) {
        localStorage.setItem(key, JSON.stringify(coords));
    }
}

// Global promise to chain requests with 1s minimum delay
let lastRequestTime = 0;
let queuePromise = Promise.resolve();

function delayQueue(): Promise<void> {
    return new Promise((resolve) => {
        queuePromise = queuePromise.then(() => {
            const now = Date.now();
            const delay = Math.max(1000 - (now - lastRequestTime), 0);
            return new Promise<void>((r) => {
                setTimeout(() => {
                    lastRequestTime = Date.now();
                    r();
                    resolve();
                }, delay);
            });
        });
    });
}
