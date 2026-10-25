export type Place = { latitude: number; longitude: number; accuracyM: number };

export type PlaceResult =
    | { ok: true; place: Place }
    | { ok: false; reason: "denied" | "unavailable" | "timeout" | "insecure" };

/**
 * Posição atual do aparelho (GPS). O GPS funciona sem internet, então serve também para registros guardados
 * offline. O navegador só libera a localização em página segura (https ou localhost): em http por IP da rede
 * local devolve "insecure". Nunca lança: quem chama decide o que fazer sem localização.
 */
export function getCurrentPlace(timeoutMs = 12000): Promise<PlaceResult> {
    return new Promise(resolve => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({ ok: false, reason: "unavailable" });
        if (typeof window !== "undefined" && window.isSecureContext === false) return resolve({ ok: false, reason: "insecure" });
        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                ok: true,
                place: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy) },
            }),
            err => resolve({ ok: false, reason: err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable" }),
            // maximumAge curto: aceita uma posição de até 30 s, para o botão não esperar um novo GPS à toa.
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 },
        );
    });
}

export const PLACE_FAIL_MESSAGE: Record<Exclude<PlaceResult, { ok: true }>["reason"], string> = {
    denied: "A localização foi negada. Libere o acesso à localização no navegador para registrar o local do abastecimento.",
    unavailable: "Não foi possível obter a localização do aparelho.",
    timeout: "O GPS demorou demais para responder.",
    insecure: "A localização só funciona em página segura (https).",
};

/** Link para abrir o ponto no Google Maps. */
export function mapsUrl(latitude: number, longitude: number): string {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
}
