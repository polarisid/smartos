"use client";

import { useEffect } from "react";

// Registra o service worker do app (/sw.js, gerado pelo next-pwa) para o uso sem sinal.
// O registro automático do next-pwa não entra no bundle do App Router, então o app nunca chegava a
// instalar o service worker (e sem ele as telas guardadas não abrem sem internet). Aqui registramos à mão.
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
        const register = () => {
            navigator.serviceWorker
                .register("/sw.js", { scope: "/" })
                .catch(err => console.warn("Não foi possível registrar o service worker:", err));
        };
        if (document.readyState === "complete") register();
        else window.addEventListener("load", register, { once: true });
        return () => window.removeEventListener("load", register);
    }, []);
    return null;
}
