const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { makeOtherDeliveryLookup, sentBeforeOf, extraPartsOf } = loadTs("src/lib/deliveryHistory.ts");

const stop = (so, parts) => ({ serviceOrder: so, parts });
const part = (code, trackingCode) => ({ code, description: "", quantity: 1, ...(trackingCode ? { trackingCode } : {}) });
const delivery = (id, name, created, stops) => ({ id, name, kind: "delivery", createdAt: new Date(created), stops });

test("rota filha enxerga o que a OS já levou em OUTRA rota de entrega (e não a própria mãe)", () => {
    const oldDelivery = delivery("d1", "Entrega W43", "2026-10-10", [stop("111", [part("DB98-1", "BR1"), part("EXTRA-9", "BR2")])]);
    const mother = delivery("d2", "Entrega W45", "2026-10-25", [stop("111", [part("DB98-1", "BR3"), part("DB63-2")])]);
    const newer = delivery("d3", "Entrega W46", "2026-11-05", [stop("111", [part("NOVA-1", "BR9")])]);
    const child = { id: "c1", name: "W45 - Capital", kind: "normal", parentRouteId: "d2", createdAt: new Date("2026-10-27"), stops: [stop("111", [part("DB98-1", "BR3"), part("DB63-2")])] };

    const lookup = makeOtherDeliveryLookup([oldDelivery, mother, newer, child]);
    const history = lookup(child, "111");
    assert.ok(history);
    assert.strictEqual(sentBeforeOf(history, "DB98-1").before.routeName, "Entrega W43");
    assert.strictEqual(sentBeforeOf(history, "DB63-2"), undefined);
    assert.deepStrictEqual(extraPartsOf(history).map(d => d.code), ["EXTRA-9"]);
    assert.strictEqual(lookup(child, "999"), undefined);
});

test("rota de entrega antiga enxerga em quais rotas de entrega mais novas a OS já está", () => {
    const { newerDeliveriesOf } = loadTs("src/lib/deliveryHistory.ts");
    const old = delivery("d1", "Entrega W44", "2026-10-25", [stop("111"), stop("222"), stop("333")]);
    const w45 = delivery("d2", "Entrega W45", "2026-11-01", [stop("111"), { ...stop("222"), isReallocated: true }]);
    const w46 = delivery("d3", "Entrega W46", "2026-11-05", [stop(" 111 "), stop("444")]);
    const canceled = { ...delivery("d4", "Entrega W47", "2026-11-06", [stop("333")]), isCanceled: true };
    const older = delivery("d0", "Entrega W43", "2026-10-10", [stop("333")]);

    const map = newerDeliveriesOf(old, [old, w45, w46, canceled, older]);
    assert.deepStrictEqual(map.get("111").map(n => n.routeName), ["Entrega W46", "Entrega W45"]);
    assert.strictEqual(map.get("222"), undefined);
    assert.strictEqual(map.get("333"), undefined);
    assert.strictEqual(map.get("444"), undefined);
});
