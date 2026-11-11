/**
 * Relatório de Troca RMA: as fotos são do produto novo e do produto antigo, e cada um pode levar também PDFs anexados
 * (ex.: laudo, nota). O PDF é guardado como um item da mesma lista de fotos, na mesma categoria, só que com arquivo .pdf.
 */

export const RMA_NEW_CATEGORY = "rma_novo";
export const RMA_OLD_CATEGORY = "rma_antigo";

export const RMA_CATEGORY_LABELS: Record<string, string> = {
    [RMA_NEW_CATEGORY]: "Produto novo",
    [RMA_OLD_CATEGORY]: "Produto antigo",
};

/** Categorias do relatório RMA, na ordem em que aparecem. */
export const RMA_CATEGORIES = [RMA_NEW_CATEGORY, RMA_OLD_CATEGORY];

export const isRmaCategory = (category: string) => category === RMA_NEW_CATEGORY || category === RMA_OLD_CATEGORY;

/** Limite de um PDF anexado (o envio acontece por sinal de celular e o PDF vai junto do relatório). */
export const MAX_PDF_ATTACHMENT_BYTES = 15 * 1024 * 1024;

type MaybeFile = { type?: string; name?: string } | null | undefined;

/** O item é um PDF anexado (e não uma foto)? Vale para o arquivo local e para o já enviado (pelo caminho/endereço). */
export function isPdfAttachment(item: { path?: string; url?: string; file?: MaybeFile }): boolean {
    if (item.file) return item.file.type === "application/pdf" || /\.pdf$/i.test(item.file.name || "");
    const where = (item.path || item.url || "").split("?")[0];
    return /\.pdf$/i.test(where);
}

/** Nome para mostrar de um PDF anexado: o do arquivo local, ou o final do caminho no armazenamento. */
export function attachmentDisplayName(item: { path?: string; url?: string; file?: MaybeFile }): string {
    if (item.file?.name) return item.file.name;
    const last = (item.path || item.url || "").split("?")[0].split("/").pop() || "documento.pdf";
    try { return decodeURIComponent(last); } catch { return last; }
}
