// Extrai as fotos de dentro de um PDF de relatório. O relatório é gerado com as fotos em JPEG (o jsPDF grava os bytes
// do JPEG como estão, com o filtro DCTDecode), então dá para tirar cada foto de volta sem perder qualidade.
// Assinaturas e logotipos entram como PNG (outro filtro) e ficam de fora.

const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
    const first = needle[0];
    const last = hay.length - needle.length;
    for (let i = from; i <= last; i++) {
        if (hay[i] !== first) continue;
        let k = 1;
        while (k < needle.length && hay[i + k] === needle[k]) k++;
        if (k === needle.length) return i;
    }
    return -1;
}

const DCT = enc("/DCTDecode");
const STREAM = enc("stream");
const END_STREAM = enc("endstream");

/** JPEGs embutidos no PDF, na ordem em que aparecem. `minBytes` descarta miniaturas e ícones. */
export function extractJpegsFromPdf(pdf: Uint8Array, minBytes = 10_000): Uint8Array[] {
    const out: Uint8Array[] = [];
    let pos = 0;
    while (true) {
        const dct = indexOf(pdf, DCT, pos);
        if (dct < 0) break;
        const kw = indexOf(pdf, STREAM, dct);
        if (kw < 0) break;
        let start = kw + STREAM.length;
        if (pdf[start] === 0x0d) start++;
        if (pdf[start] === 0x0a) start++;
        const endKw = indexOf(pdf, END_STREAM, start);
        if (endKw < 0) break;
        let end = endKw;
        while (end > start && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d)) end--;
        pos = endKw + END_STREAM.length;
        const isJpeg = pdf[start] === 0xff && pdf[start + 1] === 0xd8;
        if (isJpeg && end - start >= minBytes) out.push(pdf.slice(start, end));
    }
    return out;
}

export type PdfPhotosResult = { pdfs: number; photos: number; withoutPhotos: string[] };

/** Lê os PDFs escolhidos e baixa um ZIP com as fotos: "<nome do PDF>_01.jpg", "_02.jpg"... */
export async function downloadPhotosFromPdfs(files: File[]): Promise<PdfPhotosResult> {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const withoutPhotos: string[] = [];
    let photos = 0;
    const usedNames = new Set<string>();
    for (const file of files) {
        const jpegs = extractJpegsFromPdf(new Uint8Array(await file.arrayBuffer()));
        if (jpegs.length === 0) { withoutPhotos.push(file.name); continue; }
        let base = file.name.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9_-]+/g, "_") || "relatorio";
        while (usedNames.has(base)) base += "_";
        usedNames.add(base);
        jpegs.forEach((bytes, i) => {
            zip.file(`${base}_${String(i + 1).padStart(2, "0")}.jpg`, bytes);
            photos++;
        });
    }
    if (photos > 0) {
        const blobUrl = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = "fotos-extraidas.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
    }
    return { pdfs: files.length, photos, withoutPhotos };
}
