// Envio das fotos do relatório técnico: poucas por vez, com retentativa e
// progresso. Antes eram TODAS ao mesmo tempo (um relatório com 15+ fotos
// saturava o sinal do celular e travava) e sem nenhum aviso de andamento.

import type { TechnicalReportPhotoCategory } from "@/lib/data";
import { technicalReportService } from "@/services/supabase/technicalReportService";

export type UploadJob = { id: string; file: File; category: TechnicalReportPhotoCategory };
export type UploadedPhoto = { url: string; path: string };

export type UploadProgress = {
  doneCount: number;
  totalCount: number;
  loadedBytes: number;
  totalBytes: number;
  /** 0..1 pelo total de bytes (mais fiel que contar fotos). */
  fraction: number;
  /** Fotos que falharam e estão sendo tentadas de novo agora. */
  retrying: number;
};

export class UploadBatchError extends Error {
  failedIds: string[];
  network: boolean;
  constructor(message: string, failedIds: string[], network: boolean) {
    super(message);
    this.name = "UploadBatchError";
    this.failedIds = failedIds;
    this.network = network;
  }
}

/** Erro de conexão (vale guardar pra enviar depois) x erro definitivo (permissão etc.). */
export function isNetworkLikeError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const err = e as any;
  if (err?.network === true) return true;
  if (err?.network === false) return false;
  return e instanceof TypeError || /fetch|network/i.test(err?.message || "");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function uploadPhotoBatch(
  jobs: UploadJob[],
  serviceOrderNumber: string,
  opts: {
    concurrency?: number;
    maxAttempts?: number;
    onProgress?: (p: UploadProgress) => void;
    /** Chamado a cada foto concluída - quem chama grava na hora, pra uma nova tentativa não reenviar o que já foi. */
    onPhotoDone?: (id: string, photo: UploadedPhoto) => void;
  } = {}
): Promise<Map<string, UploadedPhoto>> {
  const concurrency = opts.concurrency ?? 3;
  const maxAttempts = opts.maxAttempts ?? 3;
  const results = new Map<string, UploadedPhoto>();
  if (jobs.length === 0) return results;

  const totalBytes = jobs.reduce((sum, j) => sum + j.file.size, 0) || 1;
  const loaded = new Map<string, number>(jobs.map((j) => [j.id, 0]));
  let retrying = 0;
  let lastEmit = 0;

  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 150) return;
    lastEmit = now;
    let loadedBytes = 0;
    loaded.forEach((v) => (loadedBytes += v));
    opts.onProgress?.({
      doneCount: results.size,
      totalCount: jobs.length,
      loadedBytes,
      totalBytes,
      fraction: Math.min(loadedBytes / totalBytes, 1),
      retrying,
    });
  };

  const failures: { id: string; error: unknown }[] = [];
  let next = 0;

  const worker = async () => {
    while (failures.length === 0) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      // Caminho fixo por foto: numa retentativa o servidor reconhece "já existe".
      const path = technicalReportService.buildPhotoPath(job.file, serviceOrderNumber, job.category);

      for (let attempt = 1; ; attempt++) {
        loaded.set(job.id, 0);
        try {
          const uploaded = await technicalReportService.uploadReportPhoto(job.file, serviceOrderNumber, job.category, {
            path,
            onProgress: (l) => {
              loaded.set(job.id, l);
              emit();
            },
          });
          loaded.set(job.id, job.file.size);
          results.set(job.id, uploaded);
          opts.onPhotoDone?.(job.id, uploaded);
          emit(true);
          break;
        } catch (error) {
          const retryable = isNetworkLikeError(error) && !(typeof navigator !== "undefined" && !navigator.onLine);
          if (!retryable || attempt >= maxAttempts || failures.length > 0) {
            failures.push({ id: job.id, error });
            break;
          }
          retrying++;
          emit(true);
          await sleep(1500 * attempt);
          retrying--;
        }
      }
    }
  };

  emit(true);
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

  if (failures.length > 0) {
    const first = failures[0].error as any;
    throw new UploadBatchError(
      first?.message || "Falha ao enviar as fotos.",
      failures.map((f) => f.id),
      isNetworkLikeError(first)
    );
  }
  return results;
}

/** Chamadas ao banco sem prazo ficavam penduradas pra sempre em conexão instável. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(message), { network: true })), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
