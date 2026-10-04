"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type RouteEditor = { userId: string; name: string };

/**
 * Quem mais está com esta rota aberta para edição (Realtime Presence, sem tabela no banco).
 * Só informa - o bloqueio de verdade é o controle por updated_at ao salvar.
 */
export function useRoutePresence(routeId: string | null | undefined, me: { uid?: string; name?: string } | null): RouteEditor[] {
    const [others, setOthers] = useState<RouteEditor[]>([]);
    const uid = me?.uid;
    const name = me?.name;

    useEffect(() => {
        setOthers([]);
        if (!routeId || !uid) return;
        let channel: ReturnType<typeof supabase.channel> | null = null;

        // Pequeno atraso: o modo estrito do React monta/desmonta/monta de novo e o supabase-js
        // reaproveita um canal de mesmo nome que ainda está fechando (presença exige nome fixo).
        const timer = setTimeout(() => {
            channel = supabase.channel(`route-edit:${routeId}`, { config: { presence: { key: uid } } });
            channel
                .on("presence", { event: "sync" }, () => {
                    const state = channel!.presenceState() as Record<string, Array<{ name?: string }>>;
                    setOthers(
                        Object.entries(state)
                            .filter(([key]) => key !== uid)
                            .map(([key, metas]) => ({ userId: key, name: metas[0]?.name || "Outra pessoa" }))
                    );
                })
                .subscribe(async (status) => {
                    if (status === "SUBSCRIBED") await channel!.track({ name: name || "Outra pessoa", at: Date.now() });
                });
        }, 200);

        return () => {
            clearTimeout(timer);
            if (channel) supabase.removeChannel(channel);
        };
    }, [routeId, uid, name]);

    return others;
}
