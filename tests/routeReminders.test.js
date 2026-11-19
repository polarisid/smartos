const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/routeReminders.ts");
const d = (s) => new Date(s);

test("situação do lembrete: sem OS, sem rota, em rota, em entrega, atendida, visitada, concluído", () => {
    const routes = lib.buildRoutesByOs(
        [
            { name: "Rota A", stops: [{ serviceOrder: "111" }, { serviceOrder: "222", isReallocated: true }] },
            { name: "Cancelada", isCanceled: true, stops: [{ serviceOrder: "333" }] },
            { name: "Entrega X", kind: "delivery", stops: [{ serviceOrder: "444" }] },
        ],
        [{ name: "Entrega X", kind: "delivery", stops: [{ serviceOrder: "444" }, { serviceOrder: "111" }] }],
    );
    const orders = lib.buildOrdersByOs([
        { serviceOrderNumber: "555", date: d("2026-11-20T10:00:00Z"), isFinalized: true },
        { serviceOrderNumber: "666", date: d("2026-11-20T10:00:00Z"), isFinalized: false },
        { serviceOrderNumber: "777", date: d("2026-11-01T10:00:00Z"), isFinalized: true },
    ]);
    const base = { createdAt: d("2026-11-19T10:00:00Z") };
    assert.equal(lib.reminderState({ ...base }, routes, orders).key, "sem_os");
    assert.equal(lib.reminderState({ ...base, osNumber: "999" }, routes, orders).key, "sem_rota");
    assert.deepEqual(lib.reminderState({ ...base, osNumber: " 111 " }, routes, orders), { key: "em_rota", routeName: "Rota A" });
    assert.equal(lib.reminderState({ ...base, osNumber: "222" }, routes, orders).key, "sem_rota");
    assert.equal(lib.reminderState({ ...base, osNumber: "333" }, routes, orders).key, "sem_rota");
    assert.deepEqual(lib.reminderState({ ...base, osNumber: "444" }, routes, orders), { key: "em_entrega", routeName: "Entrega X" });
    assert.equal(lib.reminderState({ ...base, osNumber: "555" }, routes, orders).key, "atendida");
    assert.equal(lib.reminderState({ ...base, osNumber: "666" }, routes, orders).key, "visitada");
    // atendimento antigo (antes do lembrete) não conta
    assert.equal(lib.reminderState({ ...base, osNumber: "777" }, routes, orders).key, "sem_rota");
    assert.equal(lib.reminderState({ ...base, osNumber: "555", doneAt: d("2026-11-21T00:00:00Z") }, routes, orders).key, "concluido");
});

test("prazo: vencido, hoje, breve, ok e sem prazo", () => {
    const today = new Date(2026, 10, 19, 15, 0);
    assert.equal(lib.dueInfo(undefined, today).level, "nenhum");
    assert.deepEqual(lib.dueInfo("2026-11-18", today), { days: -1, level: "vencido", label: "venceu ontem" });
    assert.equal(lib.dueInfo("2026-11-19", today).level, "hoje");
    assert.equal(lib.dueInfo("2026-11-20", today).label, "vence amanhã");
    assert.equal(lib.dueInfo("2026-11-22", today).level, "breve");
    assert.deepEqual(lib.dueInfo("2026-11-27", today), { days: 8, level: "ok", label: "vence em 8 dias" });
});

test("ordenação: abertos por prazo, sem prazo depois, concluídos no fim", () => {
    const list = [
        { id: "a", dueDate: undefined, createdAt: d("2026-11-01") },
        { id: "b", dueDate: "2026-11-27", createdAt: d("2026-11-02") },
        { id: "c", dueDate: "2026-11-20", createdAt: d("2026-11-03") },
        { id: "d", dueDate: "2026-11-10", createdAt: d("2026-11-04"), doneAt: d("2026-11-05") },
    ];
    assert.deepEqual(lib.sortReminders(list).map(x => x.id), ["c", "b", "a", "d"]);
});

test("categorias: contagem sem diferenciar maiúscula, 'Sem categoria' por último", () => {
    const list = [{ category: "Troca RMA" }, { category: " troca  rma " }, { category: "Coleta" }, { category: "" }, {}];
    assert.deepEqual(lib.categoryCounts(list), [
        { category: "Coleta", count: 1 },
        { category: "Troca RMA", count: 2 },
        { category: "Sem categoria", count: 2 },
    ]);
    assert.equal(lib.sameCategory("troca rma", "Troca RMA"), true);
    assert.equal(lib.sameCategory(undefined, ""), true);
    assert.equal(lib.sameCategory("Coleta", undefined), false);
    assert.equal(lib.cleanCategory("  Troca   RMA  "), "Troca RMA");
});
