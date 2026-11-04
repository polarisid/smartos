const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { markReallocated, unmarkReallocated, receivePart, undoReceive, partReturnOf } = loadTs("src/lib/partRealloc.ts");

const created = new Date("2026-10-20T08:00:00");
const day = new Date("2026-10-21T10:00:00");
const os = (n, replacedPart, extra = {}) => ({ serviceOrderNumber: n, replacedPart, date: day, isFinalized: true, ...extra });

test("markReallocated / unmarkReallocated", () => {
    const parts = [{ code: "A1", description: "x", quantity: 1, trackingCode: "BR1" }, { code: "B2", description: "y", quantity: 1 }];
    const marked = markReallocated(parts, "a1", "222");
    assert.strictEqual(marked[0].reallocatedTo, "222");
    assert.strictEqual(marked[1].reallocatedTo, undefined);
    assert.deepStrictEqual(unmarkReallocated(marked, "A1"), parts);
});

test("receivePart acrescenta linha nova mantendo o rastreio", () => {
    const out = receivePart([{ code: "B2", description: "y", quantity: 1 }], { code: "A1", description: "x", quantity: 2, trackingCode: "BR1" }, "111");
    assert.deepStrictEqual(out[1], { code: "A1", description: "x", quantity: 2, trackingCode: "BR1", receivedFrom: [{ order: "111", quantity: 2 }] });
});

test("receivePart soma quando a OS já tem a peça e o undo devolve como estava", () => {
    const base = [{ code: "A1", description: "x", quantity: 1, trackingCode: "MINE" }];
    const got = receivePart(base, { code: "A1", description: "x", quantity: 2, trackingCode: "BR1" }, "111");
    assert.strictEqual(got.length, 1);
    assert.strictEqual(got[0].quantity, 3);
    assert.strictEqual(got[0].trackingCode, "MINE");
    assert.deepStrictEqual(undoReceive(got, "A1", "111"), base);
});

test("undoReceive remove a linha criada pela realocação", () => {
    const got = receivePart([], { code: "A1", description: "x", quantity: 1 }, "111");
    assert.deepStrictEqual(undoReceive(got, "A1", "111"), []);
});

test("partReturnOf: aguardando, usada, nova, realocada e defeito", () => {
    const stop = { serviceOrder: "111" };
    const part = { code: "MSV4A1AL1R/TSJ", description: "", quantity: 1 };
    assert.strictEqual(partReturnOf(stop, part, [], created).kind, "aguardando");
    assert.strictEqual(partReturnOf(stop, part, [os("111", "OUTRA-1")], created).kind, "nova");
    assert.strictEqual(partReturnOf(stop, part, [os("111", "MSV4A1AL1R/TSJ")], created).kind, "usada");
    assert.strictEqual(partReturnOf(stop, { ...part, reallocatedTo: "222" }, [], created).kind, "realocada");
    assert.strictEqual(partReturnOf(stop, part, [os("111", "", { isFinalized: false, pendingReason: "Peça nova com defeito: MSV4A1AL1R/TSJ" })], created).kind, "defeito");
    const lent = partReturnOf(stop, part, [os("111", "X-1"), os("333", "MSV4A1AL1R/TSJ [da OS 111]")], created);
    assert.deepStrictEqual([lent.kind, lent.lentTo], ["cedida", "333"]);
});
