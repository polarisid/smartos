// Divide uma lista de paradas em N grupos geograficamente contíguos e
// balanceados (algoritmo de varredura / "sweep"): geocodifica cada parada,
// calcula o centróide, ordena por ângulo em torno dele e fatia em N arcos
// com aproximadamente o mesmo número de paradas. É o que o Planejador Livre
// usa pra sugerir "Rota A", "Rota B" etc. a partir de uma única colagem.

import type { RouteStop } from "./data";
import { geocodeStop } from "./routeLegs";

export type GeocodedStop = {
  stop: RouteStop;
  coords: [number, number] | null;
};

// Paleta de cores por grupo, reaproveitada no mapa e nos cartões da lista.
export const GROUP_COLORS = [
  { name: "blue", hex: "#2563eb" },
  { name: "emerald", hex: "#059669" },
  { name: "amber", hex: "#d97706" },
  { name: "rose", hex: "#e11d48" },
  { name: "violet", hex: "#7c3aed" },
  { name: "cyan", hex: "#0891b2" },
  { name: "orange", hex: "#ea580c" },
  { name: "pink", hex: "#db2777" },
] as const;

export function colorForGroup(index: number) {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

export function groupLabel(index: number): string {
  // A, B, C... depois AA, AB... (na prática nunca deve passar de poucas letras)
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Rota ${label}`;
}

export async function geocodeStopsForSplit(stops: RouteStop[]): Promise<GeocodedStop[]> {
  const coordsList = await Promise.all(stops.map(s => geocodeStop(s).catch(() => null)));
  return stops.map((stop, i) => ({ stop, coords: coordsList[i] }));
}

/**
 * Fatia as paradas geocodificadas em `numGroups` grupos balanceados por
 * proximidade (varredura angular / algoritmo "sweep"). Paradas sem
 * coordenada (geocodificação falhou) são distribuídas em round-robin no final,
 * pra nunca ficarem de fora de um grupo.
 *
 * `sweepOrigin`, quando informado, é usado como centro da varredura em vez
 * do centróide das próprias paradas - normalmente as coordenadas da base
 * operacional, já que cada rota sai e volta pra lá. Isso produz "fatias de
 * pizza" ao redor da base (o jeito clássico de dividir entregas/visitas
 * entre veículos que partem do mesmo lugar), minimizando sobreposição e
 * cruzamento entre as rotas geradas.
 */
export function splitIntoGroups(
  geocoded: GeocodedStop[],
  numGroups: number,
  sweepOrigin?: [number, number]
): RouteStop[][] {
  const groups: RouteStop[][] = Array.from({ length: Math.max(1, numGroups) }, () => []);
  if (geocoded.length === 0) return groups;

  const withCoords = geocoded.filter((g): g is GeocodedStop & { coords: [number, number] } => g.coords != null);
  const withoutCoords = geocoded.filter(g => g.coords == null);

  if (withCoords.length > 0) {
    const origin: [number, number] = sweepOrigin ?? [
      withCoords.reduce((a, g) => a + g.coords[0], 0) / withCoords.length,
      withCoords.reduce((a, g) => a + g.coords[1], 0) / withCoords.length,
    ];
    const sorted = [...withCoords].sort((a, b) => {
      const angleA = Math.atan2(a.coords[0] - origin[0], a.coords[1] - origin[1]);
      const angleB = Math.atan2(b.coords[0] - origin[0], b.coords[1] - origin[1]);
      return angleA - angleB;
    });

    const perGroup = Math.ceil(sorted.length / groups.length);
    sorted.forEach((g, i) => {
      const groupIdx = Math.min(groups.length - 1, Math.floor(i / perGroup));
      groups[groupIdx].push(g.stop);
    });
  }

  // Distribui as sem-coordenada no grupo menor a cada passo, pra manter equilíbrio.
  withoutCoords.forEach(g => {
    const smallest = groups.reduce((minIdx, cur, idx) => (cur.length < groups[minIdx].length ? idx : minIdx), 0);
    groups[smallest].push(g.stop);
  });

  return groups;
}
