import { supabase } from "@/lib/supabase";

// Web Push: avisos no aparelho mesmo com o app fechado. A inscrição (endpoint +
// chaves) fica em `push_subscriptions`; quem envia é o gatilho do banco → /api/push/notify.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
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

    // O service worker só existe no app publicado (o modo dev do Next desliga o PWA).
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("O app ainda não está pronto para avisos neste ambiente.")), 8000)),
    ]);
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
