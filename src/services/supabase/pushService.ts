import { supabase } from "@/lib/supabase";

// Web Push: avisos no aparelho mesmo com o app fechado. A inscrição (endpoint +
// chaves) fica em `push_subscriptions`; quem envia é o gatilho do banco → /api/push/notify.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

// O service worker só existe no app publicado (o modo dev do Next desliga o PWA). Em vez de
// esperar `ready` às cegas, acompanha a instalação e diz o que de fato aconteceu.
async function getActiveRegistration(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register("/sw.js");
    } catch {
      throw new Error("O modo offline do app não está disponível neste ambiente (versão de desenvolvimento ou navegador sem suporte).");
    }
  }
  if (reg.active) return reg;

  const worker = reg.installing || reg.waiting;
  if (!worker) throw new Error("O app ainda está preparando o modo offline. Recarregue a página e tente de novo.");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("O app demorou para preparar o modo offline. Verifique a conexão, recarregue a página e tente de novo.")), 20000);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") { clearTimeout(timer); resolve(); }
      else if (worker.state === "redundant") { clearTimeout(timer); reject(new Error("Não foi possível instalar o modo offline do app. Atualize a página (Ctrl+F5) e tente de novo.")); }
    });
  });
  return reg;
}

export type PushSupport = "unsupported" | "unconfigured" | "denied" | "ready";

export const pushService = {
  support(): PushSupport {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
      return "unsupported";
    }
    if (!VAPID_PUBLIC_KEY) return "unconfigured";
    if (Notification.permission === "denied") return "denied";
    return "ready";
  },

  async getCurrent(): Promise<PushSubscription | null> {
    if (this.support() === "unsupported") return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  },

  async subscribe(userId: string): Promise<void> {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Permissão de avisos negada no navegador.");

    const reg = await getActiveRegistration();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Inscrição de avisos inválida.");

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;
  },

  async unsubscribe(): Promise<void> {
    const sub = await this.getCurrent();
    if (!sub) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  },
};
