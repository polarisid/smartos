"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { type TechnicalReport, type TechnicalReportPhoto, type TechnicalReportPhotoCategory } from "@/lib/data";
import { buildAndDownloadPdf, rotateToLandscapeCanvas } from "@/lib/technicalReportPdf";
import { productPhotosOf, productPhotoLabel } from "@/lib/productLine";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ScanLine, AlertTriangle, Wrench, MessageSquare, ClipboardList, FileText, RefreshCw } from "lucide-react";
import { isPdfAttachment, attachmentDisplayName, RMA_CATEGORIES, RMA_CATEGORY_LABELS } from "@/lib/reportAttachments";
import { format } from "date-fns";

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

  const productPhotos = productPhotosOf(report.photos);
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
          {report.reportType === "rma" && <InfoField label="Tipo" value="Troca RMA" />}
        </div>

        {productPhotos.length > 0 && (
          <ReportSection title="Fotos do Produto" icon={ScanLine}>
            <div className="flex flex-wrap gap-4">
              {productPhotos.map((photo, i) => (
                <PhotoCard key={photo.path || i} photo={photo} label={productPhotoLabel(photo.category, photo.label)} className="min-w-[30%] flex-1" />
              ))}
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

        {RMA_CATEGORIES.map(cat => {
          const items = report.photos.filter(p => p.category === cat).sort((a, b) => a.order - b.order);
          if (items.length === 0) return null;
          return (
            <ReportSection key={cat} title={RMA_CATEGORY_LABELS[cat]} icon={RefreshCw}>
              <div className="flex flex-wrap gap-4">
                {items.map(photo => isPdfAttachment({ path: photo.path, url: photo.url }) ? (
                  <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" className="flex w-64 items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm shadow-sm hover:bg-gray-100">
                    <FileText className="h-6 w-6 shrink-0" />
                    <span className="break-all">{attachmentDisplayName({ path: photo.path, url: photo.url })}</span>
                  </a>
                ) : (
                  <PhotoCard key={photo.path} photo={photo} className="w-64" />
                ))}
              </div>
            </ReportSection>
          );
        })}

        {report.repairDescription && (
          <ReportSection title={report.reportType === "rma" ? "Descrição da Troca" : "Descrição do Reparo"} icon={ClipboardList}>
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
