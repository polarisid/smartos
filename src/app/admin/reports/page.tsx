"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Camera, Loader2, Search, ExternalLink, ImageIcon, Download, FolderDown, ChevronLeft, ChevronRight } from "lucide-react";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import { type TechnicalReport, type TechnicalReportPhotoCategory } from "@/lib/data";
import { format } from "date-fns";

const CATEGORY_LABELS: Record<TechnicalReportPhotoCategory, string> = {
  produto_frontal: "Produto - Frontal",
  produto_traseira: "Produto - Traseira",
  produto_serial: "Produto - Etiqueta Serial",
  defeito: "Defeito Apresentado",
  pos_reparo: "Pós-Reparo",
};

const PAGE_SIZE = 20;

type DateRangeKey = "today" | "7d" | "30d" | "all";

const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "all", label: "Todos" },
];

function resolveDateFrom(key: DateRangeKey): Date | undefined {
  const now = new Date();
  if (key === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (key === "7d") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (key === "30d") {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return undefined;
}

function scoreBadgeClasses(score?: number): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 8) return "bg-green-100 text-green-800 border-green-200";
  if (score >= 5) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

async function downloadPhoto(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function photoFilename(report: TechnicalReport, category: TechnicalReportPhotoCategory, url: string, index: number) {
  const ext = url.split(".").pop()?.split("?")[0] || "jpg";
  const slug = category + (index > 0 ? `-${index + 1}` : "");
  return `${report.serviceOrderNumber}-${slug}.${ext}`;
}

async function downloadAllPhotos(report: TechnicalReport) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const sorted = report.photos.slice().sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  const seen: Record<string, number> = {};

  await Promise.all(
    sorted.map(async (photo) => {
      const idx = seen[photo.category] ?? 0;
      seen[photo.category] = idx + 1;
      const filename = photoFilename(report, photo.category, photo.url, idx);
      const res = await fetch(photo.url);
      const blob = await res.blob();
      zip.file(filename, blob);
    })
  );

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const blobUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `${report.serviceOrderNumber}-fotos.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<TechnicalReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [avgScore, setAvgScore] = useState<number | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeKey>("30d");

  const [photosDialogReport, setPhotosDialogReport] = useState<TechnicalReport | null>(null);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  // Debounce da busca — evita disparar uma query a cada tecla digitada.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [dateRange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const dateFrom = resolveDateFrom(dateRange);

    Promise.all([
      technicalReportService.getPaginated({ page, pageSize: PAGE_SIZE, search, dateFrom }),
      technicalReportService.getScoresInRange({ search, dateFrom }),
    ])
      .then(([{ reports: reportsPage, total: totalCount }, scores]) => {
        if (cancelled) return;
        setReports(reportsPage);
        setTotal(totalCount);
        setAvgScore(scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, search, dateRange]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleOpenPhotos = async (report: TechnicalReport) => {
    setPhotosDialogReport(report);
    setIsLoadingPhotos(true);
    try {
      const full = await technicalReportService.getById(report.id);
      setPhotosDialogReport(full);
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!photosDialogReport) return;
    setIsDownloadingAll(true);
    try {
      await downloadAllPhotos(photosDialogReport);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Relatórios Fotográficos</CardTitle>
          <CardDescription>
            Relatórios enviados pelos técnicos ao final de cada reparo, com nota de qualidade avaliada por IA.
            {avgScore != null && ` Média no período: ${avgScore.toFixed(1)}/10.`}
            {` ${total} relatório${total === 1 ? "" : "s"} no período selecionado.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar por OS, técnico ou modelo..." className="pl-9" />
            </div>
            <Select value={dateRange} onValueChange={v => setDateRange(v as DateRangeKey)}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map(opt => (
                  <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : reports.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhum relatório encontrado nesse período.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OS</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Nota (IA)</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map(report => (
                    <TableRow key={report.id}>
                      <TableCell className="font-mono">{report.serviceOrderNumber}</TableCell>
                      <TableCell>{report.technicianName || "-"}</TableCell>
                      <TableCell>{format(report.createdAt, "dd/MM/yyyy")}</TableCell>
                      <TableCell>{report.productModel || "-"}</TableCell>
                      <TableCell>
                        {report.aiScore != null ? (
                          <Badge variant="outline" className={scoreBadgeClasses(report.aiScore)}>
                            {report.aiScore.toFixed(1)}/10
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem nota</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleOpenPhotos(report)}>
                          <ImageIcon className="mr-2 h-4 w-4" /> Ver Fotos
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/report-view/${encodeURIComponent(report.serviceOrderNumber)}`} target="_blank">
                            <ExternalLink className="mr-2 h-4 w-4" /> Ver Relatório
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                    Próxima <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!photosDialogReport} onOpenChange={(open) => !open && setPhotosDialogReport(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-6">
              <div>
                <DialogTitle>Fotos do Relatório — OS {photosDialogReport?.serviceOrderNumber}</DialogTitle>
                <DialogDescription>
                  Baixe fotos individuais para anexar em outro relatório ou usar em outra parte do sistema (ex: etiqueta serial).
                </DialogDescription>
              </div>
              <Button size="sm" onClick={handleDownloadAll} disabled={isDownloadingAll || isLoadingPhotos} className="shrink-0">
                {isDownloadingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderDown className="mr-2 h-4 w-4" />}
                {isDownloadingAll ? "Compactando..." : "Baixar Todas (.zip)"}
              </Button>
            </div>
          </DialogHeader>
          {isLoadingPhotos ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
              {photosDialogReport?.photos
                .slice()
                .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)
                .map((photo, idx) => (
                  <div key={photo.path} className="space-y-1.5">
                    <div className="aspect-video rounded-md border bg-muted/30 overflow-hidden">
                      <img src={photo.url} alt={CATEGORY_LABELS[photo.category]} className="w-full h-full object-contain" />
                    </div>
                    <p className="text-xs font-medium text-center">{CATEGORY_LABELS[photo.category]}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => downloadPhoto(photo.url, photoFilename(photosDialogReport, photo.category, photo.url, idx))}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" /> Baixar
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
