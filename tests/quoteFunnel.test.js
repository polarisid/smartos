const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/quoteFunnel.ts");
const d = (s) => new Date(s);

const quotes = [
    { status: "aprovado", totalAmount: 1000, createdAt: d("2026-11-02T10:00:00"), decidedAt: d("2026-11-04T10:00:00"), payments: [{ amount: 1000 }] },
    { status: "aprovado", totalAmount: 600, createdAt: d("2026-11-05T10:00:00"), decidedAt: d("2026-11-06T10:00:00"), payments: [{ amount: 200 }] },
    { status: "reprovado", totalAmount: 400, createdAt: d("2026-11-07T10:00:00"), decidedAt: d("2026-11-08T10:00:00"), payments: [] },
    { status: "pendente", totalAmount: 500, createdAt: d("2026-11-10T10:00:00"), payments: [] },
    { status: "aprovado", totalAmount: 300, createdAt: d("2026-10-15T10:00:00"), decidedAt: d("2026-10-15T10:00:00"), payments: [] },
];

test("funil: contagens, valores, taxa de aprovação e conversão", () => {
    const s = lib.funnelStats(quotes.slice(0, 4));
    assert.deepEqual(s.total, { count: 4, value: 2500 });
    assert.deepEqual(s.aprovado, { count: 2, value: 1600 });
    assert.deepEqual(s.reprovado, { count: 1, value: 400 });
    assert.deepEqual(s.pendente, { count: 1, value: 500 });
    assert.deepEqual(s.quitado, { count: 1, value: 1000 });
    assert.equal(s.received, 1200);
    assert.equal(s.toReceive, 400);
    assert.equal(s.approvalRate, 67); // 2 de 3 respondidos
    assert.equal(s.conversionRate, 50); // 2 de 4 orçados
    assert.equal(s.avgTicket, 800);
    assert.equal(s.avgDecisionDays, 1.3); // (2 + 1 + 1) / 3 dias
});

test("funil: sem dados não dá divisão por zero", () => {
    const s = lib.funnelStats([]);
    assert.equal(s.approvalRate, null);
    assert.equal(s.conversionRate, null);
    assert.equal(s.avgDecisionDays, null);
    assert.equal(s.avgTicket, 0);
    assert.deepEqual(s.total, { count: 0, value: 0 });
    // só pendentes: ninguém respondeu, taxa de aprovação indefinida; conversão 0%
    const p = lib.funnelStats([quotes[3]]);
    assert.equal(p.approvalRate, null);
    assert.equal(p.conversionRate, 0);
});

test("pagamento a mais não infla o recebido e decisão antes da criação é ignorada", () => {
    const s = lib.funnelStats([
        { status: "aprovado", totalAmount: 100, createdAt: d("2026-11-02T10:00:00"), decidedAt: d("2026-11-01T10:00:00"), payments: [{ amount: 150 }] },
    ]);
    assert.equal(s.received, 100);
    assert.equal(s.toReceive, 0);
    assert.equal(s.avgDecisionDays, null);
});

test("período: este mês, mês passado, 3 meses, ano e tudo (pela data de criação)", () => {
    const now = d("2026-11-20T12:00:00");
    assert.equal(lib.quotesInPeriod(quotes, "mes", now).length, 4);
    assert.equal(lib.quotesInPeriod(quotes, "mes_passado", now).length, 1);
    assert.equal(lib.quotesInPeriod(quotes, "3meses", now).length, 5);
    assert.equal(lib.quotesInPeriod(quotes, "ano", now).length, 5);
    assert.equal(lib.quotesInPeriod(quotes, "tudo", now).length, 5);
    const jan = lib.periodRange("mes_passado", d("2026-01-10T12:00:00"));
    assert.equal(jan.from.getFullYear(), 2025); // vira o ano
    assert.equal(jan.from.getMonth(), 11);
});

test("mês a mês: últimos meses em ordem, inclusive os vazios", () => {
    const m = lib.monthlyFunnel(quotes, 4, d("2026-11-20T12:00:00"));
    assert.deepEqual(m.map(x => x.key), ["2026-08", "2026-09", "2026-10", "2026-11"]);
    assert.deepEqual(m.map(x => x.label), ["ago/26", "set/26", "out/26", "nov/26"]);
    assert.deepEqual(m.map(x => x.stats.total.count), [0, 0, 1, 4]);
});
