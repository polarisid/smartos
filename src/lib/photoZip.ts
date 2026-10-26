import type { TechnicalReportPhoto, TechnicalReportPhotoCategory } from "@/lib/data";

const CATEGORY_FILENAME: Record<TechnicalReportPhotoCategory, string> = {
    produto_frontal: "FRONTAL",
    produto_traseira: "TRASEIRA",
    produto_serial: "SERIAL",
    defeito: "DEFEITO",
    pos_reparo: "POS_REPARO",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_FILENAME) as TechnicalReportPhotoCategory[];

/** Nomes dos arquivos do ZIP: "<OS>_<CATEGORIA>[_n].<ext>", na ordem das categorias; repetida na mesma categoria ganha _2, _3... */
export function photoFileNames(serviceOrderNumber: string, photos: TechnicalReportPhoto[]): Array<{ photo: TechnicalReportPhoto; filename: string }> {
    const sorted = [...photos].sort((a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || (a.order ?? 0) - (b.order ?? 0));
    const seen: Record<string, number> = {};
    return sorted.map(photo => {
        const idx = seen[photo.category] ?? 0;
        seen[photo.category] = idx + 1;
        const ext = (photo.path || photo.url).split("?")[0].split(".").pop() || "jpg";
        const label = (CATEGORY_FILENAME[photo.category] || "FOTO") + (idx > 0 ? `_${idx + 1}` : "");
        const safeOs = serviceOrderNumber.replace(/[^A-Za-z0-9_-]/g, "");
        return { photo, filename: `${safeOs}_${label}.${/^[A-Za-z0-9]{1,5}$/.test(ext) ? ext.toLowerCase() : "jpg"}` };
    });
}

export type PhotoZipResult = { downloaded: number; failed: number };

/** Baixa as fotos e entrega um ZIP "<OS>-fotos.zip". Foto que não baixar fica de fora e é contada em `failed`. */
export async function downloadPhotosZip(
    serviceOrderNumber: string,
    photos: TechnicalReportPhoto[],
    onProgress?: (done: number, total: number) => void,
): Promise<PhotoZipResult> {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const files = photoFileNames(serviceOrderNumber, photos);

    let done = 0;
    let failed = 0;
    await Promise.all(files.map(async ({ photo, filename }) => {
        try {
            const res = await fetch(photo.url, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            zip.file(filename, await res.blob());
        } catch (e) {
            console.error("Foto não baixada:", photo.url, e);
            failed++;
        } finally {
            onProgress?.(++done, files.length);
        }
    }));

    const downloaded = files.length - failed;
    if (downloaded === 0) return { downloaded, failed };

    const blobUrl = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${serviceOrderNumber.replace(/[^A-Za-z0-9_-]/g, "")}-fotos.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    return { downloaded, failed };
}
