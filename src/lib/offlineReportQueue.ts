import { openDB, type IDBPDatabase } from "idb";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import type { TechnicalReport, TechnicalReportPhotoCategory } from "@/lib/data";

const DB_NAME = "smartos-offline";
const STORE_NAME = "pending-reports";

export type PendingReportPhoto =
  | { category: TechnicalReportPhotoCategory; order: number; file: File } // precisa subir no flush
  | { category: TechnicalReportPhotoCategory; order: number; url: string; path: string }; // já tinha sido enviada antes (edição de relatório existente)

export type PendingReportPayload = Omit<TechnicalReport, "id" | "createdAt" | "updatedAt" | "photos">;

export type PendingReport = {
  localId: string;
  createdAt: number;
  existingReportId?: string;
  payload: PendingReportPayload;
  photos: PendingReportPhoto[];
  attempts: number;
  lastError?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

type Listener = (pending: PendingReport[]) => void;
const listeners = new Set<Listener>();

async function notifyListeners() {
  const pending = await getPendingReports();
  listeners.forEach((cb) => cb(pending));
}

export function subscribe(callback: Listener): () => void {
  listeners.add(callback);
  // Dispara uma vez de cara pra quem acabou de assinar já saber o estado atual.
  getPendingReports().then(callback);
  return () => listeners.delete(callback);
}

export async function queueReport(payload: PendingReportPayload, photos: PendingReportPhoto[], existingReportId?: string): Promise<void> {
  const db = await getDb();
  const record: PendingReport = {
    localId: crypto.randomUUID(),
    createdAt: Date.now(),
    existingReportId,
    payload,
    photos,
    attempts: 0,
  };
  await db.add(STORE_NAME, record);
  await notifyListeners();
}

export async function getPendingReports(): Promise<PendingReport[]> {
  const db = await getDb();
  const all = await db.getAll(STORE_NAME);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function removePending(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, localId);
}

async function markAttemptFailed(localId: string, error: string): Promise<void> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, localId);
  if (!record) return;
  record.attempts += 1;
  record.lastError = error;
  await db.put(STORE_NAME, record);
}

// Roda em segundo plano, sem travar o fluxo do técnico em campo - a nota fica
// disponível depois, na visualização do relatório e na lista do admin. Mesma
// lógica usada no salvamento online, só que aqui já com as fotos enviadas.
function scoreReportInBackground(id: string, photos: { category: TechnicalReportPhotoCategory; url: string }[]) {
  fetch("/api/reports/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos }),
  })
    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) return;
      return technicalReportService.update(id, {
        ...(data.score != null ? { aiScore: data.score } : {}),
        ...(data.feedback ? { aiScoreFeedback: data.feedback } : {}),
      });
    })
    .catch((e) => console.error("Falha ao pontuar relatório com IA", e));
}

let isFlushing = false;

/**
 * Percorre a fila em ordem, tentando subir cada relatório pendente (fotos +
 * dados). Para no primeiro erro (provavelmente sinal de que a conexão caiu de
 * novo) e deixa o resto pra próxima tentativa - não adianta insistir em vários
 * itens ao mesmo tempo sem internet de verdade.
 */
export async function flushQueue(): Promise<void> {
  if (isFlushing || !navigator.onLine) return;
  isFlushing = true;
  try {
    const pending = await getPendingReports();
    for (const item of pending) {
      try {
        const uploadedPhotos = await Promise.all(
          item.photos.map(async (p) => {
            if ("url" in p && "path" in p) return { category: p.category, url: p.url, path: p.path, order: p.order };
            const { url, path } = await technicalReportService.uploadReportPhoto(p.file, item.payload.serviceOrderNumber, p.category);
            return { category: p.category, url, path, order: p.order };
          })
        );

        const fullPayload = { ...item.payload, photos: uploadedPhotos };

        let id = item.existingReportId;
        if (id) {
          await technicalReportService.update(id, fullPayload);
        } else {
          id = await technicalReportService.create(fullPayload as any);
        }

        if (uploadedPhotos.length > 0) {
          scoreReportInBackground(id, uploadedPhotos.map((p) => ({ category: p.category, url: p.url })));
        }

        await removePending(item.localId);
        await notifyListeners();
      } catch (e: any) {
        await markAttemptFailed(item.localId, e?.message || "Erro desconhecido");
        await notifyListeners();
        // Provável queda de conexão de novo - para por aqui, tenta o resto depois.
        break;
      }
    }
  } finally {
    isFlushing = false;
  }
}
