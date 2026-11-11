const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./loadTs");

const lib = loadTs("src/lib/reportAttachments.ts");

test("PDF anexado: reconhece arquivo local e o já enviado", () => {
    assert.equal(lib.isPdfAttachment({ file: { type: "application/pdf", name: "laudo" } }), true);
    assert.equal(lib.isPdfAttachment({ file: { type: "", name: "Laudo.PDF" } }), true);
    assert.equal(lib.isPdfAttachment({ file: { type: "image/jpeg", name: "foto.jpg" } }), false);
    assert.equal(lib.isPdfAttachment({ path: "4176/rma_novo_abc.pdf" }), true);
    assert.equal(lib.isPdfAttachment({ url: "https://x/storage/v1/object/public/report-photos/4176/rma_novo_abc.pdf?t=1" }), true);
    assert.equal(lib.isPdfAttachment({ path: "4176/defeito_abc.jpg" }), false);
    assert.equal(lib.isPdfAttachment({}), false);
});

test("categorias do RMA", () => {
    assert.equal(lib.isRmaCategory("rma_novo"), true);
    assert.equal(lib.isRmaCategory("rma_antigo"), true);
    assert.equal(lib.isRmaCategory("produto_frontal"), false);
    assert.deepEqual(lib.RMA_CATEGORIES, ["rma_novo", "rma_antigo"]);
});

test("nome do PDF anexado", () => {
    assert.equal(lib.attachmentDisplayName({ file: { name: "laudo.pdf" } }), "laudo.pdf");
    assert.equal(lib.attachmentDisplayName({ path: "4176/rma_novo_x.pdf" }), "rma_novo_x.pdf");
});
