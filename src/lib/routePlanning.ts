import type { RouteStop } from "./data";

// Parâmetros do "modo planejamento" (por unidade, salvos em configs.id = 'planning').
export type PlanningParams = {
    // Minutos de atendimento por "Service Product Description" (chave normalizada).
    durationByProduct: Record<string, number>;
    // Usado quando o produto não tem tempo configurado nem tempo manual na parada.
    defaultMinutes: number;
    dayStart: string;      // "08:00"
    dayEnd: string;        // "18:00"
    // Até que horas aceita seguir viagem depois do expediente para dormir já na cidade
    // da próxima parada (em vez de dormir onde terminou e perder a tarde).
    travelUntil: string;   // "19:00"
    lunchStart: string;    // "12:00"
    lunchMinutes: number;  // 0 = sem almoço
    workSaturday: boolean;
};

export const DEFAULT_PLANNING_PARAMS: PlanningParams = {
    durationByProduct: {},
    defaultMinutes: 45,
    dayStart: "08:00",
    dayEnd: "18:00",
    travelUntil: "19:00",
    lunchStart: "12:00",
    lunchMinutes: 60,
    workSaturday: false,
};

export function normalizeProductKey(product?: string): string {
    return (product || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export function timeToMinutes(hhmm: string, fallback: number): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "").trim());
    if (!m) return fallback;
    return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

export function formatClock(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, "0")}`;
}

// "Manhã"/"M" → M, "Tarde"/"T" → T; qualquer outra coisa (comercial, vazio) → sem preferência.
export function requestedTurnKind(turn?: string): "M" | "T" | null {
    const t = (turn || "").trim().toUpperCase();
    if (!t) return null;
    if (t === "M" || t.startsWith("MANH")) return "M";
    if (t === "T" || t.startsWith("TARD")) return "T";
    return null;
}

// Data da visita como vem na planilha ("dd/mm/aaaa", às vezes sem zero à esquerda ou com hora).
export function parseVisitDate(text?: string): Date | null {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text || "");
    if (!m) return null;
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(year, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export type ServiceMinutesSource = "manual" | "product" | "default";

export function resolveServiceMinutes(stop: RouteStop, params: PlanningParams): { minutes: number; source: ServiceMinutesSource } {
    if (typeof stop.estimatedMinutes === "number" && stop.estimatedMinutes > 0) {
        return { minutes: stop.estimatedMinutes, source: "manual" };
    }
    const byProduct = params.durationByProduct[normalizeProductKey(stop.productType)];
    if (typeof byProduct === "number" && byProduct > 0) return { minutes: byProduct, source: "product" };
    return { minutes: Math.max(1, params.defaultMinutes || DEFAULT_PLANNING_PARAMS.defaultMinutes), source: "default" };
}

export type PlannedStop = {
    index: number;            // posição na lista de paradas ativas
    dayIndex: number;
    date: Date;
    travelMin: number;        // deslocamento até esta parada
    startMin: number;         // início do atendimento (minutos desde 00:00)
    endMin: number;
    serviceMin: number;
    source: ServiceMinutesSource;
    turn: "Manhã" | "Tarde";
    afterLunch: boolean;      // almoço entrou antes deste atendimento
    droveTonight: boolean;    // o deslocamento até aqui foi feito na noite anterior
};

export type PlannedDay = {
    dayIndex: number;
    date: Date;
    stopIndexes: number[];
    startMin: number;
    endMin: number;
    travelMin: number;
    serviceMin: number;
    sleepCity?: string;       // onde dorme ao fim deste dia (ausente no último)
    sleepNote?: string;
};

export type RoutePlan = {
    stops: PlannedStop[];
    days: PlannedDay[];
    returnTravelMin: number;
    returnArriveMin: number;  // chegada de volta ao ponto final (no último dia)
    returnAfterHours: boolean;
    totalTravelMin: number;
    totalServiceMin: number;
};

const cityLabel = (s: RouteStop) => [s.city, s.state].filter(Boolean).join("/") || "cidade da parada";
const cityKey = (s?: RouteStop) => (s?.city || "").trim().toUpperCase();

function nextWorkDate(from: Date, workSaturday: boolean, includeFrom: boolean): Date {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    if (!includeFrom) d.setDate(d.getDate() + 1);
    // 0 = domingo, 6 = sábado
    while (d.getDay() === 0 || (d.getDay() === 6 && !workSaturday)) d.setDate(d.getDate() + 1);
    return d;
}

/**
 * Simula a rota dia a dia: cada parada começa depois do deslocamento vindo da
 * anterior (ou do ponto de saída), respeitando expediente e almoço. Quando o
 * próximo atendimento não cabe no dia, o técnico dorme:
 *  - na cidade da última parada, ou
 *  - na cidade da próxima, se ele consegue chegar lá até `travelUntil`
 *    (evita perder a tarde e acordar já com horas de estrada pela frente).
 * `legMin[i]` = deslocamento até a parada i; `legMin[stops.length]` = retorno.
 */
export function simulateRoutePlan(
    stops: RouteStop[],
    legMin: number[],
    params: PlanningParams,
    startDate: Date,
    // Hora ("HH:mm") em que o técnico sai no 1º dia; vazio/inválido = início do expediente.
    firstDayDeparture?: string
): RoutePlan {
    const dayStart = timeToMinutes(params.dayStart, 8 * 60);
    const dayEnd = Math.max(dayStart + 60, timeToMinutes(params.dayEnd, 18 * 60));
    const travelUntil = Math.max(dayEnd, timeToMinutes(params.travelUntil, 19 * 60));
    const lunchStart = timeToMinutes(params.lunchStart, 12 * 60);
    const lunchMin = Math.max(0, params.lunchMinutes || 0);

    const planned: PlannedStop[] = [];
    const days: PlannedDay[] = [];

    let date = nextWorkDate(startDate, params.workSaturday, true);
    let dayIndex = 0;
    const firstDeparture = timeToMinutes(firstDayDeparture || "", dayStart);
    let t = firstDeparture;
    let lunchTaken = lunchMin === 0;
    let currentDay: PlannedDay = { dayIndex, date, stopIndexes: [], startMin: firstDeparture, endMin: firstDeparture, travelMin: 0, serviceMin: 0 };
    days.push(currentDay);

    const startNextDay = () => {
        dayIndex += 1;
        date = nextWorkDate(date, params.workSaturday, false);
        t = dayStart;
        lunchTaken = lunchMin === 0;
        currentDay = { dayIndex, date, stopIndexes: [], startMin: dayStart, endMin: dayStart, travelMin: 0, serviceMin: 0 };
        days.push(currentDay);
    };

    stops.forEach((stop, i) => {
        const travel = Math.max(0, legMin[i] ?? 0);
        const { minutes: serviceMin, source } = resolveServiceMinutes(stop, params);

        let arrival = t + travel;
        let lunchBefore = false;
        let droveTonight = false;
        const withLunch = (a: number) => {
            if (!lunchTaken && a >= lunchStart) {
                return { a: a + lunchMin, lunch: true };
            }
            return { a, lunch: false };
        };
        let { a: start, lunch } = withLunch(arrival);

        const isFirstOfDay = currentDay.stopIndexes.length === 0;
        if (!isFirstOfDay && start + serviceMin > dayEnd) {
            const prev = stops[i - 1];
            const differentCity = cityKey(stop) !== cityKey(prev) && travel > 0;
            const driveTonight = differentCity && arrival <= travelUntil;
            if (driveTonight) {
                currentDay.sleepCity = cityLabel(stop);
                currentDay.sleepNote = `segue viagem (${formatDuration(travel)}), chega por volta das ${formatClock(arrival)} e atende no dia seguinte`;
                currentDay.travelMin += travel;
                droveTonight = true;
                startNextDay();
                arrival = dayStart;
            } else {
                currentDay.sleepCity = cityLabel(prev);
                currentDay.sleepNote = differentCity
                    ? `a viagem até a próxima parada (${formatDuration(travel)}) só terminaria às ${formatClock(arrival)}, depois das ${formatClock(travelUntil)}`
                    : "a próxima OS não cabe no fim do expediente";
                startNextDay();
                arrival = dayStart + travel;
            }
            ({ a: start, lunch } = withLunch(arrival));
        }
        if (lunch) { lunchTaken = true; lunchBefore = true; }

        const end = start + serviceMin;
        // Viajou à noite: o deslocamento já foi contado no dia anterior.
        const countedTravel = droveTonight ? 0 : travel;
        planned.push({
            index: i,
            dayIndex,
            date,
            travelMin: travel,
            startMin: start,
            endMin: end,
            serviceMin,
            source,
            turn: start < lunchStart ? "Manhã" : "Tarde",
            afterLunch: lunchBefore,
            droveTonight,
        });
        currentDay.stopIndexes.push(i);
        currentDay.endMin = end;
        currentDay.serviceMin += serviceMin;
        currentDay.travelMin += countedTravel;
        t = end;
    });

    const returnTravelMin = stops.length > 0 ? Math.max(0, legMin[stops.length] ?? 0) : 0;
    const returnArriveMin = t + returnTravelMin;

    return {
        stops: planned,
        days: days.filter(d => d.stopIndexes.length > 0),
        returnTravelMin,
        returnArriveMin,
        returnAfterHours: stops.length > 0 && returnArriveMin > travelUntil,
        totalTravelMin: planned.reduce((a, p) => a + p.travelMin, 0) + returnTravelMin,
        totalServiceMin: planned.reduce((a, p) => a + p.serviceMin, 0),
    };
}
