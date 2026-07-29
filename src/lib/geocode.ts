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
  "aracaju": [-10.9472, -37.0731],
  "nossa senhora do socorro": [-10.8546, -37.1264],
  "socorro": [-10.8546, -37.1264],
  "barra dos coqueiros": [-10.9089, -37.0381],
  "sao cristovao": [-11.0147, -37.2064],
  "laranjeiras": [-10.8039, -37.1714],
  "maruim": [-10.7408, -37.0817],
  "santo amaro das brotas": [-10.7889, -36.9897],
  "rosario do catete": [-10.6969, -37.0306],
  "siriri": [-10.6028, -37.1128],
  "general maynard": [-10.6917, -36.9856],
  "carmopolis": [-10.6453, -36.9889],
  "japaratuba": [-10.5939, -36.9381],
  "pirambu": [-10.7408, -36.8569],
  "capela": [-10.5036, -37.0528],
  "aquidaba": [-10.2811, -37.0183],
  "graccho cardoso": [-10.2264, -37.2028],
  "cumbe": [-10.3547, -37.1792],
  "feira nova": [-10.2667, -37.3147],
  "nossa senhora das dores": [-10.4939, -37.1908],
  "riachuelo": [-10.7783, -37.1856],
  "divina pastora": [-10.6789, -37.1478],
  "santa rosa de lima": [-10.6483, -37.1953],
  "itabaiana": [-10.6853, -37.4269],
  "campo do brito": [-10.7331, -37.4928],
  "macambira": [-10.7139, -37.5458],
  "sao domingos": [-10.7917, -37.5681],
  "areia branca": [-10.7583, -37.3556],
  "malhador": [-10.6578, -37.3064],
  "moita bonita": [-10.5772, -37.3428],
  "ribeiropolis": [-10.5386, -37.4267],
  "lagarto": [-10.9172, -37.6631],
  "simao dias": [-10.7439, -37.8108],
  "riachao do dantas": [-10.9089, -37.7214],
  "tobias barreto": [-11.1839, -37.9986],
  "poco verde": [-10.7089, -38.1814],
  "salgado": [-11.0319, -37.4728],
  "boquim": [-11.1464, -37.6214],
  "pedrinhas": [-11.1897, -37.5258],
  "araua": [-11.2608, -37.6239],
  "estancia": [-11.2683, -37.4383],
  "umbauba": [-11.3831, -37.6569],
  "itabaianinha": [-11.2739, -37.7892],
  "cristinapolis": [-11.4747, -37.7553],
  "tomar do geru": [-11.3739, -37.8428],
  "indiaroba": [-11.5189, -37.5117],
  "santa luzia do itanhy": [-11.3528, -37.4478],
  "nossa senhora da gloria": [-10.2189, -37.4217],
  "monte alegre de sergipe": [-10.0264, -37.5611],
  "porto da folha": [-9.9172, -37.2778],
  "gararu": [-9.9667, -37.0833],
  "poco redondo": [-9.8064, -37.6839],
  "caninde de sao francisco": [-9.6439, -37.7894],
  "nossa senhora de lourdes": [-10.1583, -37.0542],
  "itabi": [-10.1264, -37.1028],
  "propria": [-10.2108, -36.8417],
  "neopolis": [-10.3208, -36.5794],
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
  "campina grande": [-7.2219, -35.8828]
};

function isValidBrazilCoords(coords: [number, number]): boolean {
    if (!coords || !Array.isArray(coords) || coords.length !== 2) return false;
    const [lat, lng] = coords;
    // Valid Brazil bounding box: Lat between -34 and 5.5, Lng between -74 and -32
    return lat >= -34.0 && lat <= 5.5 && lng >= -74.0 && lng <= -32.0;
}

function normalizeStr(str: string): string {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export async function getCoordinates(city: string, neighborhood: string, state: string, addressDetails?: string): Promise<[number, number] | null> {
    if (!city) return null;

    const safeCity = city.trim();
    const cityNorm = normalizeStr(safeCity);
    const safeNeighborhood = neighborhood ? neighborhood.replace(/[^\w\s\u00C0-\u00FF]/gi, '').trim() : '';
    
    // Resolve 2-letter state codes to full state names (e.g. SE -> Sergipe, AL -> Alagoas)
    const rawState = (state || 'SE').trim().toLowerCase();
    const fullState = STATE_NAMES[rawState] || state || 'Sergipe';
    const safeAddress = addressDetails ? addressDetails.replace(/[^\w\s\u00C0-\u00FF,]/gi, '').trim() : '';

    const key = `geocode_${safeAddress}_${safeNeighborhood}_${cityNorm}_${rawState}`.toLowerCase();
    
    // Check localStorage cache with strict Brazil bounds validation
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(key);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (isValidBrazilCoords(parsed)) {
                    return parsed;
                } else {
                    // Purge bad cached location (e.g. Paraguay or Sweden)
                    localStorage.removeItem(key);
                }
            } catch(e) {}
        }
    }

    // Add API rate limiter
    await delayQueue();

    try {
        // Attempt 1: Detailed address with countrycodes=br
        if (safeAddress) {
            const q0 = `${safeAddress}, ${safeNeighborhood ? safeNeighborhood + ', ' : ''}${safeCity}, ${fullState}, Brasil`;
            const url0 = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(q0)}`;
            const res0 = await fetch(url0);
            if (res0.ok) {
                const data0 = await res0.json();
                if (data0 && data0.length > 0) {
                    const coords: [number, number] = [parseFloat(data0[0].lat), parseFloat(data0[0].lon)];
                    if (isValidBrazilCoords(coords)) {
                        saveCache(key, coords);
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
                    if (isValidBrazilCoords(coords)) {
                        saveCache(key, coords);
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
                if (isValidBrazilCoords(coords)) {
                    coords[0] += (Math.random() - 0.5) * 0.008;
                    coords[1] += (Math.random() - 0.5) * 0.008;
                    saveCache(key, coords);
                    return coords;
                }
            }
        }

    } catch (err) {
        console.error("Geocoding failed", err);
    }

    // Step 4: Fallback to static city coordinates in Brazil
    const knownCoords = CITY_FALLBACK_COORDINATES[cityNorm];
    if (knownCoords) {
        const fallbackCoords: [number, number] = [
            knownCoords[0] + (Math.random() - 0.5) * 0.01,
            knownCoords[1] + (Math.random() - 0.5) * 0.01
        ];
        saveCache(key, fallbackCoords);
        return fallbackCoords;
    }

    return null;
}

function saveCache(key: string, coords: [number, number]) {
    if (typeof window !== 'undefined' && isValidBrazilCoords(coords)) {
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
