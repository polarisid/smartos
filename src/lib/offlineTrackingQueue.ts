import type { Route } from "@/lib/data";
import { routeService } from "@/services/supabase/routeService";
import { isNetworkLikeError } from "@/lib/reportUploader";

// Fila de códigos de rastreio bipados sem internet. Cada item é pequeno (texto), então fica no
// localStorage do aparelho e sobrevive a fechar o app ou recarregar a página. Quando a conexão volta,
// os códigos são gravados na rota com o mesmo caminho seguro de sempre (patchPartTracking: lê a rota na
// hora, só grava o que é novo e respeita quem bipou ao mesmo tempo).

export type TrackingEntry = { serviceOrder: string; partCode: string; trackingCode: string };
type PendingTracking = TrackingEntry & { routeId: string; at: number };

const KEY = "smartos_pending_tracking_v1";
type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let flushing: Promise<FlushTrackingResult> | null = null;

function read(): PendingTracking[] {
    try {
        const raw = localStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function write(list: PendingTracking[]) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem espaço/armazenamento: nada a fazer */ }
    listeners.forEach(l => l(list.length));
}

export function pendingTrackingCount(): number {
    return read().length;
}

export function subscribeTracking(cb: Listener): () => void {
    listeners.add(cb);
    cb(read().length);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(read().length); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

function queueTracking(routeId: string, entries: TrackingEntry[]) {
    const list = read();
    for (const e of entries) {
        const code = e.trackingCode.trim();
        if (!code) continue;
        // Mesma peça bipada de novo: vale a última leitura.
        const i = list.findIndex(p => p.routeId === routeId && p.serviceOrder === e.serviceOrder && p.partCode === e.partCode);
        const item: PendingTracking = { routeId, serviceOrder: e.serviceOrder, partCode: e.partCode, trackingCode: code, at: Date.now() };
        if (i >= 0) list[i] = item; else list.push(item);
    }
    write(list);
}

/** Códigos desta rota que ainda estão guardados no aparelho: { OS: { peça: código } }. */
export function pendingCodesForRoute(routeId: string): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    read().filter(p => p.routeId === routeId).forEach(p => {
        (out[p.serviceOrder] ||= {})[p.partCode] = p.trackingCode;
    });
    return out;
}

/** Põe por cima da tela o que ainda não subiu (para uma recarga sem internet não "perder" o que foi bipado). */
export function overlayPendingCodes(routeId: string, codes: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
    const pending = pendingCodesForRoute(routeId);
    const out: Record<string, Record<string, string>> = {};
    Object.keys(codes).forEach(so => { out[so] = { ...codes[so], ...(pending[so] || {}) }; });
    return out;
}

export type SaveTrackingResult = { route: Route | null; written: number; queued: boolean };

/**
 * Grava os códigos na rota. Sem internet (ou com a conexão falhando), guarda no aparelho para enviar
 * sozinho depois e devolve queued=true; erro que não é de conexão continua sendo lançado.
 */
export async function savePartTracking(routeId: string, entries: TrackingEntry[]): Promise<SaveTrackingResult> {
    const real = entries.filter(e => e.trackingCode.trim());
    if (real.length === 0) {
        const { route, written } = await routeService.patchPartTracking(routeId, entries);
        return { route, written, queued: false };
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueTracking(routeId, real);
        return { route: null, written: 0, queued: true };
    }
    try {
        const { route, written } = await routeService.patchPartTracking(routeId, real);
        return { route, written, queued: false };
    } catch (e) {
        if (isNetworkLikeError(e)) {
            queueTracking(routeId, real);
            return { route: null, written: 0, queued: true };
        }
        throw e;
    }
}

export type FlushTrackingResult = { sent: number; remaining: number };

/** Envia o que ficou guardado. Para na primeira falha de conexão e tenta de novo depois. */
export function flushTrackingQueue(): Promise<FlushTrackingResult> {
    if (typeof window === "undefined") return Promise.resolve({ sent: 0, remaining: 0 });
    if (flushing) return flushing;
    flushing = (async () => {
        let sent = 0;
        if (!navigator.onLine) return { sent, remaining: read().length };
        const byRoute = new Map<string, PendingTracking[]>();
        read().forEach(p => { (byRoute.get(p.routeId) || byRoute.set(p.routeId, []).get(p.routeId)!).push(p); });

        for (const [routeId, items] of byRoute) {
            const done = (list: PendingTracking[]) => list.filter(p => !items.some(i => i.routeId === p.routeId && i.serviceOrder === p.serviceOrder && i.partCode === p.partCode && i.at === p.at));
            try {
                const { written } = await routeService.patchPartTracking(routeId, items.map(i => ({ serviceOrder: i.serviceOrder, partCode: i.partCode, trackingCode: i.trackingCode })));
                sent += written;
                write(done(read()));
            } catch (e: any) {
                if (isNetworkLikeError(e)) break; // sem conexão: tenta mais tarde
                // Rota apagada: não há onde gravar, descarta. Outros erros ficam na fila para a próxima tentativa.
                if (/não encontrada/i.test(e?.message || "")) write(done(read()));
            }
        }
        return { sent, remaining: read().length };
    })().finally(() => { flushing = null; });
    return flushing;
}
