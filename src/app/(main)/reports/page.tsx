"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTechnicians, useActiveRoutes, useChecklists } from "@/hooks/queries";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import type { ChecklistTemplate, TechnicalReportPhotoCategory } from "@/lib/data";
import { Camera, Loader2, Plus, Trash2, ExternalLink, Search, ScanLine, ClipboardList } from "lucide-react";

type LocalPhoto = {
  id: string;
  category: TechnicalReportPhotoCategory;
  file?: File;
  previewUrl: string;
  url?: string;
  path?: string;
  order: number;
};

const PRODUCT_SLOTS: { category: TechnicalReportPhotoCategory; label: string }[] = [
  { category: "produto_frontal", label: "Frontal" },
  { category: "produto_traseira", label: "Traseira" },
  { category: "produto_serial", label: "Serial" },
];

const REQUIRED_CATEGORIES: TechnicalReportPhotoCategory[] = [
  "produto_frontal",
  "produto_traseira",
  "produto_serial",
  "defeito",
  "pos_reparo",
];

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const { toast } = useToast();
  const { data: technicians = [] } = useTechnicians();
  const { data: activeRoutes = [] } = useActiveRoutes();
  const { data: checklistTemplates = [] } = useChecklists();
  const searchParams = useSearchParams();

  const [serviceOrderNumber, setServiceOrderNumber] = useState(() => searchParams.get("os") || "");
  const [technicianId, setTechnicianId] = useState("");
  const [consumerName, setConsumerName] = useState("");
  const [productModel, setProductModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [repairDescription, setRepairDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [checklistTemplateId, setChecklistTemplateId] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReadingLabel, setIsReadingLabel] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [hasStoredClientSignature, setHasStoredClientSignature] = useState(false);
  const clientSignatureRef = useRef<InstanceType<typeof SignatureCanvas> | null>(null);

  // Ao digitar/colar a OS, puxa o modelo do produto e o nome do cliente da rota
  // ativa correspondente (mesma convenção usada no autofill do checklist em
  // "Lançar OS"). Só preenche se o campo ainda estiver vazio, para não
  // sobrescrever algo já digitado/carregado.
  useEffect(() => {
    const os = serviceOrderNumber.trim();
    if (!os || (productModel && consumerName)) return;
    for (const route of activeRoutes) {
      const stop = route.stops.find(s => s.serviceOrder === os);
      if (stop) {
        if (stop.model && !productModel) setProductModel(stop.model);
        if (stop.consumerName && !consumerName) setConsumerName(stop.consumerName);
        break;
      }
    }
  }, [serviceOrderNumber, activeRoutes]);

  const resetForm = () => {
    photos.forEach(p => { if (!p.url) URL.revokeObjectURL(p.previewUrl); });
    setServiceOrderNumber("");
    setTechnicianId("");
    setConsumerName("");
    setProductModel("");
    setSerialNumber("");
    setRepairDescription("");
    setObservations("");
    setChecklistTemplateId("");
    setPhotos([]);
    setSavedReportId(null);
    setHasStoredClientSignature(false);
    clientSignatureRef.current?.clear();
  };

  const handleSlotFile = (category: TechnicalReportPhotoCategory, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setPhotos(prev => {
      const existing = prev.find(p => p.category === category);
      if (existing && !existing.url) URL.revokeObjectURL(existing.previewUrl);
      const next = prev.filter(p => p.category !== category);
      return [...next, { id: crypto.randomUUID(), category, file, previewUrl: URL.createObjectURL(file), order: 0 }];
    });

    if (category === "produto_serial") {
      processSerialPhoto(file);
    }
  };

  // Tenta decodificar um código de barras da própria foto da etiqueta (serial exato,
  // sem erro de OCR). Se não achar barcode, retorna null e o fluxo cai no OCR por IA.
  const scanBarcodeFromFile = async (file: File): Promise<string | null> => {
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      // Formatos comuns em etiquetas de serial (Samsung usa 1D — Code128/Code39) + QR.
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];
      const reader = new Html5Qrcode("serial-barcode-reader", { formatsToSupport, verbose: false });
      const decoded = await reader.scanFile(file, false);
      try { await reader.clear(); } catch { /* ignore */ }
      return decoded?.trim() || null;
    } catch {
      // Nenhum código legível na imagem — segue para o OCR.
      return null;
    }
  };

  const processSerialPhoto = async (file: File) => {
    setIsReadingLabel(true);
    const barcode = await scanBarcodeFromFile(file);
    if (barcode) {
      setSerialNumber(barcode);
      setIsReadingLabel(false);
      toast({ title: "Serial lido do código de barras!", description: barcode });
      return;
    }
    setIsReadingLabel(false);
    // Sem barcode legível → cai no OCR por IA (preenche modelo e série).
    await readLabelFromPhoto(file);
  };

  const readLabelFromPhoto = async (file: File) => {
    setIsReadingLabel(true);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1] || "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/reports/read-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mimeType: file.type || "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao ler a etiqueta.");

      if (data.model) setProductModel(data.model);
      if (data.serial) setSerialNumber(data.serial);

      if (data.model || data.serial) {
        toast({ title: "Etiqueta lida!", description: [data.model, data.serial].filter(Boolean).join(" · ") });
      } else {
        toast({ title: "Não consegui identificar modelo/série nessa foto.", description: "Preencha manualmente se necessário." });
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao ler etiqueta", description: e?.message });
    } finally {
      setIsReadingLabel(false);
    }
  };

  const handleMultiFiles = (category: TechnicalReportPhotoCategory, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setPhotos(prev => {
      const currentCount = prev.filter(p => p.category === category).length;
      const added = Array.from(fileList).map((file, i) => ({
        id: crypto.randomUUID(),
        category,
        file,
        previewUrl: URL.createObjectURL(file),
        order: currentCount + i,
      }));
      return [...prev, ...added];
    });
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const target = prev.find(p => p.id === id);
      if (target && !target.url) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleLoadExisting = async () => {
    if (!serviceOrderNumber.trim()) {
      toast({ variant: "destructive", title: "Informe o número da OS para buscar." });
      return;
    }
    setIsLoadingExisting(true);
    try {
      const reports = await technicalReportService.getByServiceOrderNumber(serviceOrderNumber.trim());
      if (reports.length === 0) {
        toast({ title: "Nenhum relatório salvo ainda para essa OS." });
        return;
      }
      const report = reports[0];
      setSavedReportId(report.id);
      setTechnicianId(report.technicianId || "");
      setConsumerName(report.consumerName || "");
      setProductModel(report.productModel || "");
      setSerialNumber(report.serialNumber || "");
      setRepairDescription(report.repairDescription || "");
      setObservations(report.observations || "");
      setChecklistTemplateId(report.checklistTemplateId || "");
      setHasStoredClientSignature(!!report.clientSignature);
      setPhotos(
        (report.photos || []).map(p => ({
          id: crypto.randomUUID(),
          category: p.category,
          previewUrl: p.url,
          url: p.url,
          path: p.path,
          order: p.order,
        }))
      );
      toast({ title: "Relatório carregado.", description: "Você pode editar e salvar novamente." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao buscar relatório", description: e?.message });
    } finally {
      setIsLoadingExisting(false);
    }
  };

  // Roda em segundo plano, sem travar o fluxo do técnico em campo — a nota fica
  // disponível depois, na visualização do relatório e na lista do admin.
  const scoreReportInBackground = (id: string, uploaded: LocalPhoto[]) => {
    fetch("/api/reports/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: uploaded.map(p => ({ category: p.category, url: p.url })) }),
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) return;
        return technicalReportService.update(id, {
          ...(data.score != null ? { aiScore: data.score } : {}),
          ...(data.feedback ? { aiScoreFeedback: data.feedback } : {}),
        });
      })
      .catch(e => console.error("Falha ao pontuar relatório com IA", e));
  };

  const handleSave = async () => {
    if (!serviceOrderNumber.trim()) {
      toast({ variant: "destructive", title: "Informe o número da OS." });
      return;
    }
    if (!repairDescription.trim()) {
      toast({ variant: "destructive", title: "Descreva o que foi feito no reparo ou o que foi observado." });
      return;
    }

    setIsSaving(true);
    try {
      const uploaded = await Promise.all(
        photos.map(async (p) => {
          if (p.url && p.path) return p;
          const { url, path } = await technicalReportService.uploadReportPhoto(p.file!, serviceOrderNumber.trim(), p.category);
          return { ...p, url, path };
        })
      );
      setPhotos(uploaded);

      const technician = technicians.find(t => t.id === technicianId);
      const signatureEmpty = clientSignatureRef.current?.isEmpty() ?? true;
      const clientSignature = signatureEmpty ? undefined : clientSignatureRef.current!.toDataURL("image/png");

      const payload = {
        serviceOrderNumber: serviceOrderNumber.trim(),
        technicianId: technicianId || undefined,
        technicianName: technician?.name,
        consumerName: consumerName || undefined,
        productModel: productModel || undefined,
        serialNumber: serialNumber || undefined,
        photos: uploaded.map(p => ({ category: p.category, url: p.url!, path: p.path!, order: p.order })),
        repairDescription: repairDescription.trim(),
        observations: observations || undefined,
        checklistTemplateId: checklistTemplateId || undefined,
        ...(clientSignature ? { clientSignature } : {}),
      };

      let id = savedReportId;
      if (id) {
        await technicalReportService.update(id, payload);
      } else {
        id = await technicalReportService.create(payload as any);
        setSavedReportId(id);
      }
      if (clientSignature) setHasStoredClientSignature(true);
      toast({ title: "Relatório salvo com sucesso!" });

      if (uploaded.length > 0) {
        scoreReportInBackground(id, uploaded);
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Erro ao salvar relatório", description: e?.message });
    } finally {
      setIsSaving(false);
    }
  };

  const multiPhotos = (category: TechnicalReportPhotoCategory) =>
    photos.filter(p => p.category === category);

  const completedCount = REQUIRED_CATEGORIES.filter(cat => photos.some(p => p.category === cat)).length;

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-4">
      {/* Container oculto usado pela html5-qrcode para decodificar o barcode da foto do serial */}
      <div id="serial-barcode-reader" className="hidden" aria-hidden="true" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Relatório</CardTitle>
          <CardDescription>Preencha ao final do reparo: fotos do produto, do defeito apresentado e do pós-reparo.</CardDescription>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 flex gap-1">
              {REQUIRED_CATEGORIES.map(cat => (
                <div
                  key={cat}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${photos.some(p => p.category === cat) ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-muted-foreground shrink-0">{completedCount}/5 fotos</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nº da OS</Label>
              <div className="flex gap-2">
                <Input value={serviceOrderNumber} onChange={e => setServiceOrderNumber(e.target.value)} placeholder="Ex: OS-001" />
                <Button type="button" variant="outline" size="icon" onClick={handleLoadExisting} disabled={isLoadingExisting} title="Buscar relatório já salvo para essa OS">
                  {isLoadingExisting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Técnico Responsável</Label>
              <Select value={technicianId} onValueChange={setTechnicianId}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Cliente</Label>
              <Input value={consumerName} onChange={e => setConsumerName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo do Produto</Label>
              <Input value={productModel} onChange={e => setProductModel(e.target.value)} placeholder="Ex: Samsung QN55..." />
            </div>
            <div className="space-y-1.5">
              <Label>Número de Série</Label>
              <Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="Lido do código de barras ou detectado pela foto" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              Fotos do Produto
              {isReadingLabel && <span className="inline-flex items-center gap-1 text-primary normal-case font-normal"><Loader2 className="h-3 w-3 animate-spin" /> lendo etiqueta...</span>}
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PRODUCT_SLOTS.map(slot => {
                const photo = photos.find(p => p.category === slot.category);
                const isSerialSlot = slot.category === "produto_serial";
                return (
                  <div key={slot.category} className="space-y-1.5">
                    <label className="block aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden relative cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleSlotFile(slot.category, e.target.files)}
                      />
                      {photo ? (
                        <img src={photo.previewUrl} alt={slot.label} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
                          {isSerialSlot ? <ScanLine className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                        </div>
                      )}
                      {isSerialSlot && isReadingLabel && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="h-6 w-6 text-white animate-spin" />
                        </div>
                      )}
                    </label>
                    <p className="text-xs text-center font-medium">{slot.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <PhotoCategorySection
            title="Defeito Apresentado"
            category="defeito"
            photos={multiPhotos("defeito")}
            onAdd={handleMultiFiles}
            onRemove={removePhoto}
          />

          <PhotoCategorySection
            title="Pós-Reparo"
            category="pos_reparo"
            photos={multiPhotos("pos_reparo")}
            onAdd={handleMultiFiles}
            onRemove={removePhoto}
          />

          <div className="space-y-1.5">
            <Label>Descrição do Reparo *</Label>
            <Textarea
              value={repairDescription}
              onChange={e => setRepairDescription(e.target.value)}
              rows={4}
              placeholder="Descreva o que foi feito no reparo (diagnóstico, peças trocadas, procedimento) ou o que foi observado no atendimento."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={4} placeholder="Recomendações, orientações ao cliente, etc." />
          </div>

          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pt-2">
              <ClipboardList className="h-3.5 w-3.5" /> Checklist (Opcional)
            </Label>
            <p className="text-xs text-muted-foreground">
              Selecione um modelo para anexar preenchido ao final do PDF do relatório (Serial, Modelo, Cliente e Observações já vêm prontos).
            </p>
            <Select value={checklistTemplateId} onValueChange={v => setChecklistTemplateId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {Object.entries(
                  checklistTemplates.reduce<Record<string, ChecklistTemplate[]>>((acc, t) => {
                    const key = t.category?.trim() || "Outros";
                    (acc[key] ||= []).push(t);
                    return acc;
                  }, {})
                )
                  .sort(([a], [b]) => (a === "Outros" ? 1 : b === "Outros" ? -1 : a.localeCompare(b)))
                  .map(([category, group]) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{category}</SelectLabel>
                      {group.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assinatura do Cliente (Opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Se um checklist foi selecionado acima, essa assinatura preenche o campo de assinatura dele no PDF.
            </p>
            <div className="border rounded-md overflow-hidden bg-white shadow-sm border-gray-300">
              <SignatureCanvas
                ref={clientSignatureRef}
                penColor="black"
                canvasProps={{ className: "signature-canvas w-full h-40" }}
                onEnd={() => setHasStoredClientSignature(false)}
              />
              <div className="bg-muted p-1 flex justify-between items-center border-t">
                {hasStoredClientSignature && <span className="text-xs text-muted-foreground pl-2">Assinatura já salva anteriormente</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => { clientSignatureRef.current?.clear(); setHasStoredClientSignature(false); }}
                >
                  Limpar Assinatura
                </Button>
              </div>
            </div>
          </div>
        </CardContent>

        {/* Reserva no fluxo normal a mesma altura do footer fixo abaixo, para o conteúdo não ficar coberto por ele no mobile. */}
        <div aria-hidden="true" className="invisible sm:hidden flex flex-col gap-2 p-4">
          <div className="h-10 w-full" />
          {savedReportId && <div className="h-10 w-full" />}
          <div className="h-10 w-full" />
        </div>

        <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between fixed sm:static bottom-0 left-0 right-0 z-20 bg-card border-t sm:border-t-0 p-4 sm:p-6 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none">
          <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>Novo Relatório</Button>
          <div className="flex gap-2">
            {savedReportId && (
              <Button type="button" variant="secondary" asChild>
                <Link href={`/report-view/${encodeURIComponent(serviceOrderNumber.trim())}`} target="_blank">
                  <ExternalLink className="mr-2 h-4 w-4" /> Ver/Exportar Relatório
                </Link>
              </Button>
            )}
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isSaving ? "Salvando..." : "Salvar Relatório"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function PhotoCategorySection({
  title,
  category,
  photos,
  onAdd,
  onRemove,
}: {
  title: string;
  category: TechnicalReportPhotoCategory;
  photos: LocalPhoto[];
  onAdd: (category: TechnicalReportPhotoCategory, files: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map(photo => (
          <div key={photo.id} className="relative aspect-video rounded-lg overflow-hidden border bg-muted/30">
            <img src={photo.previewUrl} alt={title} className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => onRemove(photo.id)}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30 text-muted-foreground">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => { onAdd(category, e.target.files); e.target.value = ""; }}
          />
          <Plus className="h-5 w-5" />
        </label>
      </div>
    </div>
  );
}
