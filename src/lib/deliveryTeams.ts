import type { RouteStop } from "@/lib/data";
import { colorForGroup, geocodeStopsForSplit, splitIntoGroups } from "@/lib/routeSplitter";

// Divisão de uma rota de entrega entre equipes: cada OS carrega `team` (1 = Equipe A, 2 = Equipe B...). Sem `team` a OS
// não tem equipe. Todas as equipes trabalham em paralelo: cada uma tem a sua ordem (routeOrder) e os seus dias.

export const MAX_TEAMS = 4;
export const NO_TEAM = 0;

export function teamLabel(team: number): string {
    return team > 0 ? `Equipe ${String.fromCharCode(64 + team)}` : "Sem equipe";
}

export function teamColor(team: number): string {
    return team > 0 ? colorForGroup(team - 1).hex : "#6b7280";
}

export function teamOf(stop: Pick<RouteStop, "team">): number {
    const t = Number(stop.team);
    return Number.isInteger(t) && t > 0 ? t : NO_TEAM;
}

/** Agrupa por equipe, na ordem das equipes (sem equipe primeiro). Dentro de cada uma mantém a ordem recebida. */
export function groupByTeam<T>(items: T[], team: (item: T) => number): Array<{ team: number; items: T[] }> {
    const map = new Map<number, T[]>();
    for (const item of items) {
        const t = team(item);
        map.set(t, [...(map.get(t) || []), item]);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([t, list]) => ({ team: t, items: list }));
}

/** Nome da rota filha: "<rota> — 27/10" e, havendo equipe, "<rota> — 27/10 · Equipe A". */
export function childRouteName(routeName: string, dayLabel: string, team: number): string {
    return `${routeName} — ${dayLabel}${team > 0 ? ` · ${teamLabel(team)}` : ""}`;
}

export type TeamSplit = Map<string, number>; // nº da OS -> equipe

/**
 * Divide as paradas em `numTeams` regiões ao redor da base (fatias de pizza, quantidades parecidas) e devolve a equipe de
 * cada OS. Com 1 equipe devolve tudo como "sem equipe" (desfaz a divisão). `origin` = coordenadas [lat, lng] da base.
 */
export async function splitStopsIntoTeams(stops: RouteStop[], numTeams: number, origin?: [number, number] | null): Promise<TeamSplit> {
    const result: TeamSplit = new Map();
    const n = Math.max(1, Math.min(MAX_TEAMS, Math.floor(numTeams)));
    if (n === 1) {
        stops.forEach(s => result.set(s.serviceOrder, NO_TEAM));
        return result;
    }
    const geocoded = await geocodeStopsForSplit(stops);
    splitIntoGroups(geocoded, n, origin || undefined).forEach((group, i) => group.forEach(s => result.set(s.serviceOrder, i + 1)));
    return result;
}

export function teamCounts(split: TeamSplit): Map<number, number> {
    const counts = new Map<number, number>();
    split.forEach(team => counts.set(team, (counts.get(team) || 0) + 1));
    return counts;
}
