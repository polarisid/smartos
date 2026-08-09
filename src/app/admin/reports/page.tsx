"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Camera, Loader2, Search, ExternalLink, ImageIcon, Download, FolderDown } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [photosDialogReport, setPhotosDialogReport] = useState<TechnicalReport | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const handleDownloadAll = async () => {
    if (!photosDialogReport) return;
    setIsDownloadingAll(true);
    try {
      await downloadAllPhotos(photosDialogReport);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  useEffect(() => {
    technicalReportService.getAll()
      .then(setReports)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter(r =>
      r.serviceOrderNumber.toLowerCase().includes(q) ||
      (r.technicianName || "").toLowerCase().includes(q) ||
      (r.productModel || "").toLowerCase().includes(q)
    );
  }, [reports, search]);

  const avgScore = useMemo(() => {
    const scored = reports.filter(r => r.aiScore != null);
    if (scored.length === 0) return null;
    return scored.reduce((sum, r) => sum + (r.aiScore || 0), 0) / scored.length;
  }, [reports]);

  return (
    <div className="p-4 md:p-8 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Relatórios Fotográficos</CardTitle>
          <CardDescription>
            Relatórios enviados pelos técnicos ao final de cada reparo, com nota de qualidade avaliada por IA.
            {avgScore != null && ` Média geral: ${avgScore.toFixed(1)}/10.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por OS, técnico ou modelo..." className="pl-9" />
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Nenhum relatório encontrado.</p>
          ) : (
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
                {filtered.map(report => (
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
                      <Button variant="outline" size="sm" onClick={() => setPhotosDialogReport(report)}>
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
              <Button size="sm" onClick={handleDownloadAll} disabled={isDownloadingAll} className="shrink-0">
                {isDownloadingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderDown className="mr-2 h-4 w-4" />}
                {isDownloadingAll ? "Compactando..." : "Baixar Todas (.zip)"}
              </Button>
            </div>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
