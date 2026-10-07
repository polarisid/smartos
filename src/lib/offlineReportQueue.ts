import { openDB, type IDBPDatabase } from "idb";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import type { TechnicalReport, TechnicalReportPhotoCategory } from "@/lib/data";
import { uploadPhotoBatch, withTimeout, type UploadProgress } from "@/lib/reportUploader";

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

// No banco as fotos novas ficam como bytes (ArrayBuffer), não como File/Blob: o IndexedDB do
// Chrome no Android falha com "Failed to write blobs (InvalidBlob)" ao gravar Blobs em alguns
// aparelhos (arquivo temporário da câmera já liberado, pouco espaço...). Bytes comuns não têm
// esse problema. Ao ler, volta a ser File - o resto do app não percebe a diferença.
type StoredPhoto =
  | PendingReportPhoto
  | { category: TechnicalReportPhotoCategory; order: number; data: ArrayBuffer; name: string; type: string; lastModified: number };
type StoredReport = Omit<PendingReport, "photos"> & { photos: StoredPhoto[] };

async function serializePhotos(photos: PendingReportPhoto[]): Promise<StoredPhoto[]> {
  const out: StoredPhoto[] = [];
  for (const p of photos) {
    if (!("file" in p)) { out.push(p); continue; }
    let data: ArrayBuffer;
    try {
      data = await p.file.arrayBuffer();
    } catch {
      throw new Error("Uma das fotos não pôde ser lida pelo aparelho (pode ter sido apagada da memória). Remova a foto com problema e tire de novo.");
    }
    out.push({ category: p.category, order: p.order, data, name: p.file.name, type: p.file.type, lastModified: p.file.lastModified });
  }
  return out;
}

function deserializePhotos(photos: StoredPhoto[]): PendingReportPhoto[] {
  return photos.map((p) =>
    "data" in p
      ? { category: p.category, order: p.order, file: new File([p.data], p.name, { type: p.type, lastModified: p.lastModified }) }
      : p
  );
}

function friendlyStorageError(e: any): Error {
  const name = e?.name || "";
  if (name === "QuotaExceededError") return new Error("O aparelho está sem espaço para guardar o relatório. Libere espaço (apague fotos/vídeos antigos) e tente de novo.");
  return e instanceof Error ? e : new Error(String(e));
}

export async function queueReport(payload: PendingReportPayload, photos: PendingReportPhoto[], existingReportId?: string): Promise<void> {
  const storedPhotos = await serializePhotos(photos);
  const record: StoredReport = {
    localId: crypto.randomUUID(),
    createdAt: Date.now(),
    existingReportId,
    payload,
    photos: storedPhotos,
    attempts: 0,
  };
  try {
    const db = await getDb();
    await db.add(STORE_NAME, record);
  } catch (e) {
    throw friendlyStorageError(e);
  }
  await notifyListeners();
}

export async function getPendingReports(): Promise<PendingReport[]> {
  const db = await getDb();
  const all = (await db.getAll(STORE_NAME)) as StoredReport[];
  return all
    .map((r): PendingReport => ({ ...r, photos: deserializePhotos(r.photos) }))
    .sort((a, b) => a.createdAt - b.createdAt);
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


// ── Estado do envio (pro aviso no topo mostrar andamento/erro/sucesso) ──────

export type SyncState = {
  isFlushing: boolean;
  /** Qual relatório está sendo enviado (1-based) e quantos há na fila nessa rodada. */
  position?: { index: number; total: number };
  step?: "uploading" | "saving";
  progress?: UploadProgress;
  /** Resultado da última rodada (para toast de sucesso/erro). */
  lastResult?: { at: number; sent: number; failed: number; error?: string };
};

let syncState: SyncState = { isFlushing: false };
const syncListeners = new Set<(s: SyncState) => void>();

function setSyncState(patch: Partial<SyncState>) {
  syncState = { ...syncState, ...patch };
  syncListeners.forEach((cb) => cb(syncState));
}

export function subscribeSync(callback: (s: SyncState) => void): () => void {
  syncListeners.add(callback);
  callback(syncState);
  return () => syncListeners.delete(callback);
}

export type FlushResult =
  | { status: "skipped-offline" }
  | { status: "skipped-running" }
  | { status: "empty" }
  | { status: "done"; sent: number; failed: number; error?: string };

async function updatePending(localId: string, mutate: (r: StoredReport) => void): Promise<void> {
  const db = await getDb();
  const record = await db.get(STORE_NAME, localId);
  if (!record) return;
  mutate(record);
  await db.put(STORE_NAME, record);
}

/**
 * Sobe as fotos que ainda são arquivo (as já enviadas - tentativas anteriores ou edição - ficam
 * como estão), cria/atualiza o relatório e dispara a nota da IA. Devolve o id do relatório.
 * Usado pela fila (em segundo plano) e pelo envio direto (quando guardar no aparelho falha).
 */
async function sendReportItem(
  item: Pick<PendingReport, "payload" | "photos" | "existingReportId">,
  hooks: {
    onPhotoDone?: (index: number, uploaded: { url: string; path: string }) => void;
    onCreated?: (id: string) => void | Promise<void>;
  } = {}
): Promise<string> {
  const jobs = item.photos
    .map((p, idx) => ({ p, idx }))
    .filter((x): x is { p: Extract<PendingReportPhoto, { file: File }>; idx: number } => "file" in x.p)
    .map(({ p, idx }) => ({ id: String(idx), file: p.file, category: p.category }));

  const results = await uploadPhotoBatch(jobs, item.payload.serviceOrderNumber, {
    onProgress: (progress) => setSyncState({ progress }),
    onPhotoDone: (id, up) => hooks.onPhotoDone?.(Number(id), up),
  });

  const uploadedPhotos = item.photos.map((p, idx) => {
    if ("file" in p) {
      const r = results.get(String(idx))!;
      return { category: p.category, url: r.url, path: r.path, order: p.order };
    }
    return { category: p.category, url: p.url, path: p.path, order: p.order };
  });

  setSyncState({ step: "saving", progress: undefined });
  const fullPayload = { ...item.payload, photos: uploadedPhotos };

  let id = item.existingReportId;
  if (id) {
    await withTimeout(technicalReportService.update(id, fullPayload), 60000, "O servidor demorou demais para responder.");
  } else {
    id = await withTimeout(technicalReportService.create(fullPayload as any), 60000, "O servidor demorou demais para responder.");
    // Já criado: se algo falhar depois, a próxima rodada atualiza este relatório em vez de duplicar.
    await hooks.onCreated?.(id);
  }

  if (uploadedPhotos.length > 0) {
    scoreReportInBackground(id, uploadedPhotos.map((p) => ({ category: p.category, url: p.url })));
  }
  return id;
}

/**
 * Plano B quando não dá pra guardar o relatório no aparelho (IndexedDB falhou): envia agora,
 * direto da memória. Exige internet; se falhar, o erro sobe pro técnico ver.
 */
export async function sendReportDirectly(payload: PendingReportPayload, photos: PendingReportPhoto[], existingReportId?: string): Promise<string> {
  setSyncState({ isFlushing: false, step: "uploading", progress: undefined });
  try {
    return await sendReportItem({ payload, photos, existingReportId });
  } finally {
    setSyncState({ step: undefined, progress: undefined });
  }
}

let isFlushing = false;

/**
 * Percorre a fila em ordem, tentando subir cada relatório pendente (fotos +
 * dados). Para no primeiro erro (provavelmente sinal de que a conexão caiu de
 * novo) e deixa o resto pra próxima tentativa. Devolve o que aconteceu - antes
 * retornava vazio e o botão "Tentar agora" ficava mudo, sem dizer se enviou,
 * se já estava enviando ou se deu erro.
 */
export async function flushQueue(): Promise<FlushResult> {
  if (isFlushing) return { status: "skipped-running" };
  if (!navigator.onLine) return { status: "skipped-offline" };
  isFlushing = true;

  let sent = 0;
  let failed = 0;
  let error: string | undefined;
  try {
    // Relatórios que entram na fila enquanto este envio roda (o técnico salvou
    // outro em seguida) são pegos na mesma rodada, sem esperar o próximo ciclo.
    let rounds = 0;
    let firstRound = true;
    while (true) {
    const pending = await getPendingReports();
    if (pending.length === 0) {
      if (firstRound) return { status: "empty" };
      break;
    }
    firstRound = false;
    setSyncState({ isFlushing: true, position: { index: 1, total: pending.length }, step: "uploading", progress: undefined });

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setSyncState({ position: { index: i + 1, total: pending.length }, step: "uploading", progress: undefined });
      try {
        // Cada foto concluída é gravada na hora no aparelho - se cair de novo, a próxima
        // tentativa não reenvia. O relatório criado também é lembrado (evita duplicar).
        await sendReportItem(item, {
          onPhotoDone: (idx, up) => {
            void updatePending(item.localId, (r) => {
              const original = r.photos[idx];
              if (original && ("file" in original || "data" in original)) {
                r.photos[idx] = { category: original.category, order: original.order, url: up.url, path: up.path };
              }
            });
          },
          onCreated: async (createdId) => {
            await updatePending(item.localId, (r) => { r.existingReportId = createdId; });
          },
        });

        await removePending(item.localId);
        await notifyListeners();
        sent++;
      } catch (e: any) {
        failed++;
        error = e?.message || "Erro desconhecido";
        await markAttemptFailed(item.localId, error!);
        await notifyListeners();
        // Provável queda de conexão de novo - para por aqui, tenta o resto depois.
        break;
      }
    }
    if (failed > 0 || ++rounds >= 5) break;
    }
    return { status: "done", sent, failed, error };
  } finally {
    isFlushing = false;
    setSyncState({
      isFlushing: false,
      position: undefined,
      step: undefined,
      progress: undefined,
      ...(sent > 0 || failed > 0 ? { lastResult: { at: Date.now(), sent, failed, error } } : {}),
    });
  }
}
