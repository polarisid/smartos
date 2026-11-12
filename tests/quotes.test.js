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

test("total dos itens e regras de edição do orçamento", () => {
    const items = [
        { code: "A1", description: "Placa", value: 100.1, quantity: 2, kind: "peca" },
        { description: "Mão de obra", value: 50, quantity: 1, kind: "servico" },
    ];
    assert.equal(q.itemsTotal(items, 10), 240.2);

    const pend = q.checkQuoteEdit({ items, discount: 10, previousTotal: 200, status: "pendente", payments: [] });
    assert.equal(pend.ok, true);
    assert.equal(pend.total, 240.2);
    assert.equal(pend.changed, true);
    assert.equal(pend.needsConfirm, false);

    const appr = q.checkQuoteEdit({ items, discount: 10, previousTotal: 240.2, status: "aprovado", payments: [] });
    assert.equal(appr.ok, true);
    assert.equal(appr.changed, false);
    assert.equal(appr.needsConfirm, true);

    assert.equal(q.checkQuoteEdit({ items: [], discount: 0, previousTotal: 0, status: "pendente", payments: [] }).ok, false);
    assert.equal(q.checkQuoteEdit({ items: [{ description: "  ", value: 1, quantity: 1, kind: "peca" }], discount: 0, previousTotal: 0, status: "pendente", payments: [] }).ok, false);
    assert.equal(q.checkQuoteEdit({ items, discount: 9999, previousTotal: 0, status: "pendente", payments: [] }).ok, false);

    // já pago 200: não deixa o total cair para 150
    const pays = [{ id: "p", amount: 200, method: "PIX", date: "2026-11-05" }];
    const low = q.checkQuoteEdit({ items: [{ description: "Só serviço", value: 150, quantity: 1, kind: "servico" }], discount: 0, previousTotal: 240.2, status: "aprovado", payments: pays });
    assert.equal(low.ok, false);
    const same = q.checkQuoteEdit({ items: [{ description: "Só serviço", value: 200, quantity: 1, kind: "servico" }], discount: 0, previousTotal: 240.2, status: "aprovado", payments: pays });
    assert.equal(same.ok, true);
});

test("limpeza dos itens editados e histórico de alterações", () => {
    const [it] = q.cleanEditedItems([{ code: "  AB  12 ", description: " Troca   do cesto ", value: 10.005, quantity: 0, kind: "peca" }]);
    assert.equal(it.code, "AB 12");
    assert.equal(it.description, "Troca do cesto");
    assert.equal(it.quantity, 1);

    let log = [];
    for (let i = 0; i < 25; i++) log = q.appendEditLog(log, { at: String(i), previousTotal: i, newTotal: i + 1, status: "pendente" });
    assert.equal(log.length, q.MAX_QUOTE_EDIT_LOG);
    assert.equal(log[log.length - 1].at, "24");
});

test("busca de orçamentos: vários campos, sem acento, CPF sem pontos", () => {
    const quote = {
        osNumber: "4177012068", clientName: "JANDSON SANTOS CRUZ", clientCpf: "048.921.765-67", clientNumber: "(11) 98888-7777",
        totalAmount: 1600, status: "pendente", createdAt: new Date(2026, 10, 11), payments: [{ id: "a", amount: 100, method: "PIX", date: "2026-11-11", note: "entrada" }],
        snapshot: { observations: "Troca de bateria", items: [{ code: "GH82", description: "Tela original" }] },
    };
    assert.equal(q.quoteMatchesSearch(quote, ""), true);
    assert.equal(q.quoteMatchesSearch(quote, "jandson"), true);
    assert.equal(q.quoteMatchesSearch(quote, "4177012"), true);
    assert.equal(q.quoteMatchesSearch(quote, "04892176567"), true);
    assert.equal(q.quoteMatchesSearch(quote, "98888"), true);
    assert.equal(q.quoteMatchesSearch(quote, "bateria"), true);
    assert.equal(q.quoteMatchesSearch(quote, "tela"), true);
    assert.equal(q.quoteMatchesSearch(quote, "pix"), true);
    assert.equal(q.quoteMatchesSearch(quote, "pendente"), true);
    assert.equal(q.quoteMatchesSearch(quote, "11/11/2026"), true);
    assert.equal(q.quoteMatchesSearch(quote, "1.600,00"), true);
    assert.equal(q.quoteMatchesSearch(quote, "1600,00"), true);
    assert.equal(q.quoteMatchesSearch(quote, "maria"), false);
});
