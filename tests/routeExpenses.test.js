const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const r = loadTs("src/lib/routeExpenses.ts");

const mk = (over) => ({ id: "x", routeId: "r1", routeName: "Rota 1", category: "Alimentação", amount: 10, date: "2026-11-01", createdAt: new Date(), ...over });

test("categorias: limpa, tira repetidas e cai no padrão quando vazia", () => {
    assert.deepEqual(r.normalizeExpenseCategories(["  Alimentação ", "alimentação", "", "Hospedagem", 5]), ["Alimentação", "Hospedagem"]);
    assert.deepEqual(r.normalizeExpenseCategories(undefined), ["Alimentação", "Hospedagem", "Outros"]);
    assert.deepEqual(r.normalizeExpenseCategories(["  "]), ["Alimentação", "Hospedagem", "Outros"]);
});

test("totais por categoria e por rota", () => {
    const list = [mk({ amount: 35.9 }), mk({ amount: 20.1 }), mk({ category: "Hospedagem", amount: 180 }), mk({ routeId: "r2", routeName: "Rota 2", amount: 50, date: "2026-11-03" })];
    assert.equal(r.totalOf(list), 286);
    const cats = r.totalsByCategory(list);
    assert.deepEqual(cats.map(c => [c.category, c.total, c.count]), [["Hospedagem", 180, 1], ["Alimentação", 106, 3]]);
    const groups = r.groupByRoute(list);
    assert.deepEqual(groups.map(g => [g.routeName, g.total, g.count]), [["Rota 2", 50, 1], ["Rota 1", 236, 3]]);
});

test("filtros por período, categoria, técnico e busca", () => {
    const list = [
        mk({ id: "a", date: "2026-10-30", createdByName: "Pedro" }),
        mk({ id: "b", date: "2026-11-02", category: "Hospedagem", createdByName: "Jhon", description: "Hotel Central" }),
        mk({ id: "c", date: "2026-11-05", createdByName: "Pedro" }),
    ];
    assert.deepEqual(r.filterExpenses(list, { from: "2026-11-01" }).map(e => e.id), ["b", "c"]);
    assert.deepEqual(r.filterExpenses(list, { to: "2026-11-02" }).map(e => e.id), ["a", "b"]);
    assert.deepEqual(r.filterExpenses(list, { category: "Hospedagem" }).map(e => e.id), ["b"]);
    assert.deepEqual(r.filterExpenses(list, { technician: "Pedro" }).map(e => e.id), ["a", "c"]);
    assert.deepEqual(r.filterExpenses(list, { search: "  hotel " }).map(e => e.id), ["b"]);
});

test("lista de comprovantes: usa a coluna nova e cai no caminho único dos gastos antigos", () => {
    assert.deepEqual(r.receiptPathsOf(["a.jpg", "b.pdf"], "a.jpg"), ["a.jpg", "b.pdf"]);
    assert.deepEqual(r.receiptPathsOf([], "velho.jpg"), ["velho.jpg"]);
    assert.deepEqual(r.receiptPathsOf(undefined, "velho.jpg"), ["velho.jpg"]);
    assert.deepEqual(r.receiptPathsOf(null, null), []);
    assert.deepEqual(r.receiptPathsOf(["", 3, "ok.png"], "x"), ["ok.png"]);
    assert.equal(r.MAX_EXPENSE_RECEIPTS, 5);
});
