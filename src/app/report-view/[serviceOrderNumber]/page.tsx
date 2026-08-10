"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type jsPDF from "jspdf";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { type TechnicalReport, type TechnicalReportPhoto, type TechnicalReportPhotoCategory } from "@/lib/data";
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
          <ReportSection title="Observações" icon={MessageSquare}>
            <p className="text-sm whitespace-pre-wrap">{report.observations}</p>
          </ReportSection>
        )}

        {report.aiScore != null && (
          <ReportSection title="Nota do Relatório (IA)" last>
            <div className="flex items-center gap-5 rounded-lg border border-gray-200 p-4">
              <ScoreGauge score={report.aiScore} />
              {report.aiScoreFeedback && <p className="text-sm text-gray-700">{report.aiScoreFeedback}</p>}
            </div>
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

function PhotoCard({ photo, label, className = "" }: { photo: TechnicalReportPhoto; label?: string; className?: string }) {
  return (
    <div className={`photo-item ${className}`}>
      <img
        src={photo.url}
        alt={label || "Foto do relatório"}
        className="w-full aspect-video object-contain rounded-md border border-gray-200 bg-gray-50 shadow-sm"
      />
      {label && <p className="text-center text-xs mt-1.5 font-medium text-muted-foreground">{label}</p>}
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 8) return "#16a34a";
  if (score >= 5) return "#d97706";
  return "#dc2626";
}

function scoreColorRgb(score: number): [number, number, number] {
  if (score >= 8) return [22, 163, 74];
  if (score >= 5) return [217, 119, 6];
  return [220, 38, 38];
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score / 10));
  const offset = circumference * (1 - pct);
  const color = scoreColor(score);

  return (
    <svg width="96" height="96" viewBox="0 0 96 96" className="shrink-0">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="9" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="46" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="ui-monospace, monospace" fill={color}>
        {score.toFixed(1)}
      </text>
      <text x="48" y="61" textAnchor="middle" fontSize="9" fill="#94a3b8">
        / 10
      </text>
    </svg>
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
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
  const mime = blob.type || "image/jpeg";
  const imgFormat: LoadedImage["format"] = mime.includes("png") ? "PNG" : mime.includes("webp") ? "WEBP" : "JPEG";
  return { dataUrl, format: imgFormat, width, height };
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

function drawArc(pdf: jsPDF, cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const steps = 48;
  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = startDeg + (endDeg - startDeg) * (i / steps);
    const rad = (t * Math.PI) / 180;
    const pt: [number, number] = [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    if (prev) pdf.line(prev[0], prev[1], pt[0], pt[1]);
    prev = pt;
  }
}

function drawScoreSection(pdf: jsPDF, x: number, y: number, contentWidth: number, score: number, feedback: string | undefined, margin: number, pageHeight: number): number {
  const boxHeight = 34;
  y = ensureSpace(pdf, y, boxHeight + 8, margin, pageHeight);
  y = drawSectionTitle(pdf, x, y, "Nota do Relatório (IA)");

  pdf.setDrawColor(229, 231, 235);
  pdf.roundedRect(x, y, contentWidth, boxHeight, 2, 2, "S");

  const cx = x + 20;
  const cy = y + boxHeight / 2;
  const r = 12;
  const color = scoreColorRgb(score);
  const pct = Math.max(0, Math.min(1, score / 10));

  pdf.setLineWidth(2.2);
  pdf.setDrawColor(229, 231, 235);
  drawArc(pdf, cx, cy, r, 0, 360);
  pdf.setDrawColor(color[0], color[1], color[2]);
  drawArc(pdf, cx, cy, r, -90, -90 + pct * 360);

  pdf.setFont("courier", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(color[0], color[1], color[2]);
  pdf.text(score.toFixed(1), cx, cy + 1.5, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);
  pdf.setTextColor(148, 163, 184);
  pdf.text("/ 10", cx, cy + 5.5, { align: "center" });

  if (feedback) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(55, 65, 81);
    const lines = pdf.splitTextToSize(feedback, contentWidth - 50) as string[];
    pdf.text(lines, x + 45, cy - ((lines.length - 1) * 4.6) / 2 + 1.5);
  }

  return y + boxHeight + 6;
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
  if (report.aiScore != null) {
    y = drawScoreSection(pdf, margin, y, contentWidth, report.aiScore, report.aiScoreFeedback, margin, pageHeight);
  }

  pdf.save(`${report.serviceOrderNumber}-relatorio.pdf`);
}
