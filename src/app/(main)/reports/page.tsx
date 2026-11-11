"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTechnicians, useActiveRoutes, useChecklists, useCodes, useProductPhotoConfig } from "@/hooks/queries";
import {
  DEFAULT_PRODUCT_PHOTO_CONFIG,
  DEFAULT_PRODUCT_SLOTS,
  PRODUCT_LINE_LABELS,
  isProductPhotoCategory,
  productLineFromModel,
  productPhotoLabel,
  type ProductPhotoSlot,
} from "@/lib/productLine";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { useAuth } from "@/context/AuthContext";
import { technicalReportService } from "@/services/supabase/technicalReportService";
import type { ChecklistTemplate, TechnicalReport, TechnicalReportPhotoCategory, TechnicalReportType } from "@/lib/data";
import { buildAndDownloadPdf } from "@/lib/technicalReportPdf";
import { compressImageIfNeeded } from "@/lib/imageCompression";
import { queueReport, flushQueue, type PendingReportPhoto } from "@/lib/offlineReportQueue";
import { isNetworkLikeError } from "@/lib/reportUploader";
import { Camera, Loader2, Plus, Trash2, Download, Search, ScanLine, ClipboardList, Wrench, ClipboardCheck, RefreshCw, FileText } from "lucide-react";
import { isPdfAttachment, attachmentDisplayName, isRmaCategory, MAX_PDF_ATTACHMENT_BYTES, RMA_CATEGORIES, RMA_CATEGORY_LABELS } from "@/lib/reportAttachments";

type LocalPhoto = {
  id: string;
  category: TechnicalReportPhotoCategory;
  /** Nome da foto do produto na configuração (ex.: "Foto do cabo"). */
  label?: string;
  file?: File;
  previewUrl: string;
  url?: string;
  path?: string;
  order: number;
};

// Fotos obrigatórias: as do produto marcadas como obrigatórias na configuração da linha + defeito (+ pós-reparo no reparo).
// Numa visita (sem reparo concluído), não faz sentido cobrar foto do pós-reparo nem descrição do que foi feito.
function requiredCategoriesFor(reportType: TechnicalReportType, productSlots: ProductPhotoSlot[]): TechnicalReportPhotoCategory[] {
  // Troca RMA: só as duas categorias (produto novo e produto antigo); cada uma aceita foto ou PDF.
  if (reportType === "rma") return [...RMA_CATEGORIES];
  return [
    ...productSlots.filter(slot => slot.required).map(slot => slot.key),
    "defeito",
    ...(reportType === "visita" ? [] : ["pos_reparo"]),
  ];
}

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
  const { data: codes } = useCodes();
  const searchParams = useSearchParams();

  const [serviceOrderNumber, setServiceOrderNumber] = useState(() => searchParams.get("os") || "");
  const [reportType, setReportType] = useState<TechnicalReportType>("reparo");
  const [technicianId, setTechnicianId] = useState("");
  const [consumerName, setConsumerName] = useState("");
  const [productModel, setProductModel] = useState("");
  // A linha do produto (máquina de lavar, TV...) vem da 1ª letra do modelo e define quais fotos do produto são pedidas.
  const { data: photoConfig = DEFAULT_PRODUCT_PHOTO_CONFIG, isError: photoConfigError } = useProductPhotoConfig();
  const productLine = productLineFromModel(productModel);
  const configuredSlots = productLine ? photoConfig[productLine] : DEFAULT_PRODUCT_SLOTS;
  const [serialNumber, setSerialNumber] = useState("");
  const [repairDescription, setRepairDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [checklistTemplateId, setChecklistTemplateId] = useState("");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  // Fotos já tiradas que não fazem parte da linha atual (o modelo mudou, ou é um relatório antigo) continuam na tela: nada se perde.
  const productSlots = useMemo<ProductPhotoSlot[]>(() => {
    const known = new Set(configuredSlots.map(slot => slot.key));
    const extra: ProductPhotoSlot[] = [];
    photos.forEach(p => {
      if (isProductPhotoCategory(p.category) && !known.has(p.category) && !extra.some(e => e.key === p.category)) {
        extra.push({ key: p.category, label: productPhotoLabel(p.category, p.label), required: false });
      }
    });
    return [...configuredSlots, ...extra];
  }, [configuredSlots, photos]);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [savedReportCreatedAt, setSavedReportCreatedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [preparingCount, setPreparingCount] = useState(0);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isReadingLabel, setIsReadingLabel] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [storedClientSignature, setStoredClientSignature] = useState<string | null>(null);
  const clientSignatureRef = useRef<InstanceType<typeof SignatureCanvas> | null>(null);

  // O técnico logado já vem selecionado em "Técnico Responsável" (o id do técnico
  // é o mesmo do login) - antes começava vazio e o relatório ficava sem técnico
  // se ele esquecesse de escolher. Continua dando pra trocar (ex.: parceiro de rota).
  const { appUser, activeUnidadeId } = useAuth();
  useEffect(() => {
    if (technicianId || !appUser) return;
    if (technicians.some(t => t.id === appUser.uid)) setTechnicianId(appUser.uid);
  }, [technicianId, appUser, technicians]);

  // Ao informar a OS, se o técnico já a lançou em "Lançar OS": preenche a
  // Descrição do Reparo com o código de reparo lançado (com a descrição do código)
  // e as Observações com as que ele escreveu. Só preenche campo vazio - nunca
  // sobrescreve o que ele já digitou - e uma vez por número de OS.
  const autofilledOs = useRef("");
  // Valores atuais dos campos, lidos dentro do timer (que fecha sobre o render antigo).
  const currentFields = useRef({ repairDescription: "", observations: "" });
  currentFields.current = { repairDescription, observations };
  useEffect(() => {
    const os = serviceOrderNumber.trim();
    if (os.length < 6 || autofilledOs.current === os) return;
    const timer = setTimeout(async () => {
      try {
        const orders = await serviceOrderService.getByNumbers([os]);
        if (orders.length === 0) return;
        // OS pode ter várias visitas e ser de mais de um técnico: prefere a lançada
        // por quem está logado; entre elas, a mais recente.
        const mine = orders.filter(o => o.technicianId === appUser?.uid);
        const latest = [...(mine.length > 0 ? mine : orders)].sort((a, b) => b.date.getTime() - a.date.getTime())[0];

        let repairText = "";
        if (latest.repairCode) {
          const known = codes?.repairCodes?.[latest.equipmentType]?.find(c => c.code === latest.repairCode);
          repairText = known?.description ? `${latest.repairCode} - ${known.description}` : latest.repairCode;
        }
        // Remove a etiqueta que o sistema anexa às observações da OS (pesquisa LP).
        const obsText = (latest.observations || "").replace(/\n?\[Pesquisa LP realizada:[^\]]*\]/g, "").trim();

        autofilledOs.current = os;
        const fillRepair = !!repairText && !currentFields.current.repairDescription.trim();
        const fillObs = !!obsText && !currentFields.current.observations.trim();
        if (fillRepair) setRepairDescription(repairText);
        if (fillObs) setObservations(obsText);
        if (fillRepair || fillObs) {
          toast({ title: "Preenchido com os dados da OS lançada", description: "Confira e ajuste se precisar." });
        }
      } catch (e) {
        console.warn("Não foi possível buscar a OS lançada para preencher o relatório", e);
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOrderNumber, codes]);

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
    autofilledOs.current = "";
    photos.forEach(p => { if (!p.url) URL.revokeObjectURL(p.previewUrl); });
    setServiceOrderNumber("");
    setReportType("reparo");
    setTechnicianId("");
    setConsumerName("");
    setProductModel("");
    setSerialNumber("");
    setRepairDescription("");
    setObservations("");
    setChecklistTemplateId("");
    setPhotos([]);
    setSavedReportId(null);
    setSavedReportCreatedAt(null);
    setStoredClientSignature(null);
    clientSignatureRef.current?.clear();
  };

  // Fotos de celular às vezes passam de 10MB - comprime (mantendo a
  // resolução, só reduzindo a qualidade JPEG) antes de guardar no formulário,
  // pra não travar o upload em campo com internet ruim.
  // Agora TODA foto é otimizada (≤2048px, ~1,5MB) ao ser escolhida - o que mais
  // pesava no envio era subir fotos de 3-10MB cada. Fica sem aviso por foto (eram
  // dezenas de toasts); o formulário só mostra "Otimizando fotos..." enquanto roda.
  const compressPhoto = async (file: File): Promise<File | null> => {
    setPreparingCount(c => c + 1);
    try {
      const result = await compressImageIfNeeded(file);
      if (result.unreadable) {
        toast({
          variant: "destructive",
          title: "Não foi possível ler esta foto",
          description: "Ela não foi adicionada ao relatório. Tire a foto de novo (se o celular estiver em HEIC/HEIF, mude a câmera para JPG).",
        });
        return null;
      }
      return result.file;
    } finally {
      setPreparingCount(c => c - 1);
    }
  };

  const handleSlotFile = async (category: TechnicalReportPhotoCategory, fileList: FileList | null) => {
    const rawFile = fileList?.[0];
    if (!rawFile) return;
    const file = await compressPhoto(rawFile);
    if (!file) return;
    setPhotos(prev => {
      const existing = prev.find(p => p.category === category);
      if (existing && !existing.url) URL.revokeObjectURL(existing.previewUrl);
      const next = prev.filter(p => p.category !== category);
      const slotIndex = productSlots.findIndex(slot => slot.key === category);
      const label = slotIndex >= 0 ? productSlots[slotIndex].label : undefined;
      return [...next, { id: crypto.randomUUID(), category, ...(label ? { label } : {}), file, previewUrl: URL.createObjectURL(file), order: Math.max(slotIndex, 0) }];
    });

    if (category === "produto_serial") {
      // Código de barras lido da foto ORIGINAL (mais nítida pra decodificar);
      // o OCR por IA recebe a versão otimizada (menor, sobe mais rápido).
      processSerialPhoto(rawFile, file);
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

  const processSerialPhoto = async (rawFile: File, file: File) => {
    setIsReadingLabel(true);
    const barcode = await scanBarcodeFromFile(rawFile);
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
      // Falha de rede aqui é só a leitura automática (conveniência) não ter
      // rolado - o relatório em si nem chegou a ser enviado ainda. Não faz
      // sentido assustar o técnico com "Failed to fetch": mesmo tratamento
      // gentil de quando a IA não identifica nada, ele preenche na mão.
      if (isNetworkError(e)) {
        toast({ title: "Sem conexão para ler a etiqueta agora", description: "Preencha modelo e série manualmente." });
      } else {
        toast({ variant: "destructive", title: "Erro ao ler etiqueta", description: e?.message });
      }
    } finally {
      setIsReadingLabel(false);
    }
  };

  const handleMultiFiles = async (category: TechnicalReportPhotoCategory, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    const pdfs = picked.filter(f => isPdfAttachment({ file: f }));
    const bigPdfs = pdfs.filter(f => f.size > MAX_PDF_ATTACHMENT_BYTES);
    if (bigPdfs.length > 0) {
      toast({ variant: "destructive", title: "PDF muito grande", description: `${bigPdfs.map(f => f.name).join(", ")} passa de ${Math.round(MAX_PDF_ATTACHMENT_BYTES / 1024 / 1024)} MB e não foi adicionado.` });
    }
    const images = (await Promise.all(picked.filter(f => !isPdfAttachment({ file: f })).map(f => compressPhoto(f)))).filter((f): f is File => !!f);
    const files = [...images, ...pdfs.filter(f => f.size <= MAX_PDF_ATTACHMENT_BYTES)];
    if (files.length === 0) return;
    setPhotos(prev => {
      const currentCount = prev.filter(p => p.category === category).length;
      const added = files.map((file, i) => ({
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
      setReportType(report.reportType || "reparo");
      setSavedReportCreatedAt(report.createdAt);
      setTechnicianId(report.technicianId || "");
      setConsumerName(report.consumerName || "");
      setProductModel(report.productModel || "");
      setSerialNumber(report.serialNumber || "");
      setRepairDescription(report.repairDescription || "");
      setObservations(report.observations || "");
      setChecklistTemplateId(report.checklistTemplateId || "");
      setStoredClientSignature(report.clientSignature || null);
      setPhotos(
        (report.photos || []).map(p => ({
          id: crypto.randomUUID(),
          category: p.category,
          label: p.label,
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

  // Falha de rede de verdade (sem sinal/travado) x erro de validação/permissão -
  // só a primeira vira "guarda no aparelho e sincroniza depois".
  const isNetworkError = (e: any): boolean => isNetworkLikeError(e);

  // As fotos já têm cópia local (blob): o PDF usa essa cópia em vez de baixar de
  // novo do servidor as fotos que acabaram de subir - era a maior parte da demora
  // pra gerar/baixar o PDF.
  const localPhotoUrls = (list: LocalPhoto[]): Record<string, string> =>
    Object.fromEntries(list.filter(p => p.path && p.previewUrl).map(p => [p.path as string, p.previewUrl]));

  // Salvar = (1) guarda o relatório completo no aparelho, (2) baixa o PDF na hora
  // com as fotos locais (sem rede, instantâneo) e (3) libera o técnico: o envio
  // pro servidor roda em segundo plano (fila + aviso de andamento no topo), então
  // ele não fica esperando upload nem perde nada se o sinal cair no meio.
  // Caminho provisório (antes de subir) de um item: PDFs levam ".pdf" para o PDF do relatório reconhecê-los.
  const localPathOf = (p: LocalPhoto) => p.path || `local-${p.id}${isPdfAttachment({ file: p.file }) ? ".pdf" : ""}`;

  const handleSave = async () => {
    if (isSaving) return;
    // Ao trocar o tipo do relatório, o que foi anexado para outro tipo não vai junto (RMA tem categorias próprias).
    const savePhotos = photos.filter(p => reportType === "rma" ? isRmaCategory(p.category) : !isRmaCategory(p.category));
    if (preparingCount > 0) {
      toast({ title: "Aguarde...", description: "Ainda otimizando as fotos." });
      return;
    }
    if (!serviceOrderNumber.trim()) {
      toast({ variant: "destructive", title: "Informe o número da OS." });
      return;
    }
    // Checklist obrigatório. Só deixa passar quando não há nenhum modelo cadastrado (senão ninguém conseguiria salvar).
    if (!checklistTemplateId && checklistTemplates.length > 0) {
      toast({ variant: "destructive", title: "Selecione o checklist.", description: "O checklist é obrigatório no relatório." });
      return;
    }
    if (reportType === "reparo" && !repairDescription.trim()) {
      toast({ variant: "destructive", title: "Descreva o que foi feito no reparo ou o que foi observado." });
      return;
    }

    // Sem as fotos obrigatórias não dá para dar baixa na OS: confirma antes de seguir (continua possível, ex.: foto impossível de tirar).
    const missingRequired = requiredCategories.filter(cat => !savePhotos.some(p => p.category === cat));
    if (missingRequired.length > 0) {
      const labelOf = (cat: string) => isRmaCategory(cat) ? RMA_CATEGORY_LABELS[cat] : cat === "defeito" ? "Defeito apresentado" : cat === "pos_reparo" ? "Pós-reparo" : (productSlots.find(s => s.key === cat)?.label || productPhotoLabel(cat));
      const proceed = window.confirm(`Faltam ${missingRequired.length} foto(s) obrigatória(s): ${missingRequired.map(labelOf).join(", ")}.\n\nSem elas não dá para dar baixa nesta OS. Salvar mesmo assim?`);
      if (!proceed) return;
    }

    const technician = technicians.find(t => t.id === technicianId);
    const signatureEmpty = clientSignatureRef.current?.isEmpty() ?? true;
    const drawnSignature = signatureEmpty ? undefined : clientSignatureRef.current!.toDataURL("image/png");
    const clientSignature = drawnSignature || storedClientSignature || undefined;

    const basePayload = {
      serviceOrderNumber: serviceOrderNumber.trim(),
      reportType,
      technicianId: technicianId || undefined,
      technicianName: technician?.name,
      consumerName: consumerName || undefined,
      productModel: productModel || undefined,
      serialNumber: serialNumber || undefined,
      repairDescription: reportType === "visita" ? undefined : repairDescription.trim(),
      observations: observations || undefined,
      checklistTemplateId: checklistTemplateId || undefined,
      ...(clientSignature ? { clientSignature } : {}),
    };

    setIsSaving(true);
    try {
      const pendingPhotos: PendingReportPhoto[] = savePhotos.map(p =>
        p.url && p.path
          ? { category: p.category, label: p.label, order: p.order, url: p.url, path: p.path }
          : { category: p.category, label: p.label, order: p.order, file: p.file! }
      );
      // Primeiro garante que nada se perde: fica gravado no aparelho até o servidor confirmar.
      // Se o aparelho não conseguir guardar (ex.: falha do banco local no Android), com internet
      // envia direto - o técnico não perde o relatório por causa disso.
      // Salvar nunca falha por causa do aparelho: se não der pra gravar no banco local, o relatório
      // fica na memória desta aba e o envio em segundo plano segue igual (aviso abaixo).
      const queued = await queueReport({ ...basePayload, ...(appUser?.role === "master" && activeUnidadeId ? { unidadeId: activeUnidadeId } : {}) }, pendingPhotos, savedReportId || undefined);
      const memoryOnly = queued.where === "memory";

      // PDF na hora, com as fotos locais (blob) - não depende de rede.
      const localReport: TechnicalReport = {
        id: savedReportId || "pendente",
        createdAt: savedReportCreatedAt || new Date(),
        updatedAt: new Date(),
        ...basePayload,
        photos: savePhotos.map(p => ({ category: p.category, ...(p.label ? { label: p.label } : {}), order: p.order, url: p.url || p.previewUrl, path: localPathOf(p) })),
      };
      let pdfFailed = false;
      let photosMissingInPdf = 0;
      setIsDownloadingPdf(true);
      try {
        const built = await buildAndDownloadPdf(localReport, {
          localPhotoUrls: Object.fromEntries(savePhotos.map(p => [localPathOf(p), p.previewUrl])),
        });
        photosMissingInPdf = built.failedPhotos;
      } catch (pdfError) {
        console.error("Falha ao gerar PDF", pdfError);
        pdfFailed = true;
      } finally {
        setIsDownloadingPdf(false);
      }

      // Libera o formulário e manda pro servidor em segundo plano.
      resetForm();
      void flushQueue();
      if (photosMissingInPdf > 0) {
        toast({
          variant: "destructive",
          title: `${photosMissingInPdf} foto(s) ficaram de fora do PDF`,
          description: "O PDF baixado está incompleto. As fotos seguem para o sistema; gere o PDF de novo depois em Meus Relatórios.",
        });
      }
      toast({
        title: pdfFailed ? "Relatório guardado (PDF não gerado)" : "Relatório salvo e PDF baixado",
        description: memoryOnly
          ? "ATENÇÃO: este aparelho não deixou guardar o relatório com segurança. Ele está só na memória desta aba: NÃO feche nem atualize a página até o aviso do topo dizer que foi enviado."
          : pdfFailed
            ? "O envio segue em segundo plano - o PDF pode ser baixado depois em Meus Relatórios."
            : "O envio segue em segundo plano - acompanhe no aviso no topo da tela. Depois ele aparece em Meus Relatórios.",
      });
    } catch (e: any) {
      console.error("Falha ao guardar o relatório", e);
      toast({ variant: "destructive", title: "Não foi possível guardar o relatório", description: e?.message || "Tente de novo. Se persistir, libere espaço no aparelho." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!savedReportId) return;
    setIsDownloadingPdf(true);
    try {
      const technician = technicians.find(t => t.id === technicianId);
      const report: TechnicalReport = {
        id: savedReportId,
        createdAt: savedReportCreatedAt || new Date(),
        updatedAt: new Date(),
        serviceOrderNumber: serviceOrderNumber.trim(),
        reportType,
        technicianId: technicianId || undefined,
        technicianName: technician?.name,
        consumerName: consumerName || undefined,
        productModel: productModel || undefined,
        serialNumber: serialNumber || undefined,
        photos: photos.filter(p => p.url && p.path).map(p => ({ category: p.category, url: p.url!, path: p.path!, order: p.order })),
        repairDescription: reportType === "visita" ? undefined : repairDescription.trim(),
        observations: observations || undefined,
        checklistTemplateId: checklistTemplateId || undefined,
        clientSignature: storedClientSignature || undefined,
      };
      const built = await buildAndDownloadPdf(report, { localPhotoUrls: localPhotoUrls(photos) });
      if (built.failedPhotos > 0) {
        toast({ variant: "destructive", title: `${built.failedPhotos} foto(s) ficaram de fora do PDF`, description: "O PDF baixado está incompleto. Confira a conexão e gere de novo." });
      }
    } catch (e) {
      console.error("Falha ao gerar PDF", e);
      toast({ variant: "destructive", title: "Erro ao gerar PDF" });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const multiPhotos = (category: TechnicalReportPhotoCategory) =>
    photos.filter(p => p.category === category);

  const requiredCategories = requiredCategoriesFor(reportType, productSlots);
  const completedCount = requiredCategories.filter(cat => photos.some(p => p.category === cat)).length;

  return (
    <div className="-mx-2 max-w-3xl space-y-3 p-0 md:mx-auto md:p-8 md:space-y-4">
      {/* Container oculto usado pela html5-qrcode para decodificar o barcode da foto do serial */}
      <div id="serial-barcode-reader" className="hidden" aria-hidden="true" />
      <Card className="rounded-none border-0 bg-transparent shadow-none md:rounded-xl md:border md:bg-card/70 md:shadow-sm">
        <CardHeader className="space-y-1 px-1 py-3 md:space-y-1.5 md:p-6">
          <CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Relatório</CardTitle>
          <CardDescription>
            {reportType === "visita"
              ? "Preencha os dados da visita: fotos do produto e do defeito apresentado."
              : reportType === "rma"
                ? "Troca RMA: fotos (ou PDF) do produto novo e do produto antigo."
                : "Preencha ao final do reparo: fotos do produto, do defeito apresentado e do pós-reparo."}
          </CardDescription>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 flex gap-1">
              {requiredCategories.map(cat => (
                <div
                  key={cat}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${photos.some(p => p.category === cat) ? "bg-primary" : "bg-muted"}`}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-muted-foreground shrink-0">{completedCount}/{requiredCategories.length} fotos</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-1 pb-3 pt-0 md:space-y-6 md:p-6 md:pt-0 [&_input]:h-10 [&_button[role=combobox]]:h-10 md:[&_input]:h-10 md:[&_button[role=combobox]]:h-10">
          <div className="space-y-1.5">
            <Label>Tipo de Relatório</Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReportType("reparo")}
                className={`flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors ${reportType === "reparo" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted/50"}`}
              >
                <Wrench className="h-4 w-4" /> Reparo
              </button>
              <button
                type="button"
                onClick={() => setReportType("visita")}
                className={`flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors ${reportType === "visita" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted/50"}`}
              >
                <ClipboardCheck className="h-4 w-4" /> Visita
              </button>
              <button
                type="button"
                onClick={() => setReportType("rma")}
                className={`flex items-center justify-center gap-2 rounded-md border py-2 text-sm font-medium transition-colors ${reportType === "rma" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted/50"}`}
              >
                <RefreshCw className="h-4 w-4" /> Troca RMA
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-1.5">
              <Label>Nº da OS</Label>
              <div className="flex gap-2">
                <Input value={serviceOrderNumber} onChange={e => setServiceOrderNumber(e.target.value.replace(/\s/g, ""))} onKeyDown={e => { if (e.key === " ") e.preventDefault(); }} placeholder="Ex: OS-001" />
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
              {productLine && <p className="text-xs text-muted-foreground">Linha: <span className="font-semibold text-foreground">{PRODUCT_LINE_LABELS[productLine]}</span></p>}
            </div>
            <div className="space-y-1.5">
              <Label>Número de Série</Label>
              <Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="Lido do código de barras ou detectado pela foto" />
            </div>
          </div>

          <div className={productSlots.length === 0 || reportType === "rma" ? "hidden" : "space-y-2"}>
            <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              Fotos do Produto
              {isReadingLabel && <span className="inline-flex items-center gap-1 text-primary normal-case font-normal"><Loader2 className="h-3 w-3 animate-spin" /> lendo etiqueta...</span>}
            </Label>
            {/* De onde veio a lista de fotos: ajuda a achar o motivo quando ela não é a configurada no admin. */}
            <p className="text-[11px] leading-tight text-muted-foreground">
              {photoConfigError
                ? "Não foi possível ler a configuração de fotos agora (usando a última guardada ou a padrão)."
                : configuredSlots === DEFAULT_PRODUCT_SLOTS
                  ? "Lista padrão: não há fotos configuradas para esta linha nesta unidade."
                  : `Lista configurada para ${productLine ? PRODUCT_LINE_LABELS[productLine] : "esta linha"}.`}
            </p>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {productSlots.map(slot => {
                const photo = photos.find(p => p.category === slot.key);
                const isSerialSlot = slot.key === "produto_serial";
                return (
                  <div key={slot.key} className="space-y-1.5">
                    <label className="block aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 overflow-hidden relative cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => handleSlotFile(slot.key, e.target.files)}
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
                    <p className="text-[11px] md:text-xs text-center font-medium leading-tight">{slot.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {reportType === "rma" && RMA_CATEGORIES.map(cat => (
            <PhotoCategorySection
              key={cat}
              title={RMA_CATEGORY_LABELS[cat]}
              category={cat}
              photos={multiPhotos(cat)}
              onAdd={handleMultiFiles}
              onRemove={removePhoto}
              allowPdf
            />
          ))}

          {reportType !== "rma" && (
            <PhotoCategorySection
              title="Defeito Apresentado"
              category="defeito"
              photos={multiPhotos("defeito")}
              onAdd={handleMultiFiles}
              onRemove={removePhoto}
            />
          )}

          {reportType === "reparo" && (
            <PhotoCategorySection
              title="Pós-Reparo"
              category="pos_reparo"
              photos={multiPhotos("pos_reparo")}
              onAdd={handleMultiFiles}
              onRemove={removePhoto}
            />
          )}

          {reportType === "reparo" && (
            <div className="space-y-1.5">
              <Label>Descrição do Reparo *</Label>
              <Textarea
                value={repairDescription}
                onChange={e => setRepairDescription(e.target.value)}
                rows={3}
                placeholder="Descreva o que foi feito no reparo (diagnóstico, peças trocadas, procedimento) ou o que foi observado no atendimento."
              />
            </div>
          )}

          {reportType === "rma" && (
            <div className="space-y-1.5">
              <Label>Descrição da Troca (opcional)</Label>
              <Textarea
                value={repairDescription}
                onChange={e => setRepairDescription(e.target.value)}
                rows={3}
                placeholder="Motivo da troca, o que foi substituído, protocolo do RMA..."
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3} placeholder="Recomendações, orientações ao cliente, etc." />
          </div>

          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 pt-2">
              <ClipboardList className="h-3.5 w-3.5" /> Checklist <span className="text-destructive">*</span> <span className="font-normal normal-case tracking-normal">(obrigatório)</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Selecione o modelo que será anexado preenchido ao final do PDF do relatório (Serial, Modelo, Cliente e Observações já vêm prontos).
            </p>
            <Select value={checklistTemplateId} onValueChange={v => setChecklistTemplateId(v)}>
              <SelectTrigger className={!checklistTemplateId && checklistTemplates.length > 0 ? "border-destructive/60" : undefined}><SelectValue placeholder="Selecione o checklist" /></SelectTrigger>
              <SelectContent>
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
              Essa assinatura preenche o campo de assinatura do checklist no PDF.
            </p>
            <div className="border rounded-md overflow-hidden bg-white shadow-sm border-gray-300">
              <SignaturePad
                ref={clientSignatureRef}
                penColor="black"
                onEnd={() => setStoredClientSignature(null)}
              />
              <div className="bg-muted p-1 flex justify-between items-center border-t">
                {storedClientSignature && <span className="text-xs text-muted-foreground pl-2">Assinatura já salva anteriormente</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => { clientSignatureRef.current?.clear(); setStoredClientSignature(null); }}
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
              <Button type="button" variant="secondary" onClick={handleDownloadPdf} disabled={isSaving || isDownloadingPdf}>
                {isDownloadingPdf ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Baixar PDF
              </Button>
            )}
            <Button type="button" onClick={handleSave} disabled={isSaving || preparingCount > 0}>
              {isSaving || preparingCount > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {preparingCount > 0
                ? "Otimizando fotos..."
                : isSaving
                  ? "Gerando PDF..."
                  : savedReportId ? "Atualizar Relatório" : "Salvar Relatório"}
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
  allowPdf = false,
}: {
  title: string;
  category: TechnicalReportPhotoCategory;
  photos: LocalPhoto[];
  onAdd: (category: TechnicalReportPhotoCategory, files: FileList | null) => void;
  onRemove: (id: string) => void;
  /** Também aceita PDF (troca RMA). */
  allowPdf?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</Label>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {photos.map(photo => (
          <div key={photo.id} className="relative aspect-video rounded-lg overflow-hidden border bg-muted/30">
            {isPdfAttachment({ path: photo.path, url: photo.url, file: photo.file }) ? (
              <a href={photo.previewUrl} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground hover:text-foreground" title="Abrir o PDF">
                <FileText className="h-7 w-7" />
                <span className="line-clamp-2 break-all text-center text-[10px] leading-tight">{attachmentDisplayName({ path: photo.path, url: photo.url, file: photo.file })}</span>
              </a>
            ) : (
              <img src={photo.previewUrl} alt={title} className="w-full h-full object-contain" />
            )}
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
        {allowPdf && (
          <label className="aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:border-primary/50 transition-colors bg-muted/30 text-muted-foreground">
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={e => { onAdd(category, e.target.files); e.target.value = ""; }}
            />
            <FileText className="h-5 w-5" />
            <span className="text-[10px] font-medium">Adicionar PDF</span>
          </label>
        )}
      </div>
    </div>
  );
}
