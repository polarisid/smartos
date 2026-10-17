"use client";

import { useEffect, useState } from "react";
import { flushTrackingQueue, subscribeTracking } from "@/lib/offlineTrackingQueue";

/**
 * Mantém a fila de rastreios do aparelho sendo enviada (ao abrir, ao voltar a internet e a cada minuto)
 * e devolve quantos ainda aguardam envio.
 */
export function useTrackingQueue(onSent?: (sent: number) => void): number {
    const [pending, setPending] = useState(0);

    useEffect(() => {
        const unsubscribe = subscribeTracking(setPending);
        const run = () => { void flushTrackingQueue().then(r => { if (r.sent > 0) onSent?.(r.sent); }); };
        run();
        window.addEventListener("online", run);
        const interval = setInterval(run, 60000);
        return () => {
            unsubscribe();
            window.removeEventListener("online", run);
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return pending;
}
