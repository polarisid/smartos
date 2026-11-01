const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { formatBorrowedPart, borrowedFromOrder, lentFromOrder, lentNotice, partUsageInStop, replacedPartTextLine } = loadTs("src/lib/partUsage.ts");

const created = new Date("2026-10-20T08:00:00");
const day = new Date("2026-10-21T10:00:00");
const os = (n, replacedPart, extra = {}) => ({ serviceOrderNumber: n, replacedPart, date: day, isFinalized: true, ...extra });

test("formatBorrowedPart / borrowedFromOrder", () => {
    assert.strictEqual(formatBorrowedPart({ fromOrder: "111", code: "DC93-00350B", quantity: 1 }), "DC93-00350B [da OS 111]");
    assert.strictEqual(formatBorrowedPart({ fromOrder: "111", code: "DC93-00350B", quantity: 2 }), "DC93-00350B (x2) [da OS 111]");
    assert.strictEqual(borrowedFromOrder("DC93-00350B (x2) [da OS 111]"), "111");
    assert.strictEqual(borrowedFromOrder("DC93-00350B (x2)"), null);
});

test("lentFromOrder soma só lançamentos finalizados, depois da rota, da OS de origem certa", () => {
    const list = [
        os("222", "DC93-00350B [da OS 111], BN44-1"),
        os("333", "DC93-00350B (x2) [da OS 111]"),
        os("444", "DC93-00350B [da OS 999]"),
        os("555", "DC93-00350B [da OS 111]", { isFinalized: false }),
        os("666", "DC93-00350B [da OS 111]", { ignoreInRoute: true }),
        os("111", "XX-1"),
    ];
    const lent = lentFromOrder("111", "dc93-00350b", list, created);
    assert.deepStrictEqual(lent.map(l => [l.toOrder, l.quantity]), [["222", 1], ["333", 2]]);
    assert.strictEqual(lentFromOrder("111", "DC93-00350B", list, new Date("2026-10-22T00:00:00")).length, 0);
});

test("lentNotice", () => {
    assert.strictEqual(lentNotice([]), "");
    assert.strictEqual(lentNotice([{ toOrder: "222", quantity: 1 }]), "cedida para a OS 222");
    assert.strictEqual(lentNotice([{ toOrder: "222", quantity: 1 }, { toOrder: "333", quantity: 2 }]), "cedida para a OS 222, OS 333 (x2)");
});

test("partUsageInStop ignora peça emprestada com o mesmo código", () => {
    const list = [os("222", "DC93-00350B [da OS 111], BN44-1")];
    assert.deepStrictEqual(partUsageInStop("222", "DC93-00350B", list, created), { used: false, defective: false });
    assert.deepStrictEqual(partUsageInStop("222", "BN44-1", list, created), { used: true, defective: false });
});

test("partUsageInStop marca defeito de peça nova", () => {
    const list = [os("222", "", { isFinalized: false, pendingReason: "Peça nova com defeito: BN44-1" })];
    assert.deepStrictEqual(partUsageInStop("222", "BN44-1", list, created), { used: false, defective: true });
});

test("replacedPartTextLine", () => {
    assert.strictEqual(replacedPartTextLine("BN44-1, DC93-1 (x2)"), "- **Peça Trocada:** BN44-1, DC93-1 (x2)");
    assert.strictEqual(replacedPartTextLine("BN96-55108A [da OS 46656565]"), "- **Peças usadas:** BN96-55108A (usada da OS: 46656565)");
    assert.strictEqual(replacedPartTextLine("BN44-1, DC93-1 (x2) [da OS 7]"), "- **Peças usadas:** BN44-1, DC93-1 (x2) (usada da OS: 7)");
    assert.strictEqual(replacedPartTextLine(""), "");
});
