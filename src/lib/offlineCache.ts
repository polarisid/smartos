import { openDB, type IDBPDatabase } from "idb";
import type { AppUser } from "./data";

// ── Sessão para uso sem internet ───────────────────────────────────────────────
// O login (token) pode vencer enquanto o técnico está sem sinal e o app não consegue renová-lo.
// Guardamos o último usuário/perfil conhecido pra abrir o app mesmo assim (só leitura do que
// já estava em cache). Volta ao normal quando a conexão volta. Apagado no logout.

const SESSION_KEY = "smartos_offline_session";

export type OfflineSession = { user: any; appUser: AppUser; savedAt: number };

export function saveOfflineSession(user: any, appUser: AppUser): void {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ user, appUser, savedAt: Date.now() } satisfies OfflineSession));
    } catch { /* sem localStorage: segue sem modo offline de sessão */ }
}

export function loadOfflineSession(): OfflineSession | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as OfflineSession) : null;
    } catch {
        return null;
    }
}

export function clearOfflineSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ok */ }
}

// ── Cache dos dados (React Query) em IndexedDB ────────────────────────────────

const DB_NAME = "smartos-cache";
const STORE = "query-cache";
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheRecord = { state: unknown; savedAt: number };

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDb(): Promise<IDBPDatabase> {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            },
        });
    }
    return dbPromise;
}

export async function saveQueryCache(uid: string, state: unknown): Promise<number> {
    const savedAt = Date.now();
    try {
        const db = await getDb();
        await db.put(STORE, { state, savedAt } satisfies CacheRecord, uid);
    } catch (e) {
        console.warn("Não foi possível guardar o cache offline:", e);
    }
    return savedAt;
}

export async function loadQueryCache(uid: string): Promise<CacheRecord | null> {
    try {
        const db = await getDb();
        const rec = (await db.get(STORE, uid)) as CacheRecord | undefined;
        if (!rec) return null;
        if (Date.now() - rec.savedAt > CACHE_MAX_AGE_MS) {
            await db.delete(STORE, uid);
            return null;
        }
        return rec;
    } catch {
        return null;
    }
}

export async function clearQueryCache(): Promise<void> {
    try {
        const db = await getDb();
        await db.clear(STORE);
    } catch { /* ok */ }
}
