const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { routeGroupOf, routeDayKey, filterRoutes, sortRoutes, groupRoutes, distinctNames, EMPTY_ROUTE_FILTERS, NO_TECHNICIAN } = loadTs("src/lib/routeList.ts");

const route = (id, over = {}) => ({ id, name: id, isActive: true, stops: [], createdAt: new Date("2026-11-01T10:00:00"), ...over });
const day = (iso) => new Date(iso + "T12:00:00");

test("situação da rota: rascunho, ativa, finalizada e cancelada", () => {
    assert.strictEqual(routeGroupOf({ isDraft: true, isActive: false }), "rascunho");
    assert.strictEqual(routeGroupOf({ isActive: true }), "ativa");
    assert.strictEqual(routeGroupOf({ isActive: false }), "finalizada");
    assert.strictEqual(routeGroupOf({ isActive: false, isCanceled: true }), "cancelada");
});

test("dia da rota: saída, senão planejado, senão criação", () => {
    assert.strictEqual(routeDayKey(route("a", { departureDate: day("2026-11-09") })), "2026-11-09");
    assert.strictEqual(routeDayKey(route("b", { plannedDate: day("2026-11-10") })), "2026-11-10");
    assert.strictEqual(routeDayKey(route("c")), "2026-11-01");
});

test("filtros: técnico, motorista, situação e atrasadas", () => {
    const rs = [
        route("r1", { technicianName: "BRENO", driverName: "DIARISTA" }),
        route("r2", { technicianName: "ANDERSON", driverName: "ANDERSON", isActive: false, isDraft: true }),
        route("r3", { technicianName: "", driverName: "KLEBER" }),
    ];
    const f = (over) => filterRoutes(rs, { ...EMPTY_ROUTE_FILTERS, ...over }, { r1: 30 }).map(r => r.id);
    assert.deepStrictEqual(f({}), ["r1", "r2", "r3"]);
    assert.deepStrictEqual(f({ technician: "BRENO" }), ["r1"]);
    assert.deepStrictEqual(f({ technician: NO_TECHNICIAN }), ["r3"]);
    assert.deepStrictEqual(f({ driver: "KLEBER" }), ["r3"]);
    assert.deepStrictEqual(f({ groups: ["rascunho"] }), ["r2"]);
    assert.deepStrictEqual(f({ groups: ["rascunho", "ativa"] }), ["r1", "r2", "r3"]);
    assert.deepStrictEqual(f({ lateOnly: true }), ["r1"]);
});

test("ordenação por dia, nome, paradas e progresso, sem mexer na lista original", () => {
    const rs = [
        route("b", { departureDate: day("2026-11-09"), stops: [{}, {}, {}] }),
        route("a", { departureDate: day("2026-11-07"), stops: [{}] }),
        route("c", { departureDate: day("2026-11-08"), stops: [{}, {}, { isReallocated: true }] }),
    ];
    const progress = (r) => ({ a: 100, b: 0, c: 50 }[r.id]);
    const ids = (sort) => sortRoutes(rs, sort, progress).map(r => r.id);
    assert.deepStrictEqual(ids({ key: "data", dir: "asc" }), ["a", "c", "b"]);
    assert.deepStrictEqual(ids({ key: "data", dir: "desc" }), ["b", "c", "a"]);
    assert.deepStrictEqual(ids({ key: "nome", dir: "asc" }), ["a", "b", "c"]);
    assert.deepStrictEqual(ids({ key: "paradas", dir: "desc" }), ["b", "c", "a"]); // realocada não conta
    assert.deepStrictEqual(ids({ key: "progresso", dir: "asc" }), ["b", "c", "a"]);
    assert.deepStrictEqual(rs.map(r => r.id), ["b", "a", "c"]);
});

test("agrupamento: situação > dia, abertas de hoje em diante primeiro, finalizadas do mais recente", () => {
    const rs = [
        route("old", { departureDate: day("2026-11-03") }),
        route("today", { departureDate: day("2026-11-06") }),
        route("next", { departureDate: day("2026-11-09") }),
        route("draftA", { isActive: false, isDraft: true, plannedDate: day("2026-11-09") }),
        route("done1", { isActive: false, departureDate: day("2026-10-30") }),
        route("done2", { isActive: false, departureDate: day("2026-11-02") }),
    ];
    const blocks = groupRoutes(rs, "2026-11-06");
    assert.deepStrictEqual(blocks.map(b => b.group), ["rascunho", "ativa", "finalizada"]);
    assert.deepStrictEqual(blocks[1].days.map(d => d.dayKey), ["2026-11-06", "2026-11-09", "2026-11-03"]);
    assert.deepStrictEqual(blocks[2].days.map(d => d.dayKey), ["2026-11-02", "2026-10-30"]);
    assert.strictEqual(blocks[1].count, 3);
});

test("nomes distintos para os filtros", () => {
    assert.deepStrictEqual(distinctNames(["BRENO", " ANDERSON ", "", undefined, "BRENO"]), ["ANDERSON", "BRENO"]);
});
