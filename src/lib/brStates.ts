// Estados brasileiros: aceita o nome por extenso ("Pernambuco", "PERNAMBUCO") ou a sigla e devolve a sigla (UF).
const STATE_TO_UF: Record<string, string> = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
    "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
    paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
    "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "Pernambuco" -> "PE". Se já for sigla, devolve em maiúsculas; se não reconhecer, devolve o texto como veio. */
export function stateToUF(state?: string | null): string {
    const raw = (state || "").trim();
    if (!raw) return "";
    // Vem às vezes como "Recife (PERNAMBUCO)" ou "PERNAMBUCO - PE": tira parênteses e usa o que sobrar.
    const cleaned = raw.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    const direct = STATE_TO_UF[normalize(cleaned)];
    if (direct) return direct;
    if (/^[A-Za-z]{2}$/.test(cleaned)) return cleaned.toUpperCase();
    const found = Object.keys(STATE_TO_UF).find(name => normalize(cleaned).includes(name));
    return found ? STATE_TO_UF[found] : raw;
}
