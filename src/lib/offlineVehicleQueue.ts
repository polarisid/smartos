import type { VehicleFuelLog, VehicleKmLog } from "@/lib/data";
import { vehicleService } from "@/services/supabase/vehicleService";
import { isNetworkLikeError } from "@/lib/reportUploader";

// Fila de km e abastecimentos lançados pelo celular sem internet. Cada item é pequeno (texto), então fica no
// localStorage e sobrevive a fechar o app. Os itens sobem na ordem em que foram lançados. O id do registro é
// gerado no aparelho, então reenviar o mesmo item (a resposta se perdeu) não duplica no banco.

type KmOpenInput = Omit<VehicleKmLog, "id">;
type FuelInput = Omit<VehicleFuelLog, "id">;

type QueueItem =
    | { kind: "km_open"; id: string; at: number; unidadeId: string | null; data: KmOpenInput }
    | { kind: "km_close"; id: string; at: number; odometerEnd: number }
    | { kind: "fuel"; id: string; at: number; unidadeId: string | null; data: FuelInput };

const KEY = "smartos_pending_vehicle_v1";
type Listener = (count: number) => void;
const listeners = new Set<Listener>();
let flushing: Promise<FlushVehicleResult> | null = null;

function read(): QueueItem[] {
    try {
        const raw = localStorage.getItem(KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch { return []; }
}

function write(list: QueueItem[]) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento: nada a fazer */ }
    listeners.forEach(l => l(list.length));
}

export function pendingVehicleCount(): number {
    return read().length;
}

export function subscribeVehicleQueue(cb: Listener): () => void {
    listeners.add(cb);
    cb(read().length);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(read().length); };
    window.addEventListener("storage", onStorage);
    return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}

/** uuid v4; crypto.randomUUID só existe em páginas seguras (https/localhost), e o app pode abrir por IP da rede local. */
export function newClientId(): string {
    const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
    if (c?.randomUUID) return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, b => b.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}

/** Saídas lançadas neste aparelho que ainda não subiram, como registros prontos para a tela (em uso, sem chegada). */
export function pendingKmLogs(): VehicleKmLog[] {
    const list = read();
    const closes = new Map<string, number>();
    list.forEach(i => { if (i.kind === "km_close") closes.set(i.id, i.odometerEnd); });
    return list
        .filter((i): i is Extract<QueueItem, { kind: "km_open" }> => i.kind === "km_open")
        .map(i => ({ ...i.data, id: i.id, odometerEnd: closes.get(i.id) ?? i.data.odometerEnd }));
}

/** Chegadas lançadas neste aparelho que ainda não subiram: id do registro -> hodômetro de chegada. */
export function pendingKmCloses(): Map<string, number> {
    const m = new Map<string, number>();
    read().forEach(i => { if (i.kind === "km_close") m.set(i.id, i.odometerEnd); });
    return m;
}

export type SaveVehicleResult = { id: string; queued: boolean };

/** Tenta gravar agora; sem internet (ou conexão falhando) guarda no aparelho e devolve queued=true. */
async function tryOrQueue(item: QueueItem, send: () => Promise<void>): Promise<SaveVehicleResult> {
    const queue = () => { write([...read(), item]); return { id: item.id, queued: true }; };
    // Se já há itens esperando, entra no fim da fila para manter a ordem (ex.: a chegada depois da saída).
    if (read().length > 0 || (typeof navigator !== "undefined" && !navigator.onLine)) return queue();
    try {
        await send();
        return { id: item.id, queued: false };
    } catch (e) {
        if (isNetworkLikeError(e)) return queue();
        throw e;
    }
}

export function saveKmOpen(data: KmOpenInput, unidadeId: string | null): Promise<SaveVehicleResult> {
    const id = newClientId();
    return tryOrQueue(
        { kind: "km_open", id, at: Date.now(), unidadeId, data },
        async () => { await vehicleService.createKmLog({ ...data, id }, unidadeId); }
    );
}

export function saveKmClose(logId: string, odometerEnd: number): Promise<SaveVehicleResult> {
    return tryOrQueue(
        { kind: "km_close", id: logId, at: Date.now(), odometerEnd },
        () => vehicleService.closeKmLog(logId, odometerEnd)
    );
}

export function saveFuel(data: FuelInput, unidadeId: string | null): Promise<SaveVehicleResult> {
    const id = newClientId();
    return tryOrQueue(
        { kind: "fuel", id, at: Date.now(), unidadeId, data },
        async () => { await vehicleService.createFuelLog({ ...data, id }, unidadeId); }
    );
}

export type FlushVehicleResult = { sent: number; remaining: number; rejected: number };

async function sendItem(item: QueueItem): Promise<void> {
    if (item.kind === "km_open") await vehicleService.createKmLog({ ...item.data, id: item.id }, item.unidadeId);
    else if (item.kind === "km_close") await vehicleService.closeKmLog(item.id, item.odometerEnd);
    else await vehicleService.createFuelLog({ ...item.data, id: item.id }, item.unidadeId);
}

/**
 * Envia o que ficou guardado, na ordem. Para na primeira falha de conexão (tenta de novo depois).
 * Item recusado pelo servidor por outro motivo (dado inválido) sai da fila para não travar os demais
 * e é contado em `rejected`, para a tela avisar que precisa ser lançado de novo.
 */
export function flushVehicleQueue(): Promise<FlushVehicleResult> {
    if (typeof window === "undefined") return Promise.resolve({ sent: 0, remaining: 0, rejected: 0 });
    if (flushing) return flushing;
    flushing = (async () => {
        let sent = 0;
        let rejected = 0;
        if (!navigator.onLine) return { sent, remaining: read().length, rejected };
        for (const item of read()) {
            try {
                await sendItem(item);
                sent++;
            } catch (e) {
                if (isNetworkLikeError(e)) break;
                console.error("Item da fila de veículos recusado:", item.kind, e);
                rejected++;
            }
            // Sai da fila (enviado, ou recusado de vez). Relê porque novos itens podem ter entrado durante o envio.
            write(read().filter(p => !(p.kind === item.kind && p.id === item.id && p.at === item.at)));
        }
        return { sent, remaining: read().length, rejected };
    })().finally(() => { flushing = null; });
    return flushing;
}
