import type { RouteStop, RoutePart } from "./data";

// Mescla de 3 vias para edição simultânea de uma rota: BASE = como a pessoa abriu/sincronizou,
// MINE = o que ela tem na tela agora, THEIRS = a versão mais recente no banco (alterada por outro
// admin ou pelo técnico no celular). Regra por campo: quem mudou em relação à BASE vence; se os dois
// mudaram o mesmo campo para valores diferentes, vale o da pessoa que está salvando (conta como conflito).

function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj).filter(k => obj[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "undefined";
}

export const sameValue = (a: unknown, b: unknown) => stable(a) === stable(b);

type Counter = { conflicts: number };

// Mescla campo a campo de dois objetos "planos" (ignora arrays aninhados que têm regra própria).
function mergeFields<T extends Record<string, any>>(base: T | undefined, mine: T, theirs: T, counter: Counter, skip: string[] = []): T {
    const out: Record<string, any> = {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base || {})]);
    keys.forEach(k => {
        if (skip.includes(k)) return;
        const b = base?.[k];
        const m = mine[k];
        const t = theirs[k];
        let value: unknown;
        if (sameValue(m, b)) value = t;                 // eu não mexi: vale o mais novo
        else if (sameValue(t, b)) value = m;            // só eu mexi
        else if (sameValue(m, t)) value = m;            // mexemos igual
        else { value = m; counter.conflicts++; }        // mexemos diferente: vale o meu
        if (value !== undefined) out[k] = value;
    });
    return out as T;
}

function mergeParts(base: RoutePart[] | undefined, mine: RoutePart[] | undefined, theirs: RoutePart[] | undefined, counter: Counter): RoutePart[] {
    const b = new Map((base || []).map(p => [p.code, p]));
    const t = new Map((theirs || []).map(p => [p.code, p]));
    const result: RoutePart[] = [];
    const seen = new Set<string>();
    (mine || []).forEach(m => {
        seen.add(m.code);
        const bp = b.get(m.code);
        const tp = t.get(m.code);
        if (!bp) { result.push(tp ? mergeFields(undefined, m, tp, counter) : m); return; }   // adicionada por mim
        if (!tp) { if (sameValue(bp, m)) return; result.push(m); counter.conflicts++; return; } // removida por outro
        result.push(mergeFields(bp, m, tp, counter));
    });
    (theirs || []).forEach(tp => {
        if (!seen.has(tp.code) && !b.has(tp.code)) result.push(tp);   // adicionada por outro
    });
    return result;
}

// Marcas calculadas só pra tela (aviso de CEP x cidade): não são dado da rota, ficam como estão na minha tela.
const EPHEMERAL_KEYS = ["zipMismatch", "zipMismatchDetails", "suggestedCityState"];

function mergeStop(base: RouteStop | undefined, mine: RouteStop, theirs: RouteStop, counter: Counter): RouteStop {
    const merged = mergeFields(base as any, mine as any, theirs as any, counter, ["parts", ...EPHEMERAL_KEYS]) as RouteStop;
    merged.parts = mergeParts(base?.parts, mine.parts, theirs.parts, counter);
    EPHEMERAL_KEYS.forEach(k => { if ((mine as any)[k] !== undefined) (merged as any)[k] = (mine as any)[k]; });
    return merged;
}

/**
 * Mescla as paradas. Ordem e inclusão/remoção de paradas seguem quem mexeu:
 *  - a ordem é a da minha tela; paradas novas de outros entram no fim;
 *  - parada que eu removi sai; parada que outro removeu sai, a menos que eu a tenha alterado.
 */
export function mergeStops(base: RouteStop[], mine: RouteStop[], theirs: RouteStop[]): { stops: RouteStop[]; conflicts: number } {
    const counter: Counter = { conflicts: 0 };
    const baseMap = new Map(base.map(s => [s.serviceOrder, s]));
    const theirsMap = new Map(theirs.map(s => [s.serviceOrder, s]));
    const mineKeys = new Set(mine.map(s => s.serviceOrder));
    const result: RouteStop[] = [];

    mine.forEach(m => {
        const b = baseMap.get(m.serviceOrder);
        const t = theirsMap.get(m.serviceOrder);
        if (!b) { result.push(t ? mergeStop(undefined, m, t, counter) : m); return; }
        if (!t) {
            if (sameValue(b, m)) return;      // outro removeu e eu não mexi: sai
            result.push(m);                   // outro removeu, mas eu alterei: mantém (e avisa)
            counter.conflicts++;
            return;
        }
        result.push(mergeStop(b, m, t, counter));
    });

    theirs.forEach(t => {
        if (!mineKeys.has(t.serviceOrder) && !baseMap.has(t.serviceOrder)) result.push(t);
    });
    return { stops: result, conflicts: counter.conflicts };
}

/** Mescla de campos simples da rota (nome, datas, técnico...). */
export function mergeRouteFields<T extends Record<string, any>>(base: T, mine: T, theirs: T): { fields: T; conflicts: number } {
    const counter: Counter = { conflicts: 0 };
    return { fields: mergeFields(base, mine, theirs, counter), conflicts: counter.conflicts };
}
