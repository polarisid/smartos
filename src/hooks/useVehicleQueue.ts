"use client";

import { useEffect, useRef, useState } from "react";
import { flushVehicleQueue, subscribeVehicleQueue, type FlushVehicleResult } from "@/lib/offlineVehicleQueue";

/**
 * Mantém a fila de km/abastecimentos do aparelho sendo enviada (ao abrir, ao voltar a internet e a cada
 * minuto) e devolve quantos itens ainda aguardam envio. `onResult` roda quando algo foi enviado ou recusado.
 */
export function useVehicleQueue(onResult?: (r: FlushVehicleResult) => void): number {
    const [pending, setPending] = useState(0);
    const cb = useRef(onResult);
    cb.current = onResult;

    useEffect(() => {
        const unsubscribe = subscribeVehicleQueue(setPending);
        const run = () => { void flushVehicleQueue().then(r => { if (r.sent > 0 || r.rejected > 0) cb.current?.(r); }); };
        run();
        window.addEventListener("online", run);
        const interval = setInterval(run, 60000);
        return () => {
            unsubscribe();
            window.removeEventListener("online", run);
            clearInterval(interval);
        };
    }, []);

    return pending;
}
