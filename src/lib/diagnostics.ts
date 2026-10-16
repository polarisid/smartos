import { openDB } from "idb";
import { supabase } from "@/lib/supabase";
import { technicalReportService, PhotoUploadError } from "@/services/supabase/technicalReportService";

export type DiagnosticLine = { label: string; status: "ok" | "warn" | "fail"; detail: string };

const BASE = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const ms = (t0: number) => `${Math.round(performance.now() - t0)} ms`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

function randomBytes(size: number): Uint8Array {
    const out = new Uint8Array(size);
    // getRandomValues aceita no máx. 64 KB por chamada
    for (let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(i + 65536, size)));
    return out;
}

async function testStorageOnDevice(): Promise<DiagnosticLine[]> {
    const lines: DiagnosticLine[] = [];
    let db;
    try {
        db = await openDB("smartos-diagnostico", 1, { upgrade(d) { d.createObjectStore("t"); } });
    } catch (e: any) {
        return [{ label: "Armazenamento do aparelho", status: "fail", detail: `não abriu o banco local (${e?.name || "erro"}: ${e?.message || e}). Pode ser aba anônima/visitante ou armazenamento bloqueado.` }];
    }
    try {
        await db.put("t", randomBytes(200 * 1024).buffer, "bytes");
        const back = await db.get("t", "bytes");
        lines.push({ label: "Guardar fotos como bytes (usado hoje)", status: back ? "ok" : "fail", detail: back ? "gravou e leu 200 KB" : "gravou mas não leu de volta" });
    } catch (e: any) {
        lines.push({ label: "Guardar fotos como bytes (usado hoje)", status: "fail", detail: `${e?.name}: ${e?.message}` });
    }
    try {
        await db.put("t", new Blob([randomBytes(200 * 1024)], { type: "image/jpeg" }), "blob");
        lines.push({ label: "Guardar como arquivo (Blob)", status: "ok", detail: "gravou 200 KB" });
    } catch (e: any) {
        lines.push({ label: "Guardar como arquivo (Blob)", status: "warn", detail: `${e?.name}: ${e?.message} (o app não depende disso)` });
    }
    try {
        const est = await navigator.storage?.estimate?.();
        if (est?.quota) lines.push({ label: "Espaço disponível", status: (est.quota - (est.usage || 0)) < 100 * 1024 * 1024 ? "warn" : "ok", detail: `${kb(est.quota - (est.usage || 0))} livres de ${kb(est.quota)}` });
    } catch { /* sem estimate */ }
    db.close();
    return lines;
}

async function timedFetch(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<{ status: number; time: string } | { error: string }> {
    const t0 = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { headers, cache: "no-store", signal: controller.signal });
        return { status: res.status, time: ms(t0) };
    } catch (e: any) {
        if (e?.name === "AbortError") return { error: `o servidor aceitou a conexão mas não respondeu em ${Math.round(timeoutMs / 1000)}s (servidor lento ou travado)` };
        return { error: e?.message || String(e) };
    } finally {
        clearTimeout(timer);
    }
}

async function testUpload(size: number, token: string): Promise<DiagnosticLine> {
    const label = `Enviar arquivo de ${kb(size)}`;
    const file = new File([randomBytes(size)], "diagnostico.jpg", { type: "image/jpeg" });
    const t0 = performance.now();
    try {
        const path = `diagnostico/${token}-${size}.jpg`;
        await technicalReportService.uploadReportPhoto(file, "diagnostico", "defeito", { path, stallTimeoutMs: 40000 });
        const seconds = (performance.now() - t0) / 1000;
        try { await technicalReportService.deleteReportPhoto(path); } catch { /* limpeza é opcional */ }
        return { label, status: "ok", detail: `enviou em ${seconds.toFixed(1)} s (${kb(size / Math.max(seconds, 0.001))}/s)` };
    } catch (e: any) {
        if (e instanceof PhotoUploadError) {
            return {
                label, status: "fail",
                detail: e.status
                    ? `o servidor respondeu HTTP ${e.status}: ${e.message}`
                    : `sem resposta do servidor (${e.message}). Rede, firewall/antivírus, extensão do navegador ou bloqueio de CORS.`,
            };
        }
        return { label, status: "fail", detail: e?.message || String(e) };
    }
}

/** Testa, em ordem, tudo que o envio de relatório precisa. Não altera dados (os arquivos de teste são apagados). */
export async function runDiagnostics(onLine: (l: DiagnosticLine) => void): Promise<DiagnosticLine[]> {
    const all: DiagnosticLine[] = [];
    const push = (l: DiagnosticLine) => { all.push(l); onLine(l); };

    push({ label: "Navegador", status: "ok", detail: `${navigator.userAgent.slice(0, 120)} · endereço ${location.host}` });
    push({
        label: "Conexão do aparelho",
        status: navigator.onLine ? "ok" : "fail",
        detail: navigator.onLine ? "o navegador diz que está online" + ((navigator as any).connection?.effectiveType ? ` (rede ${(navigator as any).connection.effectiveType})` : "") : "o navegador diz que está SEM internet",
    });

    for (const l of await testStorageOnDevice()) push(l);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || ANON();
    push({
        label: "Login",
        status: sessionData.session ? "ok" : "warn",
        detail: sessionData.session ? "sessão ativa" : "sem sessão ativa (o app usaria a chave pública; faça login de novo)",
    });

    const auth = await timedFetch(`${BASE()}/auth/v1/health`, { apikey: ANON() });
    push("error" in auth
        ? { label: "Servidor (login)", status: "fail", detail: `não alcançou o servidor: ${auth.error}` }
        : { label: "Servidor (login)", status: auth.status < 500 ? "ok" : "fail", detail: `HTTP ${auth.status} em ${auth.time}` });

    const rest = await timedFetch(`${BASE()}/rest/v1/unidades?select=id&limit=1`, { apikey: ANON(), Authorization: `Bearer ${token}` });
    push("error" in rest
        ? { label: "Servidor (dados)", status: "fail", detail: `não alcançou o servidor: ${rest.error}` }
        : { label: "Servidor (dados)", status: rest.status < 400 ? "ok" : "warn", detail: `HTTP ${rest.status} em ${rest.time}` });

    // Servidor não responde: testar upload só faria cada teste esperar até estourar o tempo.
    const serverDown = "error" in auth && "error" in rest;
    if (serverDown) {
        push({ label: "Testes de envio de foto", status: "warn", detail: "pulados: o servidor não está respondendo. O problema não é o aparelho - avise quem cuida do servidor." });
        return all;
    }

    const tag = crypto.randomUUID().slice(0, 8);
    for (const size of [50 * 1024, 1024 * 1024, 3 * 1024 * 1024]) {
        push(await testUpload(size, tag));
    }
    return all;
}

export function diagnosticsToText(lines: DiagnosticLine[]): string {
    const icon = { ok: "OK   ", warn: "AVISO", fail: "FALHA" } as const;
    return [`SmartOS - diagnóstico (${new Date().toLocaleString("pt-BR")})`, ...lines.map(l => `[${icon[l.status]}] ${l.label}: ${l.detail}`)].join("\n");
}

/**
 * Quando um envio falha por rede, descobre se é a internet do aparelho ou o servidor que não responde
 * (o técnico precisa saber qual: um ele resolve, o outro não).
 */
export async function explainNetworkFailure(original: string): Promise<string> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "Sem internet no aparelho. O relatório está guardado e será enviado sozinho quando a conexão voltar.";
    }
    const probe = await timedFetch(`${BASE()}/auth/v1/health`, { apikey: ANON() }, 6000);
    if ("error" in probe) {
        return "O servidor do SmartOS não está respondendo agora (não é a sua internet). O relatório está guardado e será enviado sozinho quando o servidor voltar.";
    }
    return original;
}
