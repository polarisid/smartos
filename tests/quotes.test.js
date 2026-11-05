const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const q = loadTs("src/lib/quotes.ts");

test("saldo e situação do pagamento", () => {
    const pays = [{ id: "a", amount: 100.1, method: "PIX", date: "2026-11-04" }, { id: "b", amount: 50.2, method: "Dinheiro", date: "2026-11-04" }];
    assert.equal(q.paidOf(pays), 150.3);
    assert.equal(q.balanceOf(400, pays), 249.7);
    assert.equal(q.paymentStateOf(400, []), "sem_pagamento");
    assert.equal(q.paymentStateOf(400, pays), "parcial");
    assert.equal(q.paymentStateOf(150.3, pays), "quitado");
    assert.equal(q.paidPercent(300.6, pays), 50);
});

test("pagamento não passa do saldo nem aceita valor zerado", () => {
    const first = q.addPayment(100, [], { amount: 60, method: "PIX", date: "2026-11-04", id: "p1" });
    assert.equal(first.ok, true);
    const over = q.addPayment(100, first.payments, { amount: 50, method: "PIX", date: "2026-11-04" });
    assert.equal(over.ok, false);
    const zero = q.addPayment(100, first.payments, { amount: 0, method: "PIX", date: "2026-11-04" });
    assert.equal(zero.ok, false);
    const rest = q.addPayment(100, first.payments, { amount: 40, method: "Dinheiro", date: "2026-11-04", id: "p2" });
    assert.equal(rest.ok, true);
    assert.equal(q.balanceOf(100, rest.payments), 0);
    const after = q.addPayment(100, rest.payments, { amount: 1, method: "PIX", date: "2026-11-04" });
    assert.equal(after.ok, false);
    assert.equal(q.removePayment(rest.payments, "p1").length, 1);
});

test("valor digitado em formatos brasileiros", () => {
    assert.equal(q.parseMoney("1.234,50"), 1234.5);
    assert.equal(q.parseMoney("50,5"), 50.5);
    assert.equal(q.parseMoney("50.5"), 50.5);
    assert.equal(q.parseMoney("1,234.50"), 1234.5);
    assert.equal(q.parseMoney(""), 0);
});

test("não reprova nem volta a pendente com pagamento lançado", () => {
    const pays = [{ id: "a", amount: 10, method: "PIX", date: "2026-11-04" }];
    assert.equal(q.canChangeStatusTo("aprovado", "reprovado", pays).ok, false);
    assert.equal(q.canChangeStatusTo("aprovado", "pendente", pays).ok, false);
    assert.equal(q.canChangeStatusTo("pendente", "aprovado", pays).ok, true);
    assert.equal(q.canChangeStatusTo("pendente", "reprovado", []).ok, true);
    assert.equal(q.canReceivePayment("pendente"), false);
    assert.equal(q.canReceivePayment("aprovado"), true);
});

test("limpa espaços do começo, do fim e repetidos", () => {
    assert.equal(q.cleanText("   \tDC97-17 6F  "), "DC97-17 6F");
    assert.equal(q.cleanText("TROCA   DO\u00a0CESTO "), "TROCA DO CESTO");
    assert.equal(q.cleanText(undefined), "");
    assert.equal(q.cleanLines("  linha 1  \n\n   linha   2 \n"), "linha 1\n\nlinha 2");
});
