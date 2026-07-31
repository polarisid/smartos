import { RouteStop } from './data';
import { getCityCoordinates } from './routeOptimizer';

export const OSRM_BASE_URL = (
  (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_OSRM_URL)
    ? process.env.NEXT_PUBLIC_OSRM_URL
    : 'https://router.project-osrm.org'
).replace(/\/$/, '');

// In-memory cache for OSRM matrix calls to prevent duplicate network hits
const osrmMatrixCache = new Map<string, { durationMatrix: number[][]; distanceMatrix: number[][] }>();

export type PointCoord = { lat: number; lng: number };

/**
 * Fetches exact driving time (seconds) and driving distance (meters) matrix
 * between all points using OSRM Table API (self-hosted or public).
 */
export async function fetchOsrmDrivingMatrix(
  points: PointCoord[]
): Promise<{ durationMatrix: number[][]; distanceMatrix: number[][] } | null> {
  if (!points || points.length < 2) return null;

  // Cache key based on coordinate strings rounded to 4 decimals
  const cacheKey = points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';');
  if (osrmMatrixCache.has(cacheKey)) {
    return osrmMatrixCache.get(cacheKey)!;
  }

  try {
    // OSRM expects coordinates in lng,lat order
    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `${OSRM_BASE_URL}/table/v1/driving/${coordsStr}?annotations=duration,distance`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    if (data.code === 'Ok' && data.durations) {
      const result = {
        durationMatrix: data.durations, // in seconds
        distanceMatrix: data.distances || data.durations.map((row: number[]) => row.map(d => d * 15)) // fallback meters approx
      };
      osrmMatrixCache.set(cacheKey, result);
      return result;
    }
  } catch (e) {
    console.warn("OSRM Table API error, falling back to Haversine speed matrix", e);
  }

  return null;
}

/**
 * Calculates Haversine distance in km between two lat/lng points.
 */
export function haversineDistanceKm(c1: PointCoord, c2: PointCoord): number {
  const dLat = (c2.lat - c1.lat) * Math.PI / 180;
  const dLng = (c2.lng - c1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(c1.lat * Math.PI / 180) * Math.cos(c2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Calculates exact total travel time in seconds for a closed loop circuit:
 * Base (0) -> Stop 1 -> Stop 2 -> ... -> Stop N -> Base (0)
 */
export function calculateClosedLoopDuration(
  tourIndices: number[], // index 0 is Base, 1..N are stops
  matrix: number[][]
): number {
  if (tourIndices.length <= 1) return 0;

  let totalTime = 0;
  for (let i = 0; i < tourIndices.length - 1; i++) {
    const u = tourIndices[i];
    const v = tourIndices[i + 1];
    totalTime += matrix[u]?.[v] ?? 0;
  }
  // Return to base (0)
  const last = tourIndices[tourIndices.length - 1];
  totalTime += matrix[last]?.[0] ?? 0;

  return totalTime;
}

/**
 * Exact Solver using Held-Karp Dynamic Programming with Bitmasking for N <= 12 stops.
 * Guarantees 100% mathematically optimal minimum driving time for small routes in < 5ms.
 */
export function solveExactHeldKarp(
  n: number, // Total nodes: 0 is Base, 1..N-1 are stops
  matrix: number[][]
): number[] {
  // DP table: dp[mask][i] = min cost to visit subset of nodes in 'mask' ending at node 'i'
  const numStates = 1 << n;
  const dp: number[][] = Array.from({ length: numStates }, () => Array(n).fill(Infinity));
  const parent: number[][] = Array.from({ length: numStates }, () => Array(n).fill(-1));

  // Base case: starting at node 0
  dp[1][0] = 0;

  for (let mask = 1; mask < numStates; mask++) {
    if ((mask & 1) === 0) continue; // Base (0) must be included

    for (let u = 0; u < n; u++) {
      if ((mask & (1 << u)) === 0 || dp[mask][u] === Infinity) continue;

      for (let v = 0; v < n; v++) {
        if ((mask & (1 << v)) !== 0) continue; // v not visited yet

        const nextMask = mask | (1 << v);
        const cost = dp[mask][u] + matrix[u][v];

        if (cost < dp[nextMask][v]) {
          dp[nextMask][v] = cost;
          parent[nextMask][v] = u;
        }
      }
    }
  }

  // Find min cost to return to base (0) from any last node
  const fullMask = (1 << n) - 1;
  let minCost = Infinity;
  let lastNode = -1;

  for (let u = 1; u < n; u++) {
    const totalCost = dp[fullMask][u] + matrix[u][0];
    if (totalCost < minCost) {
      minCost = totalCost;
      lastNode = u;
    }
  }

  if (lastNode === -1) return Array.from({ length: n }, (_, i) => i);

  // Reconstruct path backward
  const tour: number[] = [];
  let currMask = fullMask;
  let currNode = lastNode;

  while (currNode !== -1) {
    tour.push(currNode);
    const prevNode = parent[currMask][currNode];
    currMask ^= (1 << currNode);
    currNode = prevNode;
  }

  tour.reverse(); // Now starts at 0 (Base)
  return tour;
}

/**
 * Or-Opt (Block Re-insertion) refinement heuristic for N > 12.
 * Moves contiguous blocks of 1, 2, or 3 stops to better positions to eliminate road loops.
 */
export function applyOrOpt(
  tour: number[],
  matrix: number[][]
): number[] {
  let bestTour = [...tour];
  let improved = true;

  while (improved) {
    improved = false;

    for (let blockSize = 3; blockSize >= 1; blockSize--) {
      for (let i = 1; i <= bestTour.length - blockSize; i++) {
        const block = bestTour.slice(i, i + blockSize);
        const remaining = [...bestTour.slice(0, i), ...bestTour.slice(i + blockSize)];

        for (let j = 1; j <= remaining.length; j++) {
          const candidate = [
            ...remaining.slice(0, j),
            ...block,
            ...remaining.slice(j)
          ];

          if (calculateClosedLoopDuration(candidate, matrix) < calculateClosedLoopDuration(bestTour, matrix) - 1) {
            bestTour = candidate;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  return bestTour;
}
