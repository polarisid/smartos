const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/quoteExport.ts");
const funnel = loadTs("src/lib/quoteFunnel.ts");
const xml = loadTs("src/lib/spreadsheetXml.ts");
const d = (s) => new Date(s);

const quotes = [
    {
        createdAt: d("2026-11-02T10:00:00"), clientName: "Ana", clientCpf: "111", osNumber: "4170", status: "aprovado", totalAmount: 1000,
        decidedAt: d("2026-11-03T10:00:00"), decidedByName: "Dani", payments: [{ amount: 400, method: "PIX" }, { amount: 100, method: "PIX" }],
        snapshot: { items: [{ code: "A1", description: "Placa", quantity: 2 }, { description: "Mão de obra" }], observations: "obs" },
    },
    { createdAt: d("2026-11-05T10:00:00"), clientName: "Bia", status: "reprovado", totalAmount: 300, rejectReason: "caro", payments: [], snapshot: { items: [] } },
    { createdAt: d("2026-11-09T10:00:00"), clientName: "Caio", status: "pendente", totalAmount: 200, payments: [], snapshot: { items: [{ description: "Tela" }] } },
];

test("aba de orçamentos: uma linha por orçamento, mais novo primeiro, valores numéricos e cores", () => {
    const sheet = lib.quotesSheet(quotes);
    assert.equal(sheet.rows.length, 3);
    assert.equal(sheet.headers.length, sheet.rows[0].values.length);
    assert.deepEqual(sheet.rows.map(r => r.values[1]), ["Caio", "Bia", "Ana"]);
    const ana = sheet.rows[2];
    assert.equal(ana.values[0], "02/11/2026");
    assert.equal(ana.values[5], "Aprovado");
    assert.deepEqual(ana.values.slice(6, 11), [1000, 500, 500, "Parcial", "PIX"]);
    assert.equal(ana.values[15], "2x A1 Placa; Mão de obra");
    assert.equal(ana.tone, "blue"); // aprovado com saldo a receber
    assert.equal(sheet.rows[1].tone, "red");
    assert.equal(sheet.rows[0].tone, "amber");
    assert.equal(sheet.rows[1].values[13], "caro");
});

test("resumo e mês a mês acompanham o funil", () => {
    const sums = lib.summarySheet(quotes, "Este mês");
    const get = (name) => sums.rows.find(r => r.values[0] === name).values[1];
    assert.equal(get("Orçamentos criados"), 3);
    assert.equal(get("Valor orçado (R$)"), 1500);
    assert.equal(get("Taxa de aprovação (%)"), 50);
    assert.equal(get("Já recebido (R$)"), 500);
    assert.equal(get("Falta receber (R$)"), 500);
    const months = funnel.monthlyFunnel(quotes.map(q => ({ ...q })), 3, d("2026-11-20T12:00:00"));
    const sheet = lib.monthlySheet(months);
    assert.equal(sheet.rows.length, 3);
    assert.equal(sheet.rows[2].values[0], "nov/26");
    assert.equal(sheet.rows[2].values[1], 3);
    assert.equal(sheet.rows[0].values[9], ""); // mês sem resposta: taxa em branco
});

test("buildQuoteSheets gera as abas e o XML da planilha sai válido", () => {
    const months = funnel.monthlyFunnel(quotes, 2, d("2026-11-20T12:00:00"));
    const sheets = lib.buildQuoteSheets({ quotes, label: "Tudo", months });
    assert.deepEqual(sheets.map(s => s.name), ["Resumo", "Mês a mês", "Orçamentos"]);
    assert.deepEqual(lib.buildQuoteSheets({ quotes, label: "Filtro" }).map(s => s.name), ["Resumo", "Orçamentos"]);
    const out = xml.buildSpreadsheetXml(sheets);
    assert.ok(out.includes('ss:Name="Orçamentos"'));
    assert.ok(out.includes("Ana"));
});
