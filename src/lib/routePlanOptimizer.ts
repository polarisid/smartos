import type { RouteStop } from "./data";
import { requestedTurnKind, simulateRoutePlan, type PlanningParams } from "./routePlanning";

// `matrix[i][j]` em minutos: 0 = saída, 1..N = paradas na ordem original, N+1 = chegada.
export type PlanMetrics = {
    days: number;
    turnMismatches: number;   // OS cujo turno previsto difere do pedido pelo cliente
    travelMin: number;
    returnArriveMin: number;
    returnLate: boolean;
    score: number;
};

const W_DAY = 100000;
const W_MISMATCH = 3000;
const W_RETURN_LATE = 20000;

function legsFor(order: number[], matrix: number[][]): number[] {
    const n = matrix.length - 2;
    const legs: number[] = [];
    let prev = 0;
    for (const idx of order) {
        legs.push(matrix[prev][idx + 1]);
        prev = idx + 1;
    }
    legs.push(matrix[prev][n + 1]);
    return legs;
}

export function evaluateOrder(
    stops: RouteStop[],
    order: number[],
    matrix: number[][],
    params: PlanningParams,
    startDate: Date,
    departureTime?: string
): PlanMetrics {
    const ordered = order.map(i => stops[i]);
    const plan = simulateRoutePlan(ordered, legsFor(order, matrix), params, startDate, departureTime);
    let mismatches = 0;
    plan.stops.forEach((p, k) => {
        const kind = requestedTurnKind(ordered[k].turn);
        if ((kind === "M" && p.turn === "Tarde") || (kind === "T" && p.turn === "Manhã")) mismatches++;
    });
    const days = plan.days.length;
    return {
        days,
        turnMismatches: mismatches,
        travelMin: plan.totalTravelMin,
        returnArriveMin: plan.returnArriveMin,
        returnLate: plan.returnAfterHours,
        score: days * W_DAY + mismatches * W_MISMATCH + (plan.returnAfterHours ? W_RETURN_LATE : 0) + plan.totalTravelMin,
    };
}

function nearestNeighbor(n: number, matrix: number[][]): number[] {
    const left = new Set<number>(Array.from({ length: n }, (_, i) => i));
    const order: number[] = [];
    let prev = 0;
    while (left.size) {
        let best = -1;
        let bestD = Infinity;
        left.forEach(i => {
            const d = matrix[prev][i + 1];
            if (d < bestD) { bestD = d; best = i; }
        });
        order.push(best);
        left.delete(best);
        prev = best + 1;
    }
    return order;
}

/**
 * Procura uma ordem melhor para as paradas: menos dias/dormidas, menos OS fora
 * do turno pedido, menos tempo de estrada e retorno dentro do horário.
 * Busca local (troca, mover e inverter trechos) partindo da ordem atual e do
 * vizinho mais próximo; tem teto de tempo pra não travar a tela.
 */
export function suggestPlanOrder(
    stops: RouteStop[],
    matrix: number[][],
    params: PlanningParams,
    startDate: Date,
    departureTime?: string,
    maxMs: number = 1800
): { order: number[]; before: PlanMetrics; after: PlanMetrics } {
    const n = stops.length;
    const identity = Array.from({ length: n }, (_, i) => i);
    const evalOrder = (o: number[]) => evaluateOrder(stops, o, matrix, params, startDate, departureTime);
    const before = evalOrder(identity);
    if (n < 3) return { order: identity, before, after: before };

    const deadline = Date.now() + maxMs;
    let bestOrder = identity;
    let best = before;

    const improve = (seed: number[]) => {
        let cur = seed.slice();
        let curM = evalOrder(cur);
        let improved = true;
        while (improved && Date.now() < deadline) {
            improved = false;
            // 2-opt: inverte um trecho
            for (let i = 0; i < n - 1 && !improved; i++) {
                for (let j = i + 1; j < n; j++) {
                    const cand = cur.slice(0, i).concat(cur.slice(i, j + 1).reverse(), cur.slice(j + 1));
                    const m = evalOrder(cand);
                    if (m.score < curM.score) { cur = cand; curM = m; improved = true; break; }
                }
                if (Date.now() > deadline) break;
            }
            // or-opt: move uma parada para outra posição
            for (let i = 0; i < n && !improved; i++) {
                for (let j = 0; j < n; j++) {
                    if (i === j) continue;
                    const cand = cur.slice();
                    const [x] = cand.splice(i, 1);
                    cand.splice(j, 0, x);
                    const m = evalOrder(cand);
                    if (m.score < curM.score) { cur = cand; curM = m; improved = true; break; }
                }
                if (Date.now() > deadline) break;
            }
            // troca duas paradas
            for (let i = 0; i < n - 1 && !improved; i++) {
                for (let j = i + 1; j < n; j++) {
                    const cand = cur.slice();
                    [cand[i], cand[j]] = [cand[j], cand[i]];
                    const m = evalOrder(cand);
                    if (m.score < curM.score) { cur = cand; curM = m; improved = true; break; }
                }
                if (Date.now() > deadline) break;
            }
        }
        if (curM.score < best.score) { best = curM; bestOrder = cur; }
    };

    improve(identity);
    improve(nearestNeighbor(n, matrix));

    return { order: bestOrder, before, after: best };
}
