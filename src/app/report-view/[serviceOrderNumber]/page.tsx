"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type jsPDF from "jspdf";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { checklistService } from "@/services/supabase/checklistService";
import { type TechnicalReport, type TechnicalReportPhoto, type TechnicalReportPhotoCategory, type ChecklistTemplate } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ScanLine, AlertTriangle, Wrench, MessageSquare, ClipboardList } from "lucide-react";
import { format } from "date-fns";

const PRODUCT_LABELS: Record<string, string> = {
  produto_frontal: "Frontal",
  produto_traseira: "Traseira",
  produto_serial: "Serial",
};

export default function ReportViewPage() {
  const { serviceOrderNumber } = useParams() as { serviceOrderNumber: string };
  const [report, setReport] = useState<TechnicalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsDownloading(true);
    try {
      await buildAndDownloadPdf(report);
    } catch (e) {
      console.error("Falha ao gerar PDF", e);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const decoded = decodeURIComponent(serviceOrderNumber);
        const reports = await technicalReportService.getByServiceOrderNumber(decoded);
        setReport(reports[0] || null);
      } finally {
        setLoading(false);
      }
    };
    if (serviceOrderNumber) load();
  }, [serviceOrderNumber]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-8">
        <p className="text-muted-foreground">Nenhum relatório encontrado para a OS {decodeURIComponent(serviceOrderNumber)}.</p>
      </div>
    );
  }

  const productPhotos = ["produto_frontal", "produto_traseira", "produto_serial"] as TechnicalReportPhotoCategory[];
  const defectPhotos = report.photos.filter(p => p.category === "defeito").sort((a, b) => a.order - b.order);
  const repairPhotos = report.photos.filter(p => p.category === "pos_reparo").sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10 bg-white text-black min-h-screen">
      <div className="no-print flex justify-end gap-2 mb-6">
        <Button onClick={handleDownloadPdf} disabled={isDownloading}>
          {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {isDownloading ? "Gerando PDF..." : "Baixar PDF"}
        </Button>
      </div>

      <div className="bg-white">
        <div className="pdf-atomic flex items-center gap-3 pb-4 mb-6 border-b-2 border-primary/20">
          <img src="/icon.svg" alt="SmartOS" className="h-11 w-11 rounded-lg shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">SmartOS</p>
            <h1 className="text-2xl font-bold leading-tight tracking-tight">Relatório Técnico</h1>
          </div>
        </div>

        <div className="pdf-atomic flex flex-wrap gap-x-6 gap-y-3 text-sm mb-8">
          <InfoField label="OS" value={report.serviceOrderNumber} mono />
          <InfoField label="Data" value={format(report.createdAt, "dd/MM/yyyy")} />
          <InfoField label="Técnico" value={report.technicianName} />
          <InfoField label="Produto" value={report.productModel} mono />
          <InfoField label="Série" value={report.serialNumber} mono />
        </div>

        {productPhotos.some(cat => report.photos.some(p => p.category === cat)) && (
          <ReportSection title="Fotos do Produto" icon={ScanLine}>
            <div className="flex gap-4">
              {productPhotos.map(cat => {
                const photo = report.photos.find(p => p.category === cat);
                if (!photo) return null;
                return <PhotoCard key={cat} photo={photo} label={PRODUCT_LABELS[cat]} className="flex-1" />;
              })}
            </div>
          </ReportSection>
        )}

        {defectPhotos.length > 0 && (
          <ReportSection title="Defeito Apresentado" icon={AlertTriangle}>
            <div className="flex flex-wrap gap-4">
              {defectPhotos.map(photo => (
                <PhotoCard key={photo.path} photo={photo} className="w-64" />
              ))}
            </div>
          </ReportSection>
        )}

        {repairPhotos.length > 0 && (
          <ReportSection title="Pós-Reparo" icon={Wrench}>
            <div className="flex flex-wrap gap-4">
              {repairPhotos.map(photo => (
                <PhotoCard key={photo.path} photo={photo} className="w-64" />
              ))}
            </div>
          </ReportSection>
        )}

        {report.repairDescription && (
          <ReportSection title="Descrição do Reparo" icon={ClipboardList}>
            <p className="text-sm whitespace-pre-wrap">{report.repairDescription}</p>
          </ReportSection>
        )}

        {report.observations && (
          <ReportSection title="Observações" icon={MessageSquare} last>
            <p className="text-sm whitespace-pre-wrap">{report.observations}</p>
          </ReportSection>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-medium ${mono ? "font-mono tracking-tight" : ""}`}>{value}</p>
    </div>
  );
}

function ReportSection({
  title,
  icon: Icon,
  children,
  last,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`photo-item ${last ? "" : "mb-8"}`}>
      <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary mb-3">
        {Icon && <Icon className="h-4 w-4" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

// Fotos verticais ficam minúsculas dentro dos cards 16:9 do relatório — gira 90°
// para exibir na horizontal, igual às demais. Se a imagem já é paisagem/quadrada,
// usa a original sem reprocessar (evita perda de qualidade desnecessária).
function rotateToLandscapeCanvas(img: HTMLImageElement): string | null {
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

function PhotoCard({ photo, label, className = "" }: { photo: TechnicalReportPhoto; label?: string; className?: string }) {
  const [src, setSrc] = useState(photo.url);

  useEffect(() => {
    let cancelled = false;
    setSrc(photo.url);
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled || img.naturalHeight <= img.naturalWidth) return;
      const rotated = rotateToLandscapeCanvas(img);
      if (rotated && !cancelled) setSrc(rotated);
    };
    img.src = photo.url;
    return () => { cancelled = true; };
  }, [photo.url]);

  return (
    <div className={`photo-item ${className}`}>
      <img
        src={src}
        alt={label || "Foto do relatório"}
        className="w-full aspect-video object-contain rounded-md border border-gray-200 bg-gray-50 shadow-sm"
      />
      {label && <p className="text-center text-xs mt-1.5 font-medium text-muted-foreground">{label}</p>}
    </div>
  );
}

// ── Geração nativa do PDF ──────────────────────────────────────────────────
// Monta o documento inteiro com o próprio jsPDF (texto vetorial + fotos na
// resolução original) em vez de tirar um "print" da tela — assim as fotos
// nunca perdem qualidade em relação ao arquivo enviado pelo técnico.

type LoadedImage = { dataUrl: string; format: "JPEG" | "PNG" | "WEBP"; width: number; height: number };

async function loadImageForPdf(url: string): Promise<LoadedImage> {
  const res = await fetch(url);
  const blob = await res.blob();
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


async function buildAndDownloadPdf(report: TechnicalReport): Promise<void> {
  const { default: JsPdfCtor } = await import("jspdf");

  const results = await Promise.allSettled(report.photos.map(p => loadImageForPdf(p.url)));
  const loadedByPath = new Map<string, LoadedImage>();
  report.photos.forEach((p, i) => {
    const r = results[i];
    if (r.status === "fulfilled") loadedByPath.set(p.path, r.value);
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
    ],
    contentWidth
  );
  y += 4;

  const productCats = ["produto_frontal", "produto_traseira", "produto_serial"] as TechnicalReportPhotoCategory[];
  const productPhotosList = productCats
    .map(cat => report.photos.find(p => p.category === cat))
    .filter((p): p is TechnicalReportPhoto => !!p && loadedByPath.has(p.path));

  if (productPhotosList.length > 0) {
    y = ensureSpace(pdf, y, 6, margin, pageHeight);
    y = drawSectionTitle(pdf, margin, y, "Fotos do Produto");
    y = drawPhotoRow(
      pdf,
      margin,
      y,
      contentWidth,
      productPhotosList.map(p => ({ loaded: loadedByPath.get(p.path)!, label: PRODUCT_LABELS[p.category] })),
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

  if (report.repairDescription) {
    y = drawTextSection(pdf, margin, y, contentWidth, "Descrição do Reparo", report.repairDescription, margin, pageHeight);
  }
  if (report.observations) {
    y = drawTextSection(pdf, margin, y, contentWidth, "Observações", report.observations, margin, pageHeight);
  }

  const reportBytes = pdf.output("arraybuffer");
  let finalBytes: ArrayBuffer | Uint8Array = reportBytes;

  if (report.checklistTemplateId) {
    try {
      const template = await checklistService.getById(report.checklistTemplateId);
      if (template) {
        const checklistBytes = await buildFilledChecklistBytes(template, report);
        if (checklistBytes) {
          finalBytes = await mergePdfBytes(reportBytes, checklistBytes);
        }
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
}

// ── Checklist anexado ao PDF ────────────────────────────────────────────────
// Preenche o template de checklist selecionado usando os próprios dados do
// relatório (Serial, Modelo, Cliente, Observações, Técnico, OS, Data) e anexa
// as páginas ao final do PDF do relatório. A assinatura do cliente capturada
// no relatório é embutida no(s) campo(s) de assinatura do checklist.

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
    const pageToDraw = pages[field.page - 1] || pages[0];
    if (!pageToDraw) continue;
    const pageHeight = pageToDraw.getHeight();

    if (field.type === "signature") {
      if (report.clientSignature) {
        const pngImage = await pdfDoc.embedPng(report.clientSignature);
        const w = field.width || 150;
        const h = field.height || 40;
        pageToDraw.drawImage(pngImage, { x: field.x, y: pageHeight - field.y - h, width: w, height: h });
      }
      continue;
    }

    // Campos vinculados a uma variável usam o valor correspondente do relatório.
    // Como fallback (ex: campo "Serial" deixado sem vínculo no editor de checklist,
    // já que normalmente é preenchido via scanner na tela original), qualquer campo
    // cujo nome contenha "serial" também recebe o número de série do relatório.
    let value = field.variableKey ? resolveChecklistValue(field.variableKey, report) : "";
    if (!value && field.name?.toLowerCase().includes("serial")) {
      value = report.serialNumber || "";
    }
    if (!value) continue;

    if (field.type === "text") {
      pageToDraw.drawText(value, { x: field.x, y: pageHeight - field.y - 10, font, size: 12, color: rgb(0, 0, 0) });
    }
  }

  return pdfDoc.save();
}

async function mergePdfBytes(reportBytes: ArrayBuffer, checklistBytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();

  const reportDoc = await PDFDocument.load(reportBytes);
  const reportPages = await merged.copyPages(reportDoc, reportDoc.getPageIndices());
  reportPages.forEach(p => merged.addPage(p));

  const checklistDoc = await PDFDocument.load(checklistBytes);
  const checklistPages = await merged.copyPages(checklistDoc, checklistDoc.getPageIndices());
  checklistPages.forEach(p => merged.addPage(p));

  return merged.save();
}
