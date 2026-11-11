// Geração do PDF do Relatório Técnico Fotográfico (+ checklist anexado, se selecionado).
// Compartilhado entre a tela de preenchimento ((main)/reports) — que baixa direto após
// salvar, sem precisar re-buscar os dados — e a tela de visualização (report-view).
//
// O PDF é montado nativamente com jsPDF (texto vetorial + fotos na resolução original)
// em vez de tirar um "print" da tela, para nunca perder qualidade em relação ao arquivo
// enviado pelo técnico.

import type jsPDF from "jspdf";
import type { PDFFont } from "pdf-lib";
import { checklistService } from "@/services/supabase/checklistService";
import { type TechnicalReport, type TechnicalReportPhoto, type TechnicalReportPhotoCategory, type ChecklistTemplate } from "@/lib/data";
import { productPhotosOf, productPhotoLabel } from "@/lib/productLine";
import { isPdfAttachment, RMA_CATEGORIES, RMA_CATEGORY_LABELS } from "@/lib/reportAttachments";
import { format } from "date-fns";

export const PRODUCT_LABELS: Record<string, string> = {
  produto_frontal: "Frontal",
  produto_traseira: "Traseira",
  produto_serial: "Serial",
};

// Fotos verticais ficam minúsculas dentro dos cards 16:9 do relatório — gira 90°
// para exibir na horizontal, igual às demais. Se a imagem já é paisagem/quadrada,
// usa a original sem reprocessar (evita perda de qualidade desnecessária).
export function rotateToLandscapeCanvas(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    return canvas.toDataURL("image/jpeg", 0.96);
  } catch {
    // Ex: falha de CORS ao ler pixels da imagem — mantém a foto original.
    return null;
  }
}

// Redesenha a imagem num canvas e reexporta como JPEG, sem girar. Necessário
// porque o addImage do jsPDF não decodifica WEBP de forma confiável (fotos de
// celulares Android que capturam nesse formato saem como ruído/listras na
// página) - normalizando tudo pra JPEG aqui, o jsPDF nunca recebe um formato
// problemático.
function normalizeToJpegCanvas(img: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.96);
  } catch {
    // Ex: falha de CORS ao ler pixels da imagem — mantém a foto original.
    return null;
  }
}

type LoadedImage = { dataUrl: string; format: "JPEG" | "PNG" | "WEBP"; width: number; height: number };

// Plano B quando o fetch() falha (CORS/cache do navegador): carrega direto como <img>, só serve se o servidor permitir ler os pixels.
function loadImageDirect(url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const el = new window.Image();
    if (!url.startsWith("blob:") && !url.startsWith("data:")) el.crossOrigin = "anonymous";
    el.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = el.naturalWidth;
        canvas.height = el.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas indisponível");
        ctx.drawImage(el, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
        if (!dataUrl || dataUrl === "data:,") throw new Error("canvas vazio");
        resolve({ dataUrl, format: "JPEG", width: el.naturalWidth, height: el.naturalHeight });
      } catch (e) { reject(e); }
    };
    el.onerror = () => reject(new Error("não foi possível abrir a imagem"));
    el.src = url;
  });
}

async function loadImageForPdf(url: string): Promise<LoadedImage> {
  try {
    return await loadImageViaFetch(url);
  } catch (first) {
    // uma segunda chance (sinal oscilando) e depois o plano B
    try {
      await new Promise(r => setTimeout(r, 600));
      return await loadImageViaFetch(url);
    } catch {
      try { return await loadImageDirect(url); } catch { throw first; }
    }
  }
}

async function loadImageViaFetch(url: string): Promise<LoadedImage> {
  // cache: 'no-store' é necessário: a mesma URL da foto já foi carregada como
  // <img> em algum ponto (thumbnail do formulário, visualização do relatório)
  // antes de gerar o PDF - reaproveitar essa entrada do cache do navegador
  // num fetch() pode falhar a checagem de CORS mesmo com o servidor mandando
  // os headers certos (mesma causa do download de fotos falhar às vezes).
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`foto indisponível (HTTP ${res.status})`);
  const blob = await res.blob();
  if (blob.size === 0) throw new Error("foto vazia");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  // Foto vertical: gira 90° para caber na horizontal, igual às demais no PDF.
  if (img.naturalHeight > img.naturalWidth) {
    const rotated = rotateToLandscapeCanvas(img);
    if (rotated) {
      return { dataUrl: rotated, format: "JPEG", width: img.naturalHeight, height: img.naturalWidth };
    }
  }

  // Normaliza pra JPEG via canvas (ver comentário em normalizeToJpegCanvas) -
  // só cai pro dataUrl original (com o format detectado pelo mime) se o canvas
  // falhar por algum motivo (ex.: CORS bloqueando leitura de pixels).
  const normalized = normalizeToJpegCanvas(img);
  if (normalized) {
    return { dataUrl: normalized, format: "JPEG", width: img.naturalWidth, height: img.naturalHeight };
  }

  const mime = blob.type || "image/jpeg";
  const imgFormat: LoadedImage["format"] = mime.includes("png") ? "PNG" : mime.includes("webp") ? "WEBP" : "JPEG";
  return { dataUrl, format: imgFormat, width: img.naturalWidth, height: img.naturalHeight };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fitContain(naturalW: number, naturalH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / naturalW, boxH / naturalH);
  const drawW = naturalW * scale;
  const drawH = naturalH * scale;
  return { drawW, drawH, offX: (boxW - drawW) / 2, offY: (boxH - drawH) / 2 };
}

function ensureSpace(pdf: jsPDF, y: number, needed: number, margin: number, pageHeight: number): number {
  if (y + needed > pageHeight - margin) {
    pdf.addPage();
    return margin;
  }
  return y;
}

function drawHeader(pdf: jsPDF, x: number, y: number, contentWidth: number): number {
  const boxSize = 12;
  pdf.setFillColor(26, 115, 232);
  pdf.roundedRect(x, y, boxSize, boxSize, 2.5, 2.5, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("S", x + boxSize / 2, y + boxSize / 2 + 3.4, { align: "center" });

  pdf.setTextColor(100, 116, 139);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("SMARTOS", x + boxSize + 5, y + 4.5);

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("Relatório Técnico", x + boxSize + 5, y + 10.5);

  const bottom = y + boxSize + 4;
  pdf.setDrawColor(26, 115, 232);
  pdf.setLineWidth(0.6);
  pdf.line(x, bottom, x + contentWidth, bottom);
  return bottom + 7;
}

function drawInfoFields(pdf: jsPDF, x: number, y: number, fields: { label: string; value?: string; mono?: boolean }[], contentWidth: number): number {
  const visible = fields.filter(f => f.value);
  const cols = 3;
  const colWidth = contentWidth / cols;
  const rowHeight = 11;

  visible.forEach((f, i) => {
    const cx = x + (i % cols) * colWidth;
    const cy = y + Math.floor(i / cols) * rowHeight;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text(f.label.toUpperCase(), cx, cy);
    pdf.setFont(f.mono ? "courier" : "helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(15, 23, 42);
    pdf.text(f.value!, cx, cy + 5);
  });

  const rows = Math.ceil(visible.length / cols) || 1;
  return y + rows * rowHeight + 3;
}

function drawSectionTitle(pdf: jsPDF, x: number, y: number, title: string): number {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(26, 115, 232);
  pdf.text(title.toUpperCase(), x, y);
  return y + 5;
}

function drawPhotoRow(
  pdf: jsPDF,
  x: number,
  y: number,
  contentWidth: number,
  photos: { loaded: LoadedImage; label?: string }[],
  perRow: number,
  margin: number,
  pageHeight: number
): number {
  const gap = 4;
  const cardWidth = (contentWidth - gap * (perRow - 1)) / perRow;
  const cardHeight = cardWidth * (9 / 16);
  const rows = chunk(photos, perRow);

  rows.forEach(row => {
    const hasLabel = row.some(p => p.label);
    const rowHeight = cardHeight + (hasLabel ? 5 : 0) + 2;
    y = ensureSpace(pdf, y, rowHeight, margin, pageHeight);

    row.forEach((p, i) => {
      const cx = x + i * (cardWidth + gap);
      pdf.setFillColor(249, 250, 251);
      pdf.setDrawColor(229, 231, 235);
      pdf.roundedRect(cx, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

      const { drawW, drawH, offX, offY } = fitContain(p.loaded.width, p.loaded.height, cardWidth - 2, cardHeight - 2);
      pdf.addImage(p.loaded.dataUrl, p.loaded.format, cx + 1 + offX, y + 1 + offY, drawW, drawH);

      if (p.label) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(p.label, cx + cardWidth / 2, y + cardHeight + 4, { align: "center" });
      }
    });

    y += rowHeight;
  });

  return y + 3;
}

function drawTextSection(pdf: jsPDF, x: number, y: number, contentWidth: number, title: string, text: string, margin: number, pageHeight: number): number {
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const lines = pdf.splitTextToSize(text, contentWidth) as string[];
  const neededHeight = 5 + lines.length * 4.6 + 6;
  y = ensureSpace(pdf, y, neededHeight, margin, pageHeight);
  y = drawSectionTitle(pdf, x, y, title);
  pdf.setTextColor(30, 41, 59);
  pdf.text(lines, x, y);
  return y + lines.length * 4.6 + 6;
}

// ── Checklist anexado ao PDF ────────────────────────────────────────────────
// Preenche o template de checklist selecionado usando os próprios dados do
// relatório (Serial, Modelo, Cliente, Observações, Técnico, OS, Data) e anexa
// as páginas ao final do PDF do relatório. A assinatura do cliente capturada
// no relatório é embutida no(s) campo(s) de assinatura do checklist.

function wrapPdfText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  // Respeita quebras de linha já existentes no texto (ex: parágrafos em Observações).
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function normalizeForMatch(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function resolveChecklistValue(variableKey: string, report: TechnicalReport): string {
  const data: Record<string, string> = {
    serviceOrder: report.serviceOrderNumber,
    consumerName: report.consumerName || "",
    model: report.productModel || "",
    serial: report.serialNumber || "",
    observations: report.observations || report.repairDescription || "",
    technicianName: report.technicianName || "",
    currentDate: new Date().toLocaleDateString("pt-BR"),
  };
  return data[variableKey] || "";
}

async function buildFilledChecklistBytes(template: ChecklistTemplate, report: TechnicalReport): Promise<Uint8Array | null> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const pdfUrl = template.pdfUrl.startsWith("http") ? template.pdfUrl : `${window.location.origin}${template.pdfUrl}`;
  const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const field of template.fields || []) {
    try {
      const pageToDraw = pages[field.page - 1] || pages[0];
      if (!pageToDraw) continue;
      const pageHeight = pageToDraw.getHeight();
      const pageWidth = pageToDraw.getWidth();

      if (field.type === "signature") {
        if (!report.clientSignature) {
          console.warn(`[checklist] Campo de assinatura "${field.name}" sem clientSignature no relatório — deixado em branco.`);
          continue;
        }
        const pngImage = await pdfDoc.embedPng(report.clientSignature);
        const w = field.width || 150;
        const h = field.height || 40;
        pageToDraw.drawImage(pngImage, { x: field.x, y: pageHeight - field.y - h, width: w, height: h });
        continue;
      }

      // Campos vinculados a uma variável usam o valor correspondente do relatório.
      // Fallback por NOME do campo para os casos comuns onde o checklist não tem o
      // campo vinculado a uma variável (ex: "Serial", normalmente preenchido via
      // scanner na tela original; ou "Observações", normalmente digitado à mão) —
      // qualquer campo cujo nome contenha esses termos recebe o valor correspondente
      // do relatório mesmo sem vínculo explícito no editor de checklist.
      let value = field.variableKey ? resolveChecklistValue(field.variableKey, report) : "";
      const normalizedName = normalizeForMatch(field.name || "");
      if (!value && normalizedName.includes("serial")) {
        value = report.serialNumber || "";
      }
      if (!value && normalizedName.includes("observa")) {
        value = report.observations || report.repairDescription || "";
      }
      if (!value) {
        console.warn(`[checklist] Campo "${field.name}" (variável: ${field.variableKey || "nenhuma"}) sem valor no relatório — deixado em branco.`);
        continue;
      }

      if (field.type === "text") {
        const fontSize = 12;
        // Quebra em várias linhas quando o texto é maior que a caixa do campo (ou uma
        // largura generosa, se a caixa não foi configurada) — sem isso, texto longo
        // (ex: observações) é desenhado numa linha só e sai da página, ficando invisível.
        const maxWidth = Math.max(field.width || Math.min(400, pageWidth - field.x - 10), 20);
        const lines = wrapPdfText(value, font, fontSize, maxWidth);
        const lineHeight = fontSize * 1.15;
        lines.forEach((line, i) => {
          pageToDraw.drawText(line, { x: field.x, y: pageHeight - field.y - 10 - i * lineHeight, font, size: fontSize, color: rgb(0, 0, 0) });
        });
      }
    } catch (fieldError) {
      console.error(`[checklist] Falha ao preencher o campo "${field.name}":`, fieldError);
    }
  }

  return pdfDoc.save();
}

// Junta o PDF do relatório com outros PDFs, na ordem. Um PDF que não abre (corrompido, protegido) fica de fora e o resto segue.
async function mergePdfBytes(baseBytes: ArrayBuffer | Uint8Array, extras: Array<ArrayBuffer | Uint8Array>): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  const baseDoc = await PDFDocument.load(baseBytes);
  const basePages = await merged.copyPages(baseDoc, baseDoc.getPageIndices());
  basePages.forEach(p => merged.addPage(p));

  for (const extra of extras) {
    try {
      const doc = await PDFDocument.load(extra, { ignoreEncryption: true });
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    } catch (e) {
      console.warn("PDF anexado não pôde ser juntado ao relatório:", e);
    }
  }

  return merged.save();
}

async function loadPdfBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`PDF indisponível (HTTP ${res.status})`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("PDF vazio");
  return bytes;
}

// localPhotoUrls: mapa path -> URL local (blob) das fotos que o aparelho ainda
// tem em memória. Usa essa cópia em vez de baixar a foto de novo do servidor -
// instantâneo, funciona sem rede e era a maior parte da demora do PDF.
// Devolve quantas fotos não puderam ser carregadas (ficam de fora do PDF) para quem chamou avisar o técnico.
export async function buildAndDownloadPdf(report: TechnicalReport, opts?: { localPhotoUrls?: Record<string, string> }): Promise<{ failedPhotos: number }> {
  const { default: JsPdfCtor } = await import("jspdf");

  const isRma = report.reportType === "rma";
  // PDFs anexados (troca RMA) não viram imagem: as páginas deles são juntadas ao final do relatório.
  const pdfAttachments = report.photos
    .filter(p => isPdfAttachment({ path: p.path, url: p.url }))
    .sort((a, b) => RMA_CATEGORIES.indexOf(a.category) - RMA_CATEGORIES.indexOf(b.category) || a.order - b.order);
  const imagePhotos = report.photos.filter(p => !isPdfAttachment({ path: p.path, url: p.url }));

  const results = await Promise.allSettled(imagePhotos.map(p => loadImageForPdf(opts?.localPhotoUrls?.[p.path] || p.url)));
  const loadedByPath = new Map<string, LoadedImage>();
  let failedPhotos = 0;
  imagePhotos.forEach((p, i) => {
    const r = results[i];
    if (r.status === "fulfilled") loadedByPath.set(p.path, r.value);
    else { failedPhotos++; console.warn("Foto não entrou no PDF:", p.category, r.reason); }
  });
  const pdfResults = await Promise.allSettled(pdfAttachments.map(p => loadPdfBytes(opts?.localPhotoUrls?.[p.path] || p.url)));
  const attachedPdfBytes: ArrayBuffer[] = [];
  pdfResults.forEach((r, i) => {
    if (r.status === "fulfilled") attachedPdfBytes.push(r.value);
    else { failedPhotos++; console.warn("PDF anexado não entrou no relatório:", pdfAttachments[i].category, r.reason); }
  });

  const pdf = new JsPdfCtor("p", "mm", "a4");
  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  y = drawHeader(pdf, margin, y, contentWidth);
  y = drawInfoFields(
    pdf,
    margin,
    y,
    [
      { label: "OS", value: report.serviceOrderNumber, mono: true },
      { label: "Data", value: format(report.createdAt, "dd/MM/yyyy") },
      { label: "Técnico", value: report.technicianName },
      { label: "Produto", value: report.productModel, mono: true },
      { label: "Série", value: report.serialNumber, mono: true },
      ...(isRma ? [{ label: "Tipo", value: "Troca RMA" }] : []),
    ],
    contentWidth
  );
  y += 4;

  // PDF incompleto precisa ser óbvio mesmo depois de enviado por WhatsApp: marca em vermelho no topo.
  if (failedPhotos > 0) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(200, 30, 30);
    const warn = pdf.splitTextToSize(`ATENÇÃO: ${failedPhotos} de ${report.photos.length} foto(s) não puderam ser incluídas neste PDF. Gere o PDF novamente em Meus Relatórios.`, contentWidth) as string[];
    pdf.text(warn, margin, y + 3);
    y += warn.length * 5 + 4;
    pdf.setTextColor(0, 0, 0);
    pdf.setFont("helvetica", "normal");
  }

  // Fotos do produto: as pedidas para a linha do produto (frontal/traseira/serial ou as configuradas no admin).
  const productPhotosList = productPhotosOf(report.photos).filter(p => loadedByPath.has(p.path));

  if (productPhotosList.length > 0) {
    y = ensureSpace(pdf, y, 6, margin, pageHeight);
    y = drawSectionTitle(pdf, margin, y, "Fotos do Produto");
    y = drawPhotoRow(
      pdf,
      margin,
      y,
      contentWidth,
      productPhotosList.map(p => ({ loaded: loadedByPath.get(p.path)!, label: productPhotoLabel(p.category, p.label) })),
      3,
      margin,
      pageHeight
    );
  }

  const defectPhotos = report.photos
    .filter(p => p.category === "defeito" && loadedByPath.has(p.path))
    .sort((a, b) => a.order - b.order);
  if (defectPhotos.length > 0) {
    y = ensureSpace(pdf, y, 6, margin, pageHeight);
    y = drawSectionTitle(pdf, margin, y, "Defeito Apresentado");
    y = drawPhotoRow(pdf, margin, y, contentWidth, defectPhotos.map(p => ({ loaded: loadedByPath.get(p.path)! })), 2, margin, pageHeight);
  }

  const repairPhotos = report.photos
    .filter(p => p.category === "pos_reparo" && loadedByPath.has(p.path))
    .sort((a, b) => a.order - b.order);
  if (repairPhotos.length > 0) {
    y = ensureSpace(pdf, y, 6, margin, pageHeight);
    y = drawSectionTitle(pdf, margin, y, "Pós-Reparo");
    y = drawPhotoRow(pdf, margin, y, contentWidth, repairPhotos.map(p => ({ loaded: loadedByPath.get(p.path)! })), 2, margin, pageHeight);
  }

  // Troca RMA: fotos do produto novo e do produto antigo (os PDFs anexados entram como páginas ao final).
  if (isRma) {
    for (const cat of RMA_CATEGORIES) {
      const catPhotos = imagePhotos.filter(p => p.category === cat && loadedByPath.has(p.path)).sort((a, b) => a.order - b.order);
      const catPdfs = pdfAttachments.filter(p => p.category === cat).length;
      if (catPhotos.length === 0 && catPdfs === 0) continue;
      y = ensureSpace(pdf, y, 6, margin, pageHeight);
      y = drawSectionTitle(pdf, margin, y, RMA_CATEGORY_LABELS[cat]);
      if (catPhotos.length > 0) {
        y = drawPhotoRow(pdf, margin, y, contentWidth, catPhotos.map(p => ({ loaded: loadedByPath.get(p.path)! })), 2, margin, pageHeight);
      }
      if (catPdfs > 0) {
        y = ensureSpace(pdf, y, 8, margin, pageHeight);
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(9);
        pdf.setTextColor(90, 90, 90);
        pdf.text(`${catPdfs} PDF anexado${catPdfs > 1 ? "s" : ""} nas páginas seguintes.`, margin, y + 3);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont("helvetica", "normal");
        y += 8;
      }
    }
  }

  if (report.repairDescription) {
    y = drawTextSection(pdf, margin, y, contentWidth, isRma ? "Descrição da Troca" : "Descrição do Reparo", report.repairDescription, margin, pageHeight);
  }
  if (report.observations) {
    y = drawTextSection(pdf, margin, y, contentWidth, "Observações", report.observations, margin, pageHeight);
  }

  const reportBytes = pdf.output("arraybuffer");
  let finalBytes: ArrayBuffer | Uint8Array = reportBytes;

  if (attachedPdfBytes.length > 0) {
    try {
      finalBytes = await mergePdfBytes(reportBytes, attachedPdfBytes);
    } catch (e) {
      console.error("Falha ao juntar os PDFs anexados — baixando o relatório sem eles.", e);
      failedPhotos += attachedPdfBytes.length;
    }
  }

  if (report.checklistTemplateId) {
    try {
      const template = await checklistService.getById(report.checklistTemplateId);
      if (template) {
        const checklistBytes = await buildFilledChecklistBytes(template, report);
        if (checklistBytes) {
          finalBytes = await mergePdfBytes(finalBytes, [checklistBytes]);
        }
      } else {
        console.warn(`[checklist] Template ${report.checklistTemplateId} não encontrado — baixando só o relatório.`);
      }
    } catch (e) {
      console.error("Falha ao anexar checklist ao PDF — baixando só o relatório.", e);
    }
  }

  const blob = new Blob([finalBytes as BlobPart], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${report.serviceOrderNumber}-relatorio.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  return { failedPhotos };
}

/**
 * Baixa só o checklist preenchido do relatório (sem o relatório fotográfico), em um PDF à parte.
 * Devolve "sem-checklist" quando o relatório não usou checklist e "modelo-removido" quando o modelo escolhido não existe mais.
 */
export async function downloadChecklistPdf(report: TechnicalReport): Promise<"ok" | "sem-checklist" | "modelo-removido"> {
  if (!report.checklistTemplateId) return "sem-checklist";
  const template = await checklistService.getById(report.checklistTemplateId);
  if (!template) return "modelo-removido";
  const bytes = await buildFilledChecklistBytes(template, report);
  if (!bytes) return "modelo-removido";
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${report.serviceOrderNumber}-checklist.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
  return "ok";
}
