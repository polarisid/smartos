// Páginas do técnico que precisam abrir SEM internet. O service worker guarda cada uma depois de a
// pessoa (ou o pré-carregamento abaixo) pedi-la uma vez com internet - ver next.config.js (cache "app-pages").
export const OFFLINE_PAGES = ["/", "/routes", "/reports", "/meus-relatorios", "/producao", "/scanner", "/dashboard", "/ranking", "/ajuda"];

const WARM_KEY = "smartos_pages_warmed_at";

/** Pede cada página uma vez (com internet) para o service worker deixá-las guardadas para uso sem sinal. */
export async function warmOfflinePages(force = false): Promise<number> {
    if (typeof window === "undefined" || !navigator.onLine) return 0;
    try {
        const last = Number(localStorage.getItem(WARM_KEY) || 0);
        if (!force && Date.now() - last < 6 * 60 * 60 * 1000) return 0; // a cada 6h basta
    } catch { /* sem localStorage: aquece mesmo assim */ }

    let ok = 0;
    for (const path of OFFLINE_PAGES) {
        try {
            const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
            if (res.ok) ok++;
        } catch { /* sinal caiu no meio: tenta na próxima */ }
    }
    if (ok > 0) {
        try { localStorage.setItem(WARM_KEY, String(Date.now())); } catch { /* ok */ }
    }
    return ok;
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
        const cache = names.includes("app-pages") ? await caches.open("app-pages") : null;
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
