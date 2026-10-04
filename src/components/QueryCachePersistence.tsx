"use client";

import { useEffect, useRef, useState } from "react";
import { dehydrate, hydrate, useQueryClient, type Query } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { loadQueryCache, saveQueryCache } from "@/lib/offlineCache";

// Só o que o técnico precisa ver sem sinal: rotas, OS, previsão, produção e referências.
const PERSISTED_KEYS = new Set([
  "routes", "service-orders", "technicians", "drivers", "checklists", "codes", "presets",
  "visit-template", "planning-params", "notifications", "live-plan-legs", "live-plan-remaining",
  "producao-equipe", "tech-goals",
]);

const shouldPersist = (q: Query) => q.state.status === "success" && PERSISTED_KEYS.has(String(q.queryKey[0]));

// Guarda os dados já carregados no aparelho (IndexedDB) e os devolve ao abrir o app, mesmo sem
// internet: o técnico em cidade pequena continua vendo rotas, mapa de paradas e previsão.
// Quando a conexão volta, as consultas normais atualizam tudo sozinhas.
export function QueryCachePersistence() {
  const queryClient = useQueryClient();
  const { appUser } = useAuth();
  const uid = appUser?.uid;
  const [online, setOnline] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    loadQueryCache(uid).then(rec => {
      if (cancelled || !rec) return;
      // hydrate só substitui o que for mais novo que o já existente no cache em memória.
      hydrate(queryClient, rec.state as any);
      setSavedAt(rec.savedAt);
    });

    const persistNow = async () => {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersist });
      if (state.queries.length === 0) return;
      setSavedAt(await saveQueryCache(uid, state));
    };
    // Salva no máx. a cada 5s após mudanças (e não enquanto estiver sem internet: não há dado novo).
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.type !== "updated" || !navigator.onLine) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void persistNow(); }, 5000);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, queryClient]);

  if (online) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-sm">
      <div className="flex items-center gap-2 px-4 py-2">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>
          Sem internet{savedAt ? ` — mostrando os dados salvos às ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}.
          Você pode consultar rotas, previsão e OS; relatórios ficam guardados e são enviados quando a conexão voltar.
        </span>
      </div>
    </div>
  );
}
