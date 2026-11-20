const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/syncOverview.ts");
const NOW = Date.parse("2026-11-20T12:00:00Z");
const rep = (over = {}) => ({ localId: "a", createdAt: NOW - 5 * 60000, attempts: 0, photoCount: 3, payload: { serviceOrderNumber: "111" }, ...over });
const base = { online: true, isFlushing: false, reports: [], trackingCount: 0, vehicleCount: 0, now: NOW };

test("idade: agora, minutos, horas e dias", () => {
    assert.equal(lib.ageLabel(NOW - 20000, NOW), "agora");
    assert.equal(lib.ageLabel(NOW - 5 * 60000, NOW), "há 5 min");
    assert.equal(lib.ageLabel(NOW - 3 * 3600000, NOW), "há 3 h");
    assert.equal(lib.ageLabel(NOW - 24 * 3600000, NOW), "há 1 dia");
    assert.equal(lib.ageLabel(NOW - 3 * 86400000, NOW), "há 3 dias");
});

test("situação: ok, pendente, offline, erro e enviando (nessa ordem de prioridade)", () => {
    assert.equal(lib.buildSyncOverview(base).state, "ok");
    assert.equal(lib.buildSyncOverview(base).headline, "Tudo sincronizado");
    assert.equal(lib.buildSyncOverview({ ...base, reports: [rep()] }).state, "pending");
    assert.equal(lib.buildSyncOverview({ ...base, trackingCount: 2 }).state, "pending");
    assert.equal(lib.buildSyncOverview({ ...base, reports: [rep({ lastError: "timeout" })] }).state, "error");
    assert.equal(lib.buildSyncOverview({ ...base, online: false, reports: [rep({ lastError: "x" })] }).state, "offline");
    assert.equal(lib.buildSyncOverview({ ...base, online: false }).headline, "Sem internet");
    assert.equal(lib.buildSyncOverview({ ...base, isFlushing: true, online: false, reports: [rep()] }).state, "syncing");
});

test("totais, títulos e ordem: relatório mais antigo primeiro; memória da aba é sinalizada", () => {
    const o = lib.buildSyncOverview({
        ...base,
        reports: [rep({ localId: "novo", createdAt: NOW - 60000 }), rep({ localId: "velho", createdAt: NOW - 7200000, payload: {}, memoryOnly: true })],
        trackingCount: 4,
        vehicleCount: 1,
    });
    assert.equal(o.totalPending, 7);
    assert.deepEqual(o.reports.map(r => r.localId), ["velho", "novo"]);
    assert.equal(o.reports[0].title, "Relatório sem número de OS");
    assert.equal(o.reports[0].age, "há 2 h");
    assert.equal(o.reports[1].title, "OS 111");
    assert.equal(o.hasMemoryOnly, true);
    assert.equal(o.headline, "Aguardando envio · 2 relatórios, 4 rastreios, 1 registro de veículo");
});
