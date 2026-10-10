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
    workSunday: boolean;
    // Atraso (min) a partir do qual a rota é sinalizada como atrasada no painel.
    delayAlertMin: number;
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
    workSunday: false,
    delayAlertMin: 40,
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
    roadSleep: boolean;       // viagem longa: dormiu na estrada e terminou o trajeto de manhã
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
    returnArriveMin: number;  // hora da chegada de volta ao ponto final
    returnDate: Date;         // dia dessa chegada (depois do último atendimento se dormir na estrada)
    returnNights: number;     // noites na estrada na volta
    returnAfterHours: boolean;
    totalTravelMin: number;
    totalServiceMin: number;
};

const cityLabel = (s: RouteStop) => [s.city, s.state].filter(Boolean).join("/") || "cidade da parada";
const cityKey = (s?: RouteStop) => (s?.city || "").trim().toUpperCase();

function nextWorkDate(from: Date, params: Pick<PlanningParams, "workSaturday" | "workSunday">, includeFrom: boolean): Date {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    if (!includeFrom) d.setDate(d.getDate() + 1);
    // 0 = domingo, 6 = sábado
    while ((d.getDay() === 0 && !params.workSunday) || (d.getDay() === 6 && !params.workSaturday)) d.setDate(d.getDate() + 1);
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

    let date = nextWorkDate(startDate, params, true);
    let dayIndex = 0;
    let firstDeparture = timeToMinutes(firstDayDeparture || "", dayStart);
    // Saída depois do fim do expediente: o 1º dia de trabalho passa a ser o próximo dia útil.
    if (firstDeparture >= dayEnd) {
        date = nextWorkDate(date, params, false);
        firstDeparture = dayStart;
    } else if (!sameDay(date, startDate)) {
        // Data de partida caiu em dia sem trabalho (domingo/sábado): começa no início do expediente.
        firstDeparture = dayStart;
    }
    let t = firstDeparture;
    // Saindo depois do início do almoço, considera que ele já foi feito.
    let lunchTaken = lunchMin === 0 || firstDeparture >= lunchStart;
    let currentDay: PlannedDay = { dayIndex, date, stopIndexes: [], startMin: firstDeparture, endMin: firstDeparture, travelMin: 0, serviceMin: 0 };
    days.push(currentDay);

    const startNextDay = () => {
        dayIndex += 1;
        date = nextWorkDate(date, params, false);
        t = dayStart;
        lunchTaken = lunchMin === 0;
        currentDay = { dayIndex, date, stopIndexes: [], startMin: dayStart, endMin: dayStart, travelMin: 0, serviceMin: 0 };
        days.push(currentDay);
    };

    stops.forEach((stop, i) => {
        const travel = Math.max(0, legMin[i] ?? 0);
        const { minutes: serviceMin, source } = resolveServiceMinutes(stop, params);

        let lunchBefore = false;
        let droveTonight = false;
        let roadSleep = false;
        let remainingTravel = travel;
        const withLunch = (a: number) => {
            if (!lunchTaken && a >= lunchStart) {
                return { a: a + lunchMin, lunch: true };
            }
            return { a, lunch: false };
        };

        // 1) Viagem longa que passaria do limite de direção: anda até o limite, dorme na estrada
        //    e segue na manhã seguinte (repete se ainda faltar). Nunca marca atendimento fora do horário.
        //    Só para trechos longos (> 3h): trecho curto que passa do limite cai na regra abaixo
        //    (dorme onde terminou e faz o trajeto de manhã).
        while (remainingTravel > 180 && t + remainingTravel > travelUntil) {
            const room = travelUntil - t;
            // Sobrando menos de 1h30 de direção, não vale começar: dorme onde está.
            const drive = room >= 90 ? room : 0;
            remainingTravel -= drive;
            currentDay.travelMin += drive;
            if (drive > 0) {
                currentDay.sleepCity = `na estrada, a caminho de ${cityLabel(stop)}`;
                currentDay.sleepNote = `a viagem (${formatDuration(travel)}) passa das ${formatClock(travelUntil)}: continua na manhã seguinte`;
                roadSleep = true;
            } else {
                currentDay.sleepCity = i > 0 ? cityLabel(stops[i - 1]) : "a base";
                currentDay.sleepNote = `a viagem (${formatDuration(travel)}) começaria tarde demais: sai de manhã`;
            }
            startNextDay();
        }

        let arrival = t + remainingTravel;
        let { a: start, lunch } = withLunch(arrival);

        // Manhã recém-iniciada: aceita mesmo que estoure o fim do expediente (evita laço infinito
        // com atendimento maior que o dia). Nos demais casos, o que não cabe até o fim vai pro dia seguinte.
        const freshMorning = currentDay.stopIndexes.length === 0 && t === dayStart;
        if (!freshMorning && start + serviceMin > dayEnd) {
            const prevLabel = i > 0 ? cityLabel(stops[i - 1]) : "a base";
            const differentCity = (i === 0 || cityKey(stop) !== cityKey(stops[i - 1])) && remainingTravel > 0;
            const driveTonight = differentCity && arrival <= travelUntil;
            if (driveTonight) {
                currentDay.sleepCity = cityLabel(stop);
                currentDay.sleepNote = `segue viagem (${formatDuration(remainingTravel)}), chega por volta das ${formatClock(arrival)} e atende no dia seguinte`;
                currentDay.travelMin += remainingTravel;
                droveTonight = true;
                remainingTravel = 0;
                startNextDay();
                arrival = dayStart;
            } else {
                currentDay.sleepCity = prevLabel;
                currentDay.sleepNote = differentCity
                    ? `a viagem até a próxima parada (${formatDuration(remainingTravel)}) só terminaria às ${formatClock(arrival)}, depois das ${formatClock(travelUntil)}`
                    : "a próxima OS não cabe no fim do expediente";
                startNextDay();
                arrival = dayStart + remainingTravel;
            }
            ({ a: start, lunch } = withLunch(arrival));
        }
        if (lunch) { lunchTaken = true; lunchBefore = true; }

        const end = start + serviceMin;
        // Parte da viagem feita na noite anterior já foi contada naquele dia.
        const countedTravel = remainingTravel;
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
            roadSleep,
        });
        currentDay.stopIndexes.push(i);
        currentDay.endMin = end;
        currentDay.serviceMin += serviceMin;
        currentDay.travelMin += countedTravel;
        t = end;
    });

    // Retorno: mesma regra da viagem longa - se passa do limite de direção, dorme na estrada e chega no dia seguinte.
    const returnTravelMin = stops.length > 0 ? Math.max(0, legMin[stops.length] ?? 0) : 0;
    let returnRemaining = returnTravelMin;
    let returnNights = 0;
    while (stops.length > 0 && returnRemaining > 180 && t + returnRemaining > travelUntil) {
        const room = travelUntil - t;
        const drive = room >= 90 ? room : 0;
        returnRemaining -= drive;
        currentDay.travelMin += drive;
        currentDay.sleepCity = drive > 0 ? "na estrada, voltando" : cityLabel(stops[stops.length - 1]);
        currentDay.sleepNote = drive > 0
            ? `a volta (${formatDuration(returnTravelMin)}) passa das ${formatClock(travelUntil)}: continua na manhã seguinte`
            : `a volta (${formatDuration(returnTravelMin)}) começaria tarde demais: sai de manhã`;
        returnNights++;
        startNextDay();
    }
    const returnArriveMin = t + returnRemaining;
    const returnDate = date;
    if (stops.length > 0) currentDay.travelMin += returnRemaining;

    return {
        stops: planned,
        // Dia só de viagem (dormiu na estrada, volta no dia seguinte) também aparece.
        days: days.filter(d => d.stopIndexes.length > 0 || d.travelMin > 0),
        returnTravelMin,
        returnArriveMin,
        returnDate,
        returnNights,
        returnAfterHours: stops.length > 0 && returnArriveMin > dayEnd,
        totalTravelMin: planned.reduce((a, p) => a + p.travelMin, 0) + returnTravelMin,
        totalServiceMin: planned.reduce((a, p) => a + p.serviceMin, 0),
    };
}

// "15:59" → "entre 15h30 e 16h30" (janela de 1h começando na meia hora anterior).
export function formatEtaWindow(etaStart?: string): string {
    const m = /^(\d{1,2}):(\d{2})$/.exec((etaStart || "").trim());
    if (!m) return "";
    const total = Number(m[1]) * 60 + Number(m[2]);
    const from = Math.floor(total / 30) * 30;
    const fmt = (min: number) => {
        const h = Math.floor(min / 60) % 24;
        const mm = min % 60;
        return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2, "0")}`;
    };
    return `entre ${fmt(from)} e ${fmt(from + 60)}`;
}

function turnLabel(turn?: string): string {
    const t = (turn || "").trim();
    const u = t.toUpperCase();
    if (u === "M" || u.startsWith("MANH")) return "manhã";
    if (u === "T" || u.startsWith("TARD")) return "tarde";
    if (u === "C" || u.startsWith("COMERC")) return "horário comercial";
    return t.toLowerCase();
}

// Preenche o modelo do anúncio de visita. {{data}}, {{turno}} e {{horario}} vêm do
// agendamento da parada (e da previsão do modo Planejamento, quando aplicada).
export function fillVisitTemplate(template: string, stop: RouteStop): string {
    return template
        .replace(/{{consumerName}}/g, (stop.consumerName || "").split(" ")[0])
        .replace(/{{serviceOrder}}/g, stop.serviceOrder)
        .replace(/{{city}}/g, stop.city)
        .replace(/{{data}}/g, (stop.firstVisitDate || "").trim())
        .replace(/{{turno}}/g, turnLabel(stop.turn))
        .replace(/{{horario}}/g, formatEtaWindow(stop.etaStart));
}

// Rota já em curso: o técnico está em campo e passa a poder trabalhar sábado e domingo
// (no mesmo horário de expediente), em vez de só dias úteis.
export function withWeekendWork(params: PlanningParams): PlanningParams {
    return { ...params, workSaturday: true, workSunday: true };
}

// Em curso = rota publicada e ativa que já começou: tem alguma parada atendida (OS lançada
// depois da criação da rota) ou a data de saída já chegou.
export function isRouteInProgress(
    route: { isActive?: boolean; isDraft?: boolean; isCanceled?: boolean; createdAt: Date | string; departureDate?: Date | string; stops: RouteStop[] },
    serviceOrders: Array<{ serviceOrderNumber: string; date: Date }>,
    now: Date = new Date()
): boolean {
    if (!route.isActive || route.isDraft || route.isCanceled) return false;
    const createdAt = route.createdAt instanceof Date ? route.createdAt : new Date(route.createdAt);
    const stopNumbers = new Set((route.stops || []).filter(s => !s.isReallocated).map(s => s.serviceOrder));
    const anyAttended = serviceOrders.some(os => stopNumbers.has(os.serviceOrderNumber) && os.date.getTime() >= createdAt.getTime());
    if (anyAttended) return true;
    if (!route.departureDate) return false;
    const dep = route.departureDate instanceof Date ? route.departureDate : new Date(route.departureDate);
    const depDay = new Date(dep.getFullYear(), dep.getMonth(), dep.getDate()).getTime();
    return depDay <= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
