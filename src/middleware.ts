import { NextResponse, type NextRequest } from "next/server";

// Endereços antigos (um projeto Vercel por unidade) que passam a apontar pro endereço único.
// Os três projetos rodam este mesmo código: nos antigos, as páginas viram um aviso de mudança
// (+ limpeza do app instalado) em vez do sistema. APIs e arquivos estáticos seguem funcionando.
const CANONICAL_URL = (process.env.NEXT_PUBLIC_CANONICAL_URL || "https://smartos-olive.vercel.app").replace(/\/$/, "");
const LEGACY_HOSTS = (process.env.LEGACY_HOSTS || "smartos-slz.vercel.app,smartos-the.vercel.app")
  .split(",")
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

const KEEP_COOKIE = "legacy_keep";

function movedPage(targetUrl: string): string {
  const safe = JSON.stringify(targetUrl);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>SmartOS mudou de endereço</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#0b1420; color:#e8eef5; }
  main { max-width:460px; padding:28px 24px; text-align:center; }
  h1 { font-size:22px; margin:0 0 10px; }
  p { line-height:1.5; color:#b7c3d1; margin:8px 0; }
  a.btn { display:inline-block; margin-top:14px; padding:12px 20px; border-radius:10px; background:#17e9b0; color:#0b1420; font-weight:700; text-decoration:none; word-break:break-all; }
  .warn { background:#3a2b0b; border:1px solid #8a6416; color:#ffd98a; border-radius:10px; padding:12px; margin-top:16px; display:none; }
  .warn a { color:#ffd98a; font-weight:700; }
  small { display:block; margin-top:18px; color:#7d8da0; }
</style>
</head>
<body>
<main>
  <h1>O SmartOS mudou de endereço</h1>
  <p>Este link foi desativado. Use o endereço único abaixo (salve nos favoritos / reinstale o atalho na tela inicial):</p>
  <a class="btn" id="go" href=${safe}>${targetUrl}</a>
  <div class="warn" id="warn">
    Há <b id="n">0</b> relatório(s) guardado(s) neste aparelho que ainda não foram enviados.
    Antes de mudar, <a id="keep" href="#">toque aqui para abrir o sistema antigo e deixar enviar</a>.
    Quando terminar, volte e use o novo endereço.
  </div>
  <small id="status">Redirecionando em instantes…</small>
</main>
<script>
(function () {
  var target = ${safe};
  var path = location.pathname + location.search;
  var dest = target + (path === "/" ? "" : path);
  document.getElementById("go").href = dest;

  function countPending() {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open("smartos-offline");
        req.onerror = function () { resolve(0); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains("pending-reports")) { db.close(); return resolve(0); }
          var c = db.transaction("pending-reports").objectStore("pending-reports").count();
          c.onsuccess = function () { db.close(); resolve(c.result || 0); };
          c.onerror = function () { db.close(); resolve(0); };
        };
      } catch (e) { resolve(0); }
    });
  }

  async function cleanup() {
    try {
      if ("serviceWorker" in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function (r) { return r.unregister(); }));
      }
      if (window.caches) {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }
    } catch (e) {}
  }

  countPending().then(function (pending) {
    if (pending > 0) {
      // Não redireciona: relatórios guardados só existem neste endereço (por aparelho).
      document.getElementById("n").textContent = String(pending);
      document.getElementById("warn").style.display = "block";
      document.getElementById("status").textContent = "";
      document.getElementById("keep").href = "/?keep=1";
      return;
    }
    cleanup().then(function () {
      document.getElementById("status").textContent = "Abrindo o novo endereço…";
      setTimeout(function () { location.replace(dest); }, 2500);
    });
  });
})();
</script>
</body>
</html>`;
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  if (!LEGACY_HOSTS.includes(host)) return NextResponse.next();

  // Saída de emergência: quem tem relatório pendente neste aparelho abre o sistema antigo
  // (?keep=1) só pra deixar enviar; o cookie mantém a navegação por 1 dia.
  if (req.nextUrl.searchParams.get("keep") === "1") {
    const res = NextResponse.next();
    res.cookies.set(KEEP_COOKIE, "1", { maxAge: 60 * 60 * 24, path: "/" });
    return res;
  }
  if (req.cookies.get(KEEP_COOKIE)?.value === "1") return NextResponse.next();

  return new NextResponse(movedPage(CANONICAL_URL), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// Só páginas: APIs (/api), arquivos do Next (/_next) e estáticos (qualquer caminho com ponto,
// como /sw.js, /manifest.json, imagens) continuam servidos normalmente em qualquer endereço.
export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
