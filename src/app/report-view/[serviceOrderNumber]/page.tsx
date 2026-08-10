"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { type TechnicalReport, type TechnicalReportPhoto, type TechnicalReportPhotoCategory } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ScanLine, AlertTriangle, Wrench, MessageSquare } from "lucide-react";
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
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!contentRef.current || !report) return;
    setIsDownloading(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 10;
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageContentHeight = pdfHeight - margin * 2;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageContentHeight;
      while (heightLeft > 0) {
        position -= pageContentHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageContentHeight;
      }

      pdf.save(`${report.serviceOrderNumber}-relatorio.pdf`);
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

      <div ref={contentRef} className="bg-white">
        <div className="flex items-center gap-3 pb-4 mb-6 border-b-2 border-primary/20">
          <img src="/icon.svg" alt="SmartOS" className="h-10 w-10 rounded-lg shrink-0" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Relatório Técnico Fotográfico</h1>
            <p className="text-xs text-muted-foreground">SmartOS</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm mb-8">
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
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary mb-3">
        {Icon && <Icon className="h-3.5 w-3.5" />}
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
