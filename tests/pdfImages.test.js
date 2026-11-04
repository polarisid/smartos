const test = require("node:test");
const assert = require("node:assert");
const { loadTs } = require("./loadTs");

const { extractJpegsFromPdf } = loadTs("src/lib/pdfImages.ts");

const ascii = s => Uint8Array.from(s, c => c.charCodeAt(0));
const concat = parts => Uint8Array.from(parts.flatMap(p => Array.from(p)));
const fakeJpeg = (size, fill) => concat([[0xff, 0xd8, 0xff, 0xe0], new Array(size - 6).fill(fill), [0xff, 0xd9]]);
const imageObject = (n, data, filter) =>
    concat([ascii(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /Filter /${filter} /Length ${data.length} >>\nstream\n`), data, ascii("\nendstream\nendobj\n")]);

test("extrai só os JPEGs (DCTDecode) grandes, na ordem, byte a byte", () => {
    const a = fakeJpeg(12000, 0x0a); // bytes 0x0a no meio não podem confundir o fim do stream
    const b = fakeJpeg(15000, 0x41);
    const png = concat([[0x89, 0x50, 0x4e, 0x47], new Array(20000).fill(7)]);
    const pdf = concat([
        ascii("%PDF-1.3\n"),
        imageObject(5, a, "DCTDecode"),
        imageObject(6, png, "FlateDecode"),
        imageObject(7, fakeJpeg(500, 1), "DCTDecode"), // miniatura: ignorada
        imageObject(8, b, "DCTDecode"),
        ascii("%%EOF"),
    ]);
    const out = extractJpegsFromPdf(pdf);
    assert.strictEqual(out.length, 2);
    assert.deepStrictEqual(Array.from(out[0]), Array.from(a));
    assert.deepStrictEqual(Array.from(out[1]), Array.from(b));
});

test("PDF sem fotos devolve lista vazia", () => {
    assert.deepStrictEqual(extractJpegsFromPdf(ascii("%PDF-1.3\n1 0 obj\n<< >>\nendobj\n%%EOF")), []);
});
