const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { productLineFromModel, PRODUCT_LINE_LABELS } = loadTs("src/lib/productLine.ts");

test("linha do produto pela primeira letra do modelo", () => {
    assert.strictEqual(productLineFromModel("WD10M4453MWFAZ"), "maquina_lavar");
    assert.strictEqual(productLineFromModel("AR12DYFAAWKNAZ"), "ar_condicionado");
    assert.strictEqual(productLineFromModel("UN55CU7700"), "tv");
    assert.strictEqual(productLineFromModel("QN65Q60"), "tv");
    assert.strictEqual(productLineFromModel("LS43F6000FGXZD"), "tv");
    assert.strictEqual(productLineFromModel("RT38K5930S8"), "refrigerador");
    assert.strictEqual(productLineFromModel("SM-A546"), "outros");
    assert.strictEqual(productLineFromModel("5000"), "outros");
});

test("ignora espaços e maiúsculas e minúsculas; vazio não classifica", () => {
    assert.strictEqual(productLineFromModel("  wa11 "), "maquina_lavar");
    assert.strictEqual(productLineFromModel("r123"), "refrigerador");
    assert.strictEqual(productLineFromModel(""), null);
    assert.strictEqual(productLineFromModel(undefined), null);
    assert.strictEqual(productLineFromModel("   "), null);
});

test("todas as linhas têm nome", () => {
    for (const k of ["maquina_lavar", "ar_condicionado", "tv", "refrigerador", "outros"]) assert.ok(PRODUCT_LINE_LABELS[k]);
});

const { slotKeyFromLabel, productPhotoLabel, normalizeProductPhotoConfig, DEFAULT_PRODUCT_SLOTS, isProductPhotoCategory } = loadTs("src/lib/productLine.ts");

test("slotKeyFromLabel gera chave sem acento e sem repetir", () => {
    assert.strictEqual(slotKeyFromLabel("Foto do Cabo", []), "produto_foto_do_cabo");
    assert.strictEqual(slotKeyFromLabel("Etiqueta de série!", []), "produto_etiqueta_de_serie");
    assert.strictEqual(slotKeyFromLabel("Frontal", ["produto_frontal"]), "produto_frontal_2");
    assert.strictEqual(slotKeyFromLabel("???", []), "produto_foto");
});

test("productPhotoLabel: nome gravado, padrão da chave ou chave limpa", () => {
    assert.strictEqual(productPhotoLabel("produto_frontal"), "Frontal");
    assert.strictEqual(productPhotoLabel("produto_foto_do_cabo"), "Foto do cabo");
    assert.strictEqual(productPhotoLabel("produto_foto_do_cabo", "Cabo de força"), "Cabo de força");
});

test("normalizeProductPhotoConfig completa o que falta e descarta o inválido", () => {
    const cfg = normalizeProductPhotoConfig({
        tv: [{ key: "produto_painel", label: " Painel ", required: false }, { key: "defeito", label: "X" }, { key: "produto_painel", label: "Repetido" }, { key: "produto_a", label: "" }],
        outros: [],
    });
    assert.deepStrictEqual(cfg.tv, [{ key: "produto_painel", label: "Painel", required: false }]);
    assert.deepStrictEqual(cfg.outros, []);
    assert.deepStrictEqual(cfg.maquina_lavar, DEFAULT_PRODUCT_SLOTS);
    assert.deepStrictEqual(normalizeProductPhotoConfig(null).tv, DEFAULT_PRODUCT_SLOTS);
    assert.strictEqual(isProductPhotoCategory("produto_x"), true);
    assert.strictEqual(isProductPhotoCategory("defeito"), false);
});
