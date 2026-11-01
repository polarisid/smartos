const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { buildOpenRouteIndex, findDuplicateOrders, hasDuplicates } = loadTs("src/lib/duplicateOrders.ts");

const route = (id, extra, stops) => ({ id, name: "Rota " + id, isActive: false, isDraft: false, isCanceled: false, stops, ...extra });
const stop = (serviceOrder, extra = {}) => ({ serviceOrder, consumerName: "Cliente " + serviceOrder, ...extra });

test("índice só considera rotas abertas, sem canceladas, entrega ou paradas realocadas", () => {
    const index = buildOpenRouteIndex([
        route("A", { isActive: true }, [stop("1"), stop("2", { isReallocated: true })]),
        route("B", { isDraft: true }, [stop("1")]),
        route("C", { isActive: true, isCanceled: true }, [stop("3")]),
        route("D", { isActive: true, kind: "delivery" }, [stop("4")]),
        route("E", {}, [stop("5")]), // nem ativa nem rascunho (finalizada)
    ]);
    assert.deepStrictEqual((index.get("1") || []).map(l => l.routeId), ["A", "B"]);
    assert.strictEqual(index.has("2"), false);
    assert.strictEqual(index.has("3"), false);
    assert.strictEqual(index.has("4"), false);
    assert.strictEqual(index.has("5"), false);
});

test("findDuplicateOrders acusa repetida na planilha e OS em outra rota, menos a própria", () => {
    const index = buildOpenRouteIndex([route("A", { isActive: true }, [stop("10")]), route("B", { isDraft: true }, [stop("11")])]);
    const report = findDuplicateOrders([stop("10"), stop("10"), stop("11"), stop("12"), stop("13", { isReallocated: true })], index, "B");
    assert.deepStrictEqual(report.repeatedInPaste.map(d => [d.serviceOrder, d.count]), [["10", 2]]);
    assert.deepStrictEqual(report.inOtherRoutes.map(d => d.serviceOrder), ["10"]);
    assert.strictEqual(hasDuplicates(report), true);
    assert.strictEqual(hasDuplicates(findDuplicateOrders([stop("99")], index)), false);
});
