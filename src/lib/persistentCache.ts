import { openDB, type IDBPDatabase } from "idb";

// Cache de resultados de rota (matriz de tempos/km, trechos do mapa) que sobrevive a fechar o app e recarregar a
// página. Ruas e distâncias não mudam de um dia para o outro, então entrar de novo numa rota reaproveita o que já foi
// calculado em vez de chamar o servidor de rotas outra vez. Tudo é opcional: se o armazenamento do navegador falhar,
// as funções simplesmente devolvem "não achei" e o cálculo segue normal.

const DB_NAME = "smartos-geo";
const STORE = "kv";
const MAX_ENTRIES = 400; // evita crescer sem limite; apaga os mais antigos quando passa

type Entry = { v: unknown; at: number };

const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> | null {
    if (typeof indexedDB === "undefined") return null;
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, 1, {
            upgrade(d) {
                if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
            },
        });
        dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
}

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
    const now = Date.now();
    const m = memory.get(key);
    if (m && now - m.at < maxAgeMs) return m.v as T;
    try {
        const d = await db();
        const e = (await d?.get(STORE, key)) as Entry | undefined;
        if (e && now - e.at < maxAgeMs) {
            memory.set(key, e);
            return e.v as T;
        }
    } catch { /* sem armazenamento: calcula de novo */ }
    return undefined;
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
    const entry: Entry = { v: value, at: Date.now() };
    memory.set(key, entry);
    try {
        const d = await db();
        if (!d) return;
        await d.put(STORE, entry, key);
        // Poda: mantém só as entradas mais recentes.
        const count = await d.count(STORE);
        if (count > MAX_ENTRIES) {
            const keys = await d.getAllKeys(STORE);
            const all = await Promise.all(keys.map(async k => ({ k, at: ((await d.get(STORE, k)) as Entry | undefined)?.at ?? 0 })));
            all.sort((a, b) => a.at - b.at);
            await Promise.all(all.slice(0, count - MAX_ENTRIES + 40).map(x => d.delete(STORE, x.k)));
        }
    } catch { /* ok */ }
}

/**
 * Devolve do cache (memória ou aparelho) ou calcula, guarda e devolve. Pedidos iguais ao mesmo tempo dividem a
 * mesma chamada. Resultado `null/undefined` NÃO é guardado (falha do servidor deve tentar de novo na próxima vez).
 */
export async function cached<T>(key: string, maxAgeMs: number, compute: () => Promise<T | null | undefined>): Promise<T | null> {
    const hit = await cacheGet<T>(key, maxAgeMs);
    if (hit !== undefined) return hit;
    const running = inflight.get(key) as Promise<T | null> | undefined;
    if (running) return running;
    const p = (async () => {
        const value = await compute();
        if (value !== null && value !== undefined) await cacheSet(key, value);
        return (value ?? null) as T | null;
    })().finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
}

export const DAY_MS = 24 * 60 * 60 * 1000;
