/**
 * Linha do produto identificada pela primeira letra do modelo (padrão dos modelos Samsung):
 * W = máquina de lavar, A = ar-condicionado, U/Q/L = TV, R = refrigerador, demais letras = outros.
 */
export type ProductLine = "maquina_lavar" | "ar_condicionado" | "tv" | "refrigerador" | "outros";

export const PRODUCT_LINE_LABELS: Record<ProductLine, string> = {
    maquina_lavar: "Máquina de lavar",
    ar_condicionado: "Ar-condicionado",
    tv: "TV",
    refrigerador: "Refrigerador",
    outros: "Outros",
};

const BY_LETTER: Record<string, ProductLine> = {
    W: "maquina_lavar",
    A: "ar_condicionado",
    U: "tv",
    Q: "tv",
    L: "tv",
    R: "refrigerador",
};

/** Linha do produto pelo modelo; `null` quando o modelo está vazio (ainda não dá para saber). */
export function productLineFromModel(model?: string | null): ProductLine | null {
    const first = (model || "").trim().charAt(0).toUpperCase();
    if (!first) return null;
    return BY_LETTER[first] ?? "outros";
}

// ── Fotos do produto por linha ─────────────────────────────────────────────────────────────────────────────────────
// Cada linha (máquina de lavar, TV...) pede suas próprias fotos do produto. A lista é configurada no painel admin e
// guardada em 'configs' (id 'product_photos'); sem configuração vale o padrão antigo: frontal, traseira e serial.

/** Foto do produto pedida no relatório. `key` é a categoria gravada na foto (sempre começa com "produto_"). */
export type ProductPhotoSlot = { key: string; label: string; required: boolean };
export type ProductPhotoConfig = Record<ProductLine, ProductPhotoSlot[]>;

export const PRODUCT_LINES: ProductLine[] = ["maquina_lavar", "ar_condicionado", "tv", "refrigerador", "outros"];

export const DEFAULT_PRODUCT_SLOTS: ProductPhotoSlot[] = [
    { key: "produto_frontal", label: "Frontal", required: true },
    { key: "produto_traseira", label: "Traseira", required: true },
    { key: "produto_serial", label: "Serial", required: true },
];

export const DEFAULT_PRODUCT_PHOTO_CONFIG: ProductPhotoConfig = {
    maquina_lavar: DEFAULT_PRODUCT_SLOTS,
    ar_condicionado: DEFAULT_PRODUCT_SLOTS,
    tv: DEFAULT_PRODUCT_SLOTS,
    refrigerador: DEFAULT_PRODUCT_SLOTS,
    outros: DEFAULT_PRODUCT_SLOTS,
};

export const isProductPhotoCategory = (category: string) => category.startsWith("produto_");

/** Chave de foto a partir do nome ("Foto do cabo" -> "produto_foto_do_cabo"), sem repetir as já usadas. */
export function slotKeyFromLabel(label: string, usedKeys: string[]): string {
    const slug = label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "foto";
    let key = `produto_${slug}`;
    for (let i = 2; usedKeys.includes(key); i++) key = `produto_${slug}_${i}`;
    return key;
}

/** Nome de uma foto do produto: o gravado na foto, o padrão da chave ou a chave "limpa". */
export function productPhotoLabel(category: string, label?: string | null): string {
    if (label && label.trim()) return label.trim();
    const known = DEFAULT_PRODUCT_SLOTS.find(s => s.key === category);
    if (known) return known.label;
    const text = category.replace(/^produto_/, "").replace(/_+/g, " ").trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Foto";
}

/**
 * Fotos do produto de um relatório, na ordem em que foram pedidas (campo order = posição na configuração).
 * Relatórios antigos têm order 0 em todas: nesse caso vale a ordem de sempre (frontal, traseira, serial).
 */
export function productPhotosOf<T extends { category: string; order?: number }>(photos: T[]): T[] {
    const legacy = (c: string) => { const i = DEFAULT_PRODUCT_SLOTS.findIndex(s => s.key === c); return i < 0 ? 99 : i; };
    return photos
        .filter(p => isProductPhotoCategory(p.category))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || legacy(a.category) - legacy(b.category));
}

/** Config salva (possivelmente incompleta ou inválida) -> config completa; linha sem nada salvo usa o padrão. */
export function normalizeProductPhotoConfig(saved: unknown): ProductPhotoConfig {
    const out = {} as ProductPhotoConfig;
    const raw = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
    for (const line of PRODUCT_LINES) {
        const list = raw[line];
        if (!Array.isArray(list)) { out[line] = DEFAULT_PRODUCT_SLOTS; continue; }
        const seen = new Set<string>();
        const slots: ProductPhotoSlot[] = [];
        for (const item of list as any[]) {
            const label = typeof item?.label === "string" ? item.label.trim() : "";
            const key = typeof item?.key === "string" && isProductPhotoCategory(item.key) ? item.key : "";
            if (!label || !key || seen.has(key)) continue;
            seen.add(key);
            slots.push({ key, label, required: item.required !== false });
        }
        out[line] = slots; // lista vazia é válida: a linha não pede foto do produto
    }
    return out;
}
