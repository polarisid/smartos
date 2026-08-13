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
  // ── Piauí (PI) ──
  "teresina": [-5.0870, -42.7972],

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
  "itaporanga_se": [-10.9961, -37.3056],
  "itaporanga_pb": [-7.3044, -38.1506],
  "itaporanga": [-7.3044, -38.1506],
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

  // ── Alagoas (AL) / Bahia (BA) / Pernambuco (PE) / Paraíba (PB) - Capitais e polos ──
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

  // ── Maranhão (MA) - Todos os 217 municípios (fonte: IBGE) ──
  "acailandia": [-4.9471, -47.5004],
  "afonso cunha": [-4.1363, -43.3275],
  "agua doce do maranhao": [-2.8405, -42.1189],
  "alcantara": [-2.3957, -44.4062],
  "aldeias altas": [-4.6262, -43.4689],
  "altamira do maranhao": [-4.1660, -45.4706],
  "alto alegre do maranhao": [-4.2130, -44.4460],
  "alto alegre do pindare": [-3.6669, -45.8421],
  "alto parnaiba": [-9.1027, -45.9303],
  "amapa do maranhao": [-1.6752, -46.0024],
  "amarante do maranhao": [-5.5691, -46.7473],
  "anajatuba": [-3.2627, -44.6126],
  "anapurus": [-3.6758, -43.1014],
  "apicum-acu": [-1.4586, -45.0864],
  "araguana": [-2.9464, -45.6589],
  "araioses": [-2.8909, -41.9050],
  "arame": [-4.8835, -46.0032],
  "arari": [-3.4521, -44.7665],
  "axixa": [-2.8394, -44.0620],
  "bacabal": [-4.2245, -44.7832],
  "bacabeira": [-2.9645, -44.3164],
  "bacuri": [-1.6965, -45.1328],
  "bacurituba": [-2.7100, -44.7329],
  "balsas": [-7.5321, -46.0372],
  "barao de grajau": [-6.7446, -43.0261],
  "barra do corda": [-5.4968, -45.2485],
  "barreirinhas": [-2.7586, -42.8232],
  "bela vista do maranhao": [-3.7262, -45.3075],
  "belagua": [-3.1549, -43.5122],
  "benedito leite": [-7.2104, -44.5577],
  "bequimao": [-2.4416, -44.7842],
  "bernardo do mearim": [-4.6267, -44.7608],
  "boa vista do gurupi": [-1.7761, -46.3002],
  "bom jardim": [-3.5413, -45.6060],
  "bom jesus das selvas": [-4.4764, -46.8641],
  "bom lugar": [-4.3731, -45.0326],
  "brejo": [-3.6780, -42.7527],
  "brejo de areia": [-4.3340, -45.5810],
  "buriti": [-3.9417, -42.9179],
  "buriti bravo": [-5.8324, -43.8353],
  "buriticupu": [-4.3238, -46.4409],
  "buritirana": [-5.5982, -47.0131],
  "cachoeira grande": [-2.9307, -44.0528],
  "cajapio": [-2.8733, -44.6741],
  "cajari": [-3.3274, -45.0145],
  "campestre do maranhao": [-6.1707, -47.3625],
  "candido mendes": [-1.4326, -45.7161],
  "cantanhede": [-3.6376, -44.3830],
  "capinzal do norte": [-4.7236, -44.3280],
  "carolina": [-7.3358, -47.4634],
  "carutapera": [-1.1970, -46.0085],
  "caxias": [-4.8651, -43.3617],
  "cedral": [-2.0003, -44.5281],
  "central do maranhao": [-2.1983, -44.8254],
  "centro do guilherme": [-2.4489, -46.0345],
  "centro novo do maranhao": [-2.1270, -46.1228],
  "chapadinha": [-3.7388, -43.3538],
  "cidelandia": [-5.1746, -47.7781],
  "codo": [-4.4556, -43.8924],
  "coelho neto": [-4.2524, -43.0108],
  "colinas": [-6.0320, -44.2543],
  "conceicao do lago-acu": [-3.8514, -44.8895],
  "coroata": [-4.1344, -44.1244],
  "cururupu": [-1.8148, -44.8644],
  "davinopolis": [-5.5464, -47.4217],
  "dom pedro": [-5.0352, -44.4409],
  "duque bacelar": [-4.1500, -42.9477],
  "esperantinopolis": [-4.8794, -44.6926],
  "estreito": [-6.5608, -47.4431],
  "feira nova do maranhao": [-6.9651, -46.6786],
  "fernando falcao": [-6.1621, -44.8979],
  "formosa da serra negra": [-6.4402, -46.1916],
  "fortaleza dos nogueiras": [-6.9598, -46.1749],
  "fortuna": [-5.7279, -44.1565],
  "godofredo viana": [-1.4026, -45.7795],
  "goncalves dias": [-5.1475, -44.3013],
  "governador archer": [-5.0208, -44.2754],
  "governador edison lobao": [-5.7497, -47.3646],
  "governador eugenio barros": [-5.3190, -44.2469],
  "governador luiz rocha": [-5.4783, -44.0774],
  "governador newton bello": [-3.4324, -45.6619],
  "governador nunes freire": [-2.1290, -45.8777],
  "graca aranha": [-5.4055, -44.3358],
  "grajau": [-5.8137, -46.1462],
  "guimaraes": [-2.1275, -44.6020],
  "humberto de campos": [-2.5983, -43.4649],
  "icatu": [-2.7721, -44.0501],
  "igarape do meio": [-3.6577, -45.2114],
  "igarape grande": [-4.6625, -44.8558],
  "imperatriz": [-5.5185, -47.4777],
  "itaipava do grajau": [-5.1425, -45.7877],
  "itapecuru mirim": [-3.4020, -44.3508],
  "itinga do maranhao": [-4.4529, -47.5235],
  "jatoba": [-5.8228, -44.2153],
  "jenipapo dos vieiras": [-5.3624, -45.6356],
  "joao lisboa": [-5.4436, -47.4064],
  "joselandia": [-4.9861, -44.6958],
  "junco do maranhao": [-1.8389, -46.0900],
  "lago da pedra": [-4.5697, -45.1319],
  "lago do junco": [-4.6090, -45.0490],
  "lago dos rodrigues": [-4.6117, -44.9798],
  "lago verde": [-3.9466, -44.8260],
  "lagoa do mato": [-6.0502, -43.5333],
  "lagoa grande do maranhao": [-4.9889, -45.3816],
  "lajeado novo": [-6.1854, -47.0293],
  "lima campos": [-4.5184, -44.4646],
  "loreto": [-7.0811, -45.1451],
  "luis domingues": [-1.2749, -45.8670],
  "magalhaes de almeida": [-3.3923, -42.2117],
  "maracacume": [-2.0492, -45.9587],
  "maraja do sena": [-4.6281, -45.4531],
  "maranhaozinho": [-2.2408, -45.8507],
  "mata roma": [-3.6204, -43.1112],
  "matinha": [-3.0985, -45.0350],
  "matoes": [-5.5136, -43.2018],
  "matoes do norte": [-3.6244, -44.5468],
  "milagres do maranhao": [-3.5744, -42.6131],
  "mirador": [-6.3745, -44.3683],
  "miranda do norte": [-3.5631, -44.5814],
  "mirinzal": [-2.0709, -44.7787],
  "moncao": [-3.4813, -45.2496],
  "montes altos": [-5.8307, -47.0673],
  "morros": [-2.8538, -44.0357],
  "nina rodrigues": [-3.4679, -43.9134],
  "nova colinas": [-7.1226, -46.2607],
  "nova iorque": [-6.7305, -44.0471],
  "nova olinda do maranhao": [-2.8423, -45.6953],
  "olho d'agua das cunhas": [-4.1342, -45.1163],
  "olinda nova do maranhao": [-2.9929, -44.9897],
  "paco do lumiar": [-2.5166, -44.1019],
  "palmeirandia": [-2.6443, -44.8933],
  "paraibano": [-6.4264, -43.9792],
  "parnarama": [-5.6737, -43.1011],
  "passagem franca": [-6.1775, -43.7755],
  "pastos bons": [-6.6030, -44.0745],
  "paulino neves": [-2.7209, -42.5258],
  "paulo ramos": [-4.4448, -45.2398],
  "pedreiras": [-4.5648, -44.6006],
  "pedro do rosario": [-2.9727, -45.3493],
  "penalva": [-3.2767, -45.1768],
  "peri mirim": [-2.5768, -44.8504],
  "peritoro": [-4.3746, -44.3369],
  "pindare-mirim": [-3.6098, -45.3420],
  "pinheiro": [-2.5222, -45.0788],
  "pio xii": [-3.8931, -45.1759],
  "pirapemas": [-3.7204, -44.2216],
  "pocao de pedras": [-4.7463, -44.9432],
  "porto franco": [-6.3415, -47.3962],
  "porto rico do maranhao": [-1.8593, -44.5842],
  "presidente dutra": [-5.2898, -44.4950],
  "presidente juscelino": [-2.9187, -44.0715],
  "presidente medici": [-2.3899, -45.8200],
  "presidente sarney": [-2.5880, -45.3595],
  "presidente vargas": [-3.4079, -44.0234],
  "primeira cruz": [-2.5057, -43.4232],
  "raposa": [-2.4254, -44.0973],
  "riachao": [-7.3582, -46.6225],
  "ribamar fiquene": [-5.9307, -47.3888],
  "rosario": [-2.9344, -44.2531],
  "sambaiba": [-7.1345, -45.3515],
  "santa filomena do maranhao": [-5.4967, -44.5638],
  "santa helena": [-2.2443, -45.2900],
  "santa ines": [-3.6511, -45.3774],
  "santa luzia": [-4.0687, -45.6900],
  "santa luzia do parua": [-2.5112, -45.7801],
  "santa quiteria do maranhao": [-3.4931, -42.5688],
  "santa rita": [-3.1424, -44.3211],
  "santana do maranhao": [-3.1090, -42.4064],
  "santo amaro do maranhao": [-2.5007, -43.2380],
  "santo antonio dos lopes": [-4.8661, -44.3653],
  "sao benedito do rio preto": [-3.3352, -43.5287],
  "sao bento": [-2.6978, -44.8289],
  "sao bernardo": [-3.3722, -42.4191],
  "sao domingos do azeitao": [-6.8147, -44.6509],
  "sao domingos do maranhao": [-5.5809, -44.3822],
  "sao felix de balsas": [-7.0754, -44.8092],
  "sao francisco do brejao": [-5.1258, -47.3890],
  "sao francisco do maranhao": [-6.2516, -42.8668],
  "sao joao batista": [-2.9540, -44.7953],
  "sao joao do caru": [-3.5503, -46.2507],
  "sao joao do paraiso": [-6.4563, -47.0594],
  "sao joao do soter": [-5.1082, -43.8163],
  "sao joao dos patos": [-6.4934, -43.7036],
  "sao jose de ribamar": [-2.5470, -44.0597],
  "sao jose dos basilios": [-5.0549, -44.5809],
  "sao luis": [-2.5387, -44.2825],
  "sao luis gonzaga do maranhao": [-4.3854, -44.6654],
  "sao mateus do maranhao": [-4.0374, -44.4707],
  "sao pedro da agua branca": [-5.0847, -48.4291],
  "sao pedro dos crentes": [-6.8239, -46.5319],
  "sao raimundo das mangabeiras": [-7.0218, -45.4809],
  "sao raimundo do doca bezerra": [-5.1105, -45.0696],
  "sao roberto": [-5.0231, -45.0010],
  "sao vicente ferrer": [-2.8949, -44.8681],
  "satubinha": [-4.0491, -45.2457],
  "senador alexandre costa": [-5.2510, -44.0533],
  "senador la rocque": [-5.4461, -47.2959],
  "serrano do maranhao": [-1.8523, -45.1207],
  "sitio novo": [-5.8760, -46.7033],
  "sucupira do norte": [-6.4784, -44.1919],
  "sucupira do riachao": [-6.4086, -43.5455],
  "tasso fragoso": [-8.4662, -45.7536],
  "timbiras": [-4.2560, -43.9320],
  "timon": [-5.0977, -42.8329],
  "trizidela do vale": [-4.5380, -44.6280],
  "tufilandia": [-3.6736, -45.6238],
  "tuntum": [-5.2548, -44.6444],
  "turiacu": [-1.6589, -45.3798],
  "turilandia": [-2.2164, -45.3044],
  "tutoia": [-2.7614, -42.2755],
  "urbano santos": [-3.2064, -43.3878],
  "vargem grande": [-3.5364, -43.9170],
  "viana": [-3.2045, -44.9912],
  "vila nova dos martirios": [-5.1889, -48.1336],
  "vitoria do mearim": [-3.4512, -44.8643],
  "vitorino freire": [-4.2818, -45.2505],
  "ze doca": [-3.2701, -45.6553]
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
  'pi': { minLat: -10.95, maxLat: -2.75, minLng: -45.95, maxLng: -40.35 },
  'piaui': { minLat: -10.95, maxLat: -2.75, minLng: -45.95, maxLng: -40.35 },
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

/**
 * Validates whether a Brazilian CEP matches the provided city and state.
 * Returns information about mismatch and suggestions.
 */
export async function validateCepWithCityState(zipCode: string, city: string, state: string): Promise<{
  isValid: boolean;
  mismatch: boolean;
  details?: string;
  suggestedCity?: string;
  suggestedState?: string;
}> {
  if (!zipCode) return { isValid: true, mismatch: false };
  const cleanZip = zipCode.replace(/\D/g, '').trim();
  if (cleanZip.length !== 8) return { isValid: true, mismatch: false };

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.erro) {
        const cepCity = (data.localidade || '').trim();
        const cepState = (data.uf || '').trim().toUpperCase();

        const inputCityNorm = normalizeStr(city || '');
        const rawInputState = (state || '').trim().toLowerCase();
        // Resolve 2-letter code if input is full name like 'Sergipe' -> 'SE'
        const inputStateCode = (rawInputState.length === 2
          ? rawInputState.toUpperCase()
          : (Object.entries(STATE_NAMES).find(([k, v]) => normalizeStr(v) === normalizeStr(rawInputState))?.[0] || rawInputState).toUpperCase()
        );

        const cepCityNorm = normalizeStr(cepCity);

        // Check state mismatch or city mismatch
        const stateMismatch = inputStateCode && cepState && inputStateCode !== cepState;
        const cityMismatch = inputCityNorm && cepCityNorm && !inputCityNorm.includes(cepCityNorm) && !cepCityNorm.includes(inputCityNorm);

        if (stateMismatch || cityMismatch) {
          return {
            isValid: false,
            mismatch: true,
            details: `O CEP ${zipCode} pertence a ${cepCity}-${cepState}, mas consta como ${city || 'sem cidade'}-${state || 'SE'}.`,
            suggestedCity: cepCity,
            suggestedState: cepState,
          };
        }
      }
    }
  } catch (e) {}

  return { isValid: true, mismatch: false };
}

function isValidStateCoords(coords: [number, number], state: string): boolean {
    if (!coords || !Array.isArray(coords) || coords.length !== 2) return false;
    const [lat, lng] = coords;
    if (isNaN(lat) || isNaN(lng)) return false;

    // Valid Brazil bounding box check
    if (lat < -34.0 || lat > 5.5 || lng < -74.0 || lng > -32.0) return false;

    // Specific state bounding box check, when we have one mapped for this state.
    // States without a mapped box just rely on the national check above -
    // silently reusing another state's box here would reject valid coordinates.
    const stKey = normalizeStr(state || '');
    const box = STATE_BOUNDING_BOXES[stKey];
    if (box) {
        return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
    }

    return true;
}

function isValidBrazilCoords(coords: [number, number]): boolean {
    if (!coords || !Array.isArray(coords) || coords.length !== 2) return false;
    const [lat, lng] = coords;
    if (isNaN(lat) || isNaN(lng)) return false;
    return !(lat < -34.0 || lat > 5.5 || lng < -74.0 || lng > -32.0);
}

function normalizeStr(str: string): string {
    return (str || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getHaversineDistance(c1: [number, number], c2: [number, number]): number {
    const dLat = (c2[0] - c1[0]) * Math.PI / 180;
    const dLng = (c2[1] - c1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getKnownCityCoords(cityNorm: string, state: string): [number, number] | undefined {
    if (!cityNorm) return undefined;
    const stCode = (state || 'SE').trim().toLowerCase();

    // 1. Check state-scoped key first, e.g. "itaporanga_pb" or "itaporanga_se"
    const stateScopedKey = `${cityNorm}_${stCode}`;
    if (CITY_FALLBACK_COORDINATES[stateScopedKey]) {
        return CITY_FALLBACK_COORDINATES[stateScopedKey];
    }

    // 2. Specific state collision overrides
    if (cityNorm === 'itaporanga') {
        if (stCode === 'pb' || stCode === 'paraiba') return [-7.3044, -38.1506];
        if (stCode === 'se' || stCode === 'sergipe') return [-10.9961, -37.3056];
    }

    // 3. Exact general city key match — only trusted if it actually falls within
    // the requested state's bounding box (guards against two states sharing a
    // plain city name, e.g. a future "Buriti" entry added for another state).
    const exactMatch = CITY_FALLBACK_COORDINATES[cityNorm];
    if (exactMatch && isValidStateCoords(exactMatch, state)) {
        return exactMatch;
    }

    // 4. Fuzzy substring fallback — restricted to candidates that actually fall
    // inside the requested state's bounding box, so a city name that collides
    // with a same-named city in another state (e.g. "Santa Luzia" in MA vs.
    // "Santa Luzia do Itanhy" in SE) can never resolve to the wrong state.
    const fuzzyMatch = Object.entries(CITY_FALLBACK_COORDINATES).find(
        ([k, coords]) => cityNorm.length >= 4 && (cityNorm.includes(k) || k.includes(cityNorm)) && isValidStateCoords(coords, state)
    );
    return fuzzyMatch?.[1];
}

function isValidCityCoords(coords: [number, number], cityNorm: string, state: string): boolean {
    if (!isValidStateCoords(coords, state)) return false;
    if (!cityNorm) return true;

    const knownCityCoords = getKnownCityCoords(cityNorm, state);
    if (!knownCityCoords) return true;

    const distKm = getHaversineDistance(coords, knownCityCoords);
    if (distKm > 40) {
        console.warn(`[City Bounds Guard] Coordinate [${coords[0]}, ${coords[1]}] is ${distKm.toFixed(1)} km away from city '${cityNorm}' (${state}) center. Rejecting wrong-city coordinate!`);
        return false;
    }

    return true;
}

// Automatically purge legacy invalid geocode cache from browser localStorage on load
if (typeof window !== 'undefined') {
    try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.includes('geocode_') && !k.startsWith('v8_geocode_')) {
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
    
    // Resolve 2-letter state codes to full state names (e.g. SE -> Sergipe, AL -> Alagoas, PB -> Paraíba)
    const rawStateInput = (state || 'SE').trim().toLowerCase();
    const rawState = rawStateInput.length === 2 
        ? rawStateInput 
        : (Object.entries(STATE_NAMES).find(([k, v]) => normalizeStr(v) === normalizeStr(rawStateInput))?.[0] || rawStateInput);
    const fullState = STATE_NAMES[rawState] || state || 'Sergipe';
    const safeAddress = addressDetails ? addressDetails.replace(/[^\w\s\u00C0-\u00FF,]/gi, '').trim() : '';

    let usableZip = safeZip;
    if (safeZip && safeZip.length === 8 && safeCity) {
        try {
            const val = await validateCepWithCityState(safeZip, safeCity, rawState);
            if (val.mismatch) {
                console.warn(`[Geocode Strategy] CEP ${safeZip} não pertence a ${safeCity}-${rawState} (pertence a ${val.suggestedCity}-${val.suggestedState}). Ignorando CEP e usando estritamente UF/Cidade/Bairro da planilha.`);
                usableZip = '';
            }
        } catch (e) {}
    }

    const key = `v8_geocode_${usableZip}_${safeAddress}_${safeNeighborhood}_${cityNorm}_${rawState}`.toLowerCase();
    
    // Check localStorage cache with strict city bounds validation
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(key);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (isValidCityCoords(parsed, cityNorm, rawState)) {
                    return parsed;
                } else {
                    localStorage.removeItem(key);
                }
            } catch(e) {}
        }
    }

    const knownCoords = getKnownCityCoords(cityNorm, rawState);

    // Attempt 00: Google Geocoding API (High-Precision Rooftop/Street Geocoding for Brazil)
    const googleApiKey = (typeof process !== 'undefined' && process.env)
        ? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || '')
        : '';

    if (googleApiKey) {
        try {
            const fullAddressQuery = [safeAddress, safeNeighborhood, safeCity, fullState, usableZip ? `CEP ${usableZip}` : '', 'Brasil']
                .filter(Boolean)
                .join(', ');
            const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddressQuery)}&components=country:BR&key=${googleApiKey}`;
            const googleRes = await fetch(googleUrl);
            if (googleRes.ok) {
                const googleData = await googleRes.json();
                if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
                    const loc = googleData.results[0].geometry.location;
                    const coords: [number, number] = [loc.lat, loc.lng];
                    if (isValidCityCoords(coords, cityNorm, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
        } catch (e) {
            console.warn("Google Geocoding API lookup failed, falling back to public providers", e);
        }
    }

    // Attempt 0: High-accuracy Brazilian CEP Geocoding API (AwesomeAPI & BrasilAPI)
    if (usableZip && usableZip.length === 8) {
        try {
            // 0a. Try AwesomeAPI CEP Geolocation (Returns exact lat/lng for Brazilian CEPs)
            const awesomeRes = await fetch(`https://cep.awesomeapi.com.br/json/${usableZip}`);
            if (awesomeRes.ok) {
                const awesomeData = await awesomeRes.json();
                if (awesomeData && awesomeData.lat && awesomeData.lng) {
                    const coords: [number, number] = [parseFloat(awesomeData.lat), parseFloat(awesomeData.lng)];
                    if (isValidCityCoords(coords, cityNorm, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
        } catch (e) {}

        try {
            // 0b. Try BrasilAPI CEP V2 (Returns exact coordinates from IBGE/Correios)
            const brasilApiRes = await fetch(`https://brasilapi.com.br/api/cep/v2/${usableZip}`);
            if (brasilApiRes.ok) {
                const bData = await brasilApiRes.json();
                if (bData && bData.location && bData.location.coordinates) {
                    const { longitude, latitude } = bData.location.coordinates;
                    if (latitude && longitude) {
                        const coords: [number, number] = [parseFloat(latitude), parseFloat(longitude)];
                        if (isValidCityCoords(coords, cityNorm, rawState)) {
                            saveCache(key, coords, rawState);
                            return coords;
                        }
                    }
                }
            }
        } catch (e) {}

        try {
            // 0c. ViaCEP lookup + Nominatim/Photon exact street search
            const viaCepRes = await fetch(`https://viacep.com.br/ws/${usableZip}/json/`);
            if (viaCepRes.ok) {
                const viaCepData = await viaCepRes.json();
                if (viaCepData && !viaCepData.erro) {
                    const streetFromCep = viaCepData.logradouro || safeAddress;
                    const neighborhoodFromCep = viaCepData.bairro || safeNeighborhood;
                    const cityFromCep = viaCepData.localidade || safeCity;
                    const stateFromCep = viaCepData.uf || rawState;

                    // Search Nominatim with street + neighborhood
                    if (streetFromCep) {
                        const qViaCep = `${streetFromCep}, ${neighborhoodFromCep ? neighborhoodFromCep + ', ' : ''}${cityFromCep}, ${stateFromCep}, Brasil`;
                        const urlViaCep = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(qViaCep)}`;
                        const resViaCep = await fetch(urlViaCep);
                        if (resViaCep.ok) {
                            const dataViaCep = await resViaCep.json();
                            if (dataViaCep && dataViaCep.length > 0) {
                                const coords: [number, number] = [parseFloat(dataViaCep[0].lat), parseFloat(dataViaCep[0].lon)];
                                if (isValidCityCoords(coords, cityNorm, stateFromCep)) {
                                    saveCache(key, coords, rawState);
                                    return coords;
                                }
                            }
                        }
                    }

                    // Search Photon Komoot
                    const qPhoton = `${streetFromCep ? streetFromCep + ' ' : ''}${neighborhoodFromCep ? neighborhoodFromCep + ' ' : ''}${cityFromCep} ${stateFromCep}`;
                    const urlPhoton = `https://photon.komoot.io/api/?q=${encodeURIComponent(qPhoton)}&limit=1&lang=default`;
                    const resPhoton = await fetch(urlPhoton);
                    if (resPhoton.ok) {
                        const dataPhoton = await resPhoton.json();
                        if (dataPhoton && dataPhoton.features && dataPhoton.features.length > 0) {
                            const [lng, lat] = dataPhoton.features[0].geometry.coordinates;
                            const coords: [number, number] = [lat, lng];
                            if (isValidCityCoords(coords, cityNorm, stateFromCep)) {
                                saveCache(key, coords, rawState);
                                return coords;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("ViaCEP/Photon lookup error", e);
        }

        // Direct CEP query in Nominatim
        const formattedCep = `${usableZip.slice(0, 5)}-${usableZip.slice(5)}`;
        const qCep = `${formattedCep}, ${safeCity || 'Brasil'}`;
        const urlCep = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&q=${encodeURIComponent(qCep)}`;
        const resCep = await fetch(urlCep);
        if (resCep.ok) {
            const dataCep = await resCep.json();
            if (dataCep && dataCep.length > 0) {
                const coords: [number, number] = [parseFloat(dataCep[0].lat), parseFloat(dataCep[0].lon)];
                if (isValidCityCoords(coords, cityNorm, rawState)) {
                    saveCache(key, coords, rawState);
                    return coords;
                }
            }
        }
        await delayQueue();
    }

    try {
        // Attempt 1: Street / Neighborhood search via Photon Komoot (CORS-Friendly, No 429 Rate-Limits)
        if (safeAddress || safeNeighborhood) {
            const queryTerms = [safeAddress, safeNeighborhood, safeCity, fullState, 'Brasil'].filter(Boolean).join(', ');
            const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryTerms)}&limit=1&lang=default`;
            const resPhoton = await fetch(photonUrl);
            if (resPhoton.ok) {
                const dataPhoton = await resPhoton.json();
                if (dataPhoton && dataPhoton.features && dataPhoton.features.length > 0) {
                    const [lng, lat] = dataPhoton.features[0].geometry.coordinates;
                    const coords: [number, number] = [lat, lng];
                    if (isValidCityCoords(coords, cityNorm, rawState)) {
                        saveCache(key, coords, rawState);
                        return coords;
                    }
                }
            }
        }
    } catch (err) {
        console.warn("Photon lookup skipped", err);
    }

    // Step 2: Instant Fallback to verified local city coordinates (0 ms, 0 network, 0 CORS, 0 429 rate limits!)
    if (knownCoords) {
        saveCache(key, knownCoords, rawState);
        return knownCoords;
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
