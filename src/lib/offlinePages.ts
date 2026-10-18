// Páginas do técnico que precisam abrir SEM internet. Ficam guardadas no cache "app-pages" (o mesmo que o
// service worker consulta quando a rede falha - ver next.config.js).
export const OFFLINE_PAGES = ["/", "/routes", "/reports", "/meus-relatorios", "/producao", "/scanner", "/dashboard", "/ranking", "/ajuda"];

export const PAGES_CACHE = "app-pages";
const WARM_KEY = "smartos_pages_warmed_at";
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Guarda as telas para uso sem sinal. Grava DIRETO no cache (não depende de o service worker já estar no
 * controle da página - antes, abrir o app logo após uma atualização deixava as telas sem guardar) e só busca o
 * que falta ou está velho. Devolve quantas telas foram (re)guardadas.
 */
export async function warmOfflinePages(force = false): Promise<number> {
    if (typeof window === "undefined" || !navigator.onLine || !("caches" in window)) return 0;
    try {
        const cache = await caches.open(PAGES_CACHE);
        let last = 0;
        try { last = Number(localStorage.getItem(WARM_KEY) || 0); } catch { /* sem localStorage */ }
        const stale = force || Date.now() - last > REFRESH_AFTER_MS;

        let ok = 0;
        for (const path of OFFLINE_PAGES) {
            if (!stale && (await cache.match(path, { ignoreSearch: true }))) continue; // já guardada e recente
            try {
                const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
                if (res.ok && !res.redirected) {
                    await cache.put(path, res.clone());
                    ok++;
                }
            } catch { /* sinal caiu no meio: tenta na próxima */ }
        }
        if (stale && ok > 0) {
            try { localStorage.setItem(WARM_KEY, String(Date.now())); } catch { /* ok */ }
        }
        return ok;
    } catch {
        return 0;
    }
}

export type ReadinessLine = { label: string; ok: boolean; detail: string };

/** O que já está pronto para funcionar sem internet neste aparelho. */
export async function offlineReadiness(): Promise<ReadinessLine[]> {
    const lines: ReadinessLine[] = [];
    const sw = typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const controlled = !!sw?.controller;
    lines.push({
        label: "App instalado para uso sem sinal (service worker)",
        ok: controlled,
        detail: controlled ? "ativo" : "ainda não ativo. Abra o app com internet, espere uns segundos e recarregue a página uma vez.",
    });

    try {
        const names = await caches.keys();
        const cache = names.includes(PAGES_CACHE) ? await caches.open(PAGES_CACHE) : null;
        const keys = cache ? await cache.keys() : [];
        const have = new Set(keys.map(k => new URL(k.url).pathname));
        const missing = OFFLINE_PAGES.filter(p => !have.has(p));
        lines.push({
            label: "Telas guardadas no aparelho",
            ok: missing.length === 0,
            detail: missing.length === 0 ? OFFLINE_PAGES.length + " telas prontas" : "faltam: " + missing.join(", ") + ". Use “Preparar para usar sem sinal”.",
        });
    } catch {
        lines.push({ label: "Telas guardadas no aparelho", ok: false, detail: "este navegador não permite guardar telas" });
    }
    return lines;
}
