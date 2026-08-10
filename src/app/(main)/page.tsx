
"use client";

import { useState, useEffect, useMemo, Suspense, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isAfter, startOfMonth, startOfYear, subDays, differenceInDays } from "date-fns";
import { type Technician, type ServiceOrder, type Preset, type Return, type Indicator, type Route, type RouteStop, type Chargeback, type RoutePart, type ChecklistTemplate, type ChecklistField } from "@/lib/data";
import { copyToClipboard } from "@/lib/clipboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, CheckCircle, ChevronsUpDown, Copy, Wrench, LogIn, ListTree, ClipboardCheck, ShieldCheck, Bookmark, Package, PackageOpen, History, Trophy, Sparkles, Target, ChevronDown, Route as RouteIcon, Eye, Calendar, MapPin, Sun, Car, MessageSquare, Download, Users, User, Percent, Link as LinkIcon, Trash2, TrendingUp, ScanLine, QrCode, XCircle, AlertCircle, Tv, Camera } from "lucide-react";
import Link from 'next/link';

import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ptBR } from 'date-fns/locale';
import SignatureCanvas from 'react-signature-canvas';
import dynamic from "next/dynamic";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useTechnicians, usePresets, useCodes, useActiveRoutes, useChecklists, useVisitTemplate } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);


type FieldWithPosition = ChecklistField & { x: number; y: number };

const availableVariables: { key: keyof RouteStop | 'currentDate' | 'technicianName' | 'serial', label: string }[] = [
    { key: 'serviceOrder', label: 'Número da OS' },
    { key: 'consumerName', label: 'Nome do Cliente' },
    { key: 'model', label: 'Modelo do Produto' },
    { key: 'serial', label: 'Número de Série' },
    { key: 'city', label: 'Cidade' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'requestDate', label: 'Data de Solicitação' },
    { key: 'warrantyType', label: 'Tipo de Garantia' },
    { key: 'replacedPart', label: 'Peças Trocadas'},
    { key: 'observations', label: 'Observações'},
    { key: 'technicianName', label: 'Nome do Técnico'},
    { key: 'currentDate', label: 'Data Atual (DD/MM/AAAA)'},
];



const formSchema = z.object({
  technician: z.string().min(1, "Selecione um técnico."),
  serviceOrderNumber: z.string().min(1, "Insira o número da OS."),
  serviceType: z.string().optional(),
  samsungRepairType: z.string().optional(),
  samsungBudgetApproved: z.boolean().optional(),
  samsungBudgetValue: z.string().optional(),
  equipmentType: z.string().min(1, "Selecione o tipo de aparelho."),
  presetId: z.string().optional(),
  symptomCode: z.string().optional(),
  repairCode: z.string().optional(),
  replacedPart: z.string().optional(),
  observations: z.string().optional(),
  defectFound: z.string().optional(),
  partsRequested: z.string().optional(),
  productCollectedOrInstalled: z.string().optional(),
  collectionType: z.string().optional(),
  cleaningPerformed: z.boolean().optional(),
  isFinalized: z.boolean().default(true),
  pendingReason: z.string().optional(),
  samsungLpSurveyPerformed: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.isFinalized === false) {
    if (!data.pendingReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o motivo da pendência.",
        path: ["pendingReason"],
      });
    }
    return; // SKIP ALL OTHER VALIDATIONS!
  }

  if (!data.serviceType || data.serviceType.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecione o tipo de atendimento.",
      path: ["serviceType"],
    });
    return;
  }

  const serviceRequiresCodes = !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType);
  
  if (serviceRequiresCodes) {
    if (!data.symptomCode || data.symptomCode.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o código de sintoma.",
        path: ["symptomCode"],
      });
    }
    
    const repairIsOptional = data.serviceType === 'visita_orcamento_samsung' || data.serviceType === 'reparo_samsung';

    if (!repairIsOptional && (!data.repairCode || data.repairCode.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Selecione o código de reparo.",
            path: ["repairCode"],
        });
    }
  }

  if (data.serviceType === 'coleta_eco_rma') {
    if (!data.productCollectedOrInstalled || data.productCollectedOrInstalled.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Este campo é obrigatório para este tipo de atendimento.",
        path: ["productCollectedOrInstalled"],
      });
    }
    if (!data.collectionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o tipo de coleta.",
        path: ["collectionType"],
      });
    }
  }

  if (data.serviceType === 'instalacao_inicial') {
      if (!data.productCollectedOrInstalled || data.productCollectedOrInstalled.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Este campo é obrigatório para este tipo de atendimento.",
            path: ["productCollectedOrInstalled"],
        });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;







function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value
              ? options.find((option) => option.value === value)?.label ?? placeholder
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Pesquisar..." />
          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
          <CommandList>
            <CommandGroup>
              <CommandItem
                key="none"
                value="Nenhum"
                onSelect={() => {
                  onChange("")
                  setOpen(false)
                }}
              >
                Nenhum
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}







function ChecklistSection({ 
    checklistTemplates, 
    routeStopData,
    mainFormData,
    onChecklistDataChange,
    checklistData,
    technicianName
}: {
    checklistTemplates: ChecklistTemplate[],
    routeStopData: RouteStop | null,
    mainFormData: FormValues,
    onChecklistDataChange: (data: Record<string, string | boolean>) => void,
    checklistData: Record<string, string | boolean>,
    technicianName?: string;
}) {
  const { toast } = useToast();

    const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
    const [fields, setFields] = useState<FieldWithPosition[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTargetField, setScanTargetField] = useState<string | null>(null);
    const signatureRefs = useRef<Record<string, any>>({});

    useEffect(() => {
        if (selectedTemplate) {
            const initialFields = (selectedTemplate.fields || []).map(f => ({ ...f, x: f.x || 50, y: f.y || 50 }));
            setFields(initialFields as FieldWithPosition[]);
        } else {
            setFields([]);
        }
    }, [selectedTemplate]);

     useEffect(() => {
        const newChecklistData: Record<string, string | boolean> = {};
        const allData = { 
            ...routeStopData, 
            serviceOrder: mainFormData.serviceOrderNumber,
            replacedPart: mainFormData.replacedPart,
            observations: mainFormData.observations,
            technicianName: technicianName,
            currentDate: new Date().toLocaleDateString('pt-BR'),
        };

        fields.forEach(field => {
            if (field.variableKey && field.variableKey in allData) {
                const value = allData[field.variableKey as keyof typeof allData];
                if (value) {
                     newChecklistData[field.id] = String(value);
                }
            }
        });
        onChecklistDataChange({...checklistData, ...newChecklistData});
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [fields, mainFormData.serviceOrderNumber, mainFormData.replacedPart, mainFormData.observations, routeStopData, technicianName]);


    const handleTemplateChange = (templateId: string) => {
        const template = checklistTemplates.find(t => t.id === templateId);
        setSelectedTemplate(template || null);
        if(!template) {
             onChecklistDataChange({});
        }
    };

    const handleInputChange = (fieldId: string, value: string | boolean) => {
        onChecklistDataChange({ ...checklistData, [fieldId]: value });
    };

    const handleOpenScanner = (fieldId: string) => {
        setScanTargetField(fieldId);
        setIsScannerOpen(true);
    };

    const handleScanSuccess = (decodedText: string) => {
        if (scanTargetField) {
            handleInputChange(scanTargetField, decodedText);
        }
        setIsScannerOpen(false);
        setScanTargetField(null);
        toast({ title: "Código lido com sucesso!" });
    };
    
    const handleGeneratePdf = async () => {
        if (!selectedTemplate) {
             toast({ variant: "destructive", title: "Modelo não selecionado" });
            return;
        }
         if (!mainFormData.serviceOrderNumber) {
             toast({ variant: "destructive", title: "Dados incompletos", description: "Preencha o número da OS no formulário principal." });
            return;
        }
        setIsGenerating(true);

        try {
            const pdfUrl = `${window.location.origin}${selectedTemplate.pdfUrl}`;
            const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            for (const field of fields) {
                const value = checklistData[field.id];
                
                if (field.type === 'signature') {
                    const canvas = signatureRefs.current[field.id];
                    if (canvas && !canvas.isEmpty()) {
                        const base64Data = canvas.toDataURL('image/png');
                        const pngImage = await pdfDoc.embedPng(base64Data);
                        const w = field.width || 150;
                        const h = field.height || 40; 
                        const pageToDraw = pages[field.page - 1] || pages[0];
                        if (pageToDraw) {
                            const pageHeight = pageToDraw.getHeight();
                            pageToDraw.drawImage(pngImage, {
                                x: field.x,
                                y: pageHeight - field.y - h,
                                width: w,
                                height: h,
                            });
                        }
                    }
                } else if (value !== undefined && value !== null) {
                    const pageToDraw = pages[field.page - 1] || pages[0];
                    if (pageToDraw) {
                        const pageHeight = pageToDraw.getHeight();
                        if (field.type === 'text' && typeof value === 'string') {
                            pageToDraw.drawText(value, { x: field.x, y: pageHeight - field.y - 10, font, size: 12, color: rgb(0, 0, 0) });
                        } else if (field.type === 'checkbox' && value === true) {
                            pageToDraw.drawText('X', { x: field.x + 2, y: pageHeight - field.y - 12, font, size: 14, color: rgb(0, 0, 0) });
                        }
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();

            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${mainFormData.serviceOrderNumber}_checklist.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            toast({ title: "PDF gerado com sucesso!" });

        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Erro ao Gerar PDF" });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <>
            <Card className="w-full">
                <CardHeader>
                    <CardTitle>Checklist (Opcional)</CardTitle>
                    <CardDescription>
                        Selecione um modelo para preencher e gerar um checklist em PDF.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Modelo de Checklist</Label>
                        <Select onValueChange={handleTemplateChange} value={selectedTemplate?.id || ""}>
                            <SelectTrigger>
                                <SelectValue placeholder={"Selecione um modelo..."} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {Object.entries(
                                    checklistTemplates.reduce<Record<string, ChecklistTemplate[]>>((acc, t) => {
                                        const key = t.category?.trim() || 'Outros';
                                        (acc[key] ||= []).push(t);
                                        return acc;
                                    }, {})
                                )
                                    .sort(([a], [b]) => (a === 'Outros' ? 1 : b === 'Outros' ? -1 : a.localeCompare(b)))
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

                    {selectedTemplate && (
                        <div className="space-y-6 pt-4 border-t">
                            {fields.map(field => {
                                const value = checklistData[field.id];
                                const isAutoFilled = field.variableKey && value;
                                const isSerialField = field.name.toLowerCase().includes('serial');
                                
                                return (
                                    <div key={field.id} className="space-y-2">
                                        <Label htmlFor={`fill-${field.id}`} className="flex items-center gap-2">
                                            {isAutoFilled && <span title="Preenchido automaticamente"><LinkIcon className="h-4 w-4 text-blue-500" /></span>}
                                            {field.name}
                                        </Label>
                                        {field.type === 'text' ? (
                                            <div className="flex items-center gap-2">
                                                <Input 
                                                    id={`fill-${field.id}`} 
                                                    value={value !== undefined ? String(value) : ''}
                                                    onChange={(e) => handleInputChange(field.id, e.target.value)} 
                                                />
                                                {isSerialField && (
                                                    <Button type="button" size="icon" variant="outline" onClick={() => handleOpenScanner(field.id)}>
                                                        <ScanLine className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ) : field.type === 'checkbox' ? (
                                            <div className="flex items-center space-x-2">
                                                <input 
                                                    type="checkbox" 
                                                    id={`fill-${field.id}`} 
                                                    className="h-4 w-4" 
                                                    checked={!!value}
                                                    onChange={(e) => handleInputChange(field.id, e.target.checked)} 
                                                />
                                                <label htmlFor={`fill-${field.id}`} className="text-sm">Marcar</label>
                                            </div>
                                        ) : (
                                            <div className="border rounded-md overflow-hidden bg-white shadow-sm border-gray-300">
                                                <SignatureCanvas 
                                                    ref={(ref) => {
                                                        if (ref) signatureRefs.current[field.id] = ref;
                                                    }}
                                                    penColor="black"
                                                    canvasProps={{
                                                        className: 'signature-canvas w-full h-40'
                                                    }}
                                                />
                                                <div className="bg-muted p-1 flex justify-end border-t">
                                                    <Button type="button" variant="ghost" size="sm" onClick={() => signatureRefs.current[field.id]?.clear()}>Limpar Assinatura</Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {fields.length === 0 && (
                                <p className="text-center text-muted-foreground pt-4 text-sm">Nenhum campo configurado para este modelo.</p>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={handleGeneratePdf} disabled={isGenerating || !selectedTemplate} className="w-full">
                        <Download className="mr-2 h-4 w-4" />
                        {isGenerating ? 'Gerando PDF...' : 'Gerar e Baixar PDF do Checklist'}
                    </Button>
                </CardFooter>
            </Card>
            <ScannerDialog 
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleScanSuccess}
            />
        </>
    );
}

function inferEquipmentType(stop: RouteStop): "TV/AV" | "DA" | null {
  if (!stop) return null;
  
  // 1. Check by productType (SPD) if available
  const spd = (stop.productType || "").toUpperCase().trim();
  if (spd) {
    if (/^(TV|VD|MNT|MON|LFD|AUD|HTS|AV|AUDIO|HE|VISUAL)/.test(spd)) {
      return "TV/AV";
    }
    if (/^(DA|REF|W\/M|WM|MWO|AC|RAC|FJM|CAC|PAC|DW|DISH|HOME|APPLIANCE)/.test(spd)) {
      return "DA";
    }
  }
  
  // 2. Check by Model prefix (very accurate for Samsung)
  const model = (stop.model || "").toUpperCase().trim();
  if (model) {
    if (/^(UN|QN|LH|LS|PL|CL|LN|HW|MX)/.test(model)) {
      return "TV/AV";
    }
    if (/^(RF|RS|RT|RB|RH|RL|WD|WF|WA|DV|AR|AS|AM|MC|MS|ME|DW|NQ)/.test(model)) {
      return "DA";
    }
  }
  
  return null;
}

export default function OsFormPage() {
  const queryClient = useQueryClient();
  const { data: technicians = [], isError: errTech } = useTechnicians();
  const { data: presets = [], isError: errPresets } = usePresets();
  const { data: activeRoutes = [], isError: errRoutes } = useActiveRoutes();
  const { data: checklistTemplates = [], isError: errChecklists } = useChecklists();
  const { data: visitTemplate = "", isError: errTemplate } = useVisitTemplate();
  const { data: codes = { symptomCodes: { "TV/AV": [], "DA": [] }, repairCodes: { "TV/AV": [], "DA": [] } }, isError: errCodes } = useCodes();
  const { symptomCodes, repairCodes } = codes;

  const dataFetchError = errTech || errPresets || errRoutes || errChecklists || errTemplate || errCodes;
  const refreshDynamicData = () => queryClient.invalidateQueries();
  const [generatedText, setGeneratedText] = useState("");
  const [osIsSaved, setOsIsSaved] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [assistantName, setAssistantName] = useState("");
  const [localTechnician, setLocalTechnician] = useState("");
  const [currentRouteStop, setCurrentRouteStop] = useState<RouteStop | null>(null);
  const [partsStatus, setPartsStatus] = useState<Record<string, 'used' | 'not_used' | null>>({});
  const [partsUsedQuantity, setPartsUsedQuantity] = useState<Record<string, number>>({});
  const [checklistData, setChecklistData] = useState<Record<string, string | boolean>>({});
const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      technician: "",
      serviceOrderNumber: "",
      serviceType: "",
      samsungRepairType: "",
      samsungBudgetApproved: false,
      samsungBudgetValue: "",
      equipmentType: "",
      presetId: "none",
      symptomCode: "",
      repairCode: "",
      replacedPart: "",
      observations: "",
      defectFound: "",
      partsRequested: "",
      productCollectedOrInstalled: "",
      collectionType: "",
      cleaningPerformed: false,
      isFinalized: true,
      pendingReason: "",
      samsungLpSurveyPerformed: false,
    },
  });

  const handleNextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['equipmentType', 'technician', 'serviceOrderNumber'];
    } else if (currentStep === 2) {
      const isFinalized = form.getValues('isFinalized');
      if (!isFinalized) {
          fieldsToValidate = ['pendingReason'];
      } else {
          const routeParts = currentRouteStop?.parts || [];
          const unreviewed = routeParts.filter((p: { code: string }) => partsStatus[p.code] === null || partsStatus[p.code] === undefined);
          if (unreviewed.length > 0) {
              toast({
                  variant: "destructive",
                  title: "⚠️ Confirme o status das peças!",
                  description: `${unreviewed.length} peça(s) ainda sem confirmação. Revise abaixo.`,
              });
              document.getElementById('parts-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return;
          }
      }
    } else if (currentStep === 3) {
      fieldsToValidate = ['serviceType'];
      const sType = form.getValues('serviceType');
      if (sType === 'coleta_eco_rma') {
          fieldsToValidate.push('collectionType', 'productCollectedOrInstalled');
      } else if (sType === 'instalacao_inicial') {
          fieldsToValidate.push('productCollectedOrInstalled');
      } else if (sType && sType !== 'visita_assurant') {
          fieldsToValidate.push('symptomCode');
          if (sType !== 'visita_orcamento_samsung' && sType !== 'reparo_samsung') {
              fieldsToValidate.push('repairCode');
          }
      }
    }

    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const allFormValues = form.watch();

   useEffect(() => {
        try {
            const savedFormData = localStorage.getItem('serviceOrderFormData');
            let parsedData = savedFormData ? JSON.parse(savedFormData) : null;
            
            if (parsedData && Object.keys(parsedData).length > 0) {
                form.reset({ ...form.getValues(), ...parsedData });
            }
        } catch (e) {
            console.error("Failed to parse form data from localStorage", e);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); 

    useEffect(() => {
      localStorage.setItem('serviceOrderFormData', JSON.stringify(allFormValues));
    }, [allFormValues]);



   useEffect(() => {
      localStorage.setItem('checklistFormData', JSON.stringify(checklistData));
  }, [checklistData]);

  const watchedServiceType = form.watch("serviceType");
  const watchedEquipmentType = form.watch("equipmentType");
  const watchedTechnician = form.watch("technician");
  const watchedPreset = form.watch("presetId");
  const watchedSamsungRepairType = form.watch("samsungRepairType");
  const watchedServiceOrderNumber = form.watch("serviceOrderNumber");
  const { resetField, setValue } = form;

  useEffect(() => {
    try {
        const savedChecklistData = localStorage.getItem('checklistFormData');
        if (savedChecklistData) {
            setChecklistData(JSON.parse(savedChecklistData));
        }
        const savedAssistant = localStorage.getItem("assistantName");
        if (savedAssistant) {
            setAssistantName(savedAssistant);
        }
        const savedTechnician = localStorage.getItem('lastTechnician');
        if (savedTechnician) {
            setLocalTechnician(savedTechnician);
            setValue('technician', savedTechnician);
        }
    } catch (error) {
        console.error("Failed to parse data from localStorage", error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("assistantName", assistantName);
  }, [assistantName]);

  useEffect(() => {
    resetField("symptomCode");
    resetField("repairCode");
    resetField("presetId", { defaultValue: "none" });
    resetField("replacedPart");
    resetField("observations");
  }, [watchedEquipmentType, resetField]);

  useEffect(() => {
    const selectedPreset = presets.find(p => p.id === watchedPreset);
    if (selectedPreset) {
      if (form.getValues("symptomCode") !== selectedPreset.symptomCode) {
        setValue("symptomCode", selectedPreset.symptomCode);
      }
      if (form.getValues("repairCode") !== selectedPreset.repairCode) {
        setValue("repairCode", selectedPreset.repairCode);
      }
      if (form.getValues("replacedPart") !== (selectedPreset.replacedPart || "")) {
        setValue("replacedPart", selectedPreset.replacedPart || "");
      }
      if (form.getValues("observations") !== (selectedPreset.observations || "")) {
        setValue("observations", selectedPreset.observations || "");
      }
    } else if (watchedPreset === "none") {
      if (form.getValues("symptomCode") !== "") {
        setValue("symptomCode", "");
      }
      if (form.getValues("repairCode") !== "") {
        setValue("repairCode", "");
      }
      if (form.getValues("replacedPart") !== "") {
        setValue("replacedPart", "");
      }
      if (form.getValues("observations") !== "") {
        setValue("observations", "");
      }
    }
  }, [watchedPreset, presets, setValue, form]);

  const previousOsRef = useRef<string | null>(null);

  useEffect(() => {
    if (watchedServiceOrderNumber) {
        let foundStop: RouteStop | null = null;
        for (const route of activeRoutes) {
            const stop = route.stops.find((s: RouteStop) => s.serviceOrder === watchedServiceOrderNumber);
            if (stop) {
                foundStop = stop;
                break;
            }
        }
        
        const isSame = JSON.stringify(foundStop) === JSON.stringify(currentRouteStop);
        if (!isSame) {
            setCurrentRouteStop(foundStop);
        }

        // Infer and set equipmentType automatically if found in active route
        if (foundStop) {
            const inferred = inferEquipmentType(foundStop);
            if (inferred && form.getValues("equipmentType") !== inferred) {
                setValue("equipmentType", inferred);
            }
            // Auto-select Samsung LP repair if the stop has LP warrantyType
            if (foundStop.warrantyType === 'LP') {
                if (form.getValues("serviceType") !== 'reparo_samsung') {
                    setValue("serviceType", 'reparo_samsung');
                }
                if (form.getValues("samsungRepairType") !== 'LP') {
                    setValue("samsungRepairType", 'LP');
                }
            }
        }
        
        // Reset part status ONLY when OS number actually changes
        if (previousOsRef.current !== watchedServiceOrderNumber) {
            if (foundStop?.parts) {
                const initial: Record<string, 'used' | 'not_used' | null> = {};
                foundStop.parts.forEach((p: { code: string }) => { initial[p.code] = null; });
                setPartsStatus(initial);
                setPartsUsedQuantity({});
            } else {
                setPartsStatus({});
                setPartsUsedQuantity({});
            }
            setValue("replacedPart", "");
            setOsIsSaved(false);
            previousOsRef.current = watchedServiceOrderNumber;
        }
    } else {
        if (currentRouteStop !== null) {
            setCurrentRouteStop(null);
        }
        if (previousOsRef.current !== null) {
            setOsIsSaved(false);
            previousOsRef.current = null;
        }
    }
  }, [watchedServiceOrderNumber, activeRoutes, setValue, currentRouteStop, form]);
  
  useEffect(() => {
    const replacedPartText = (currentRouteStop?.parts || [])
        .filter((p: { code: string; quantity: number }) => partsStatus[p.code] === 'used')
        .map((p: { code: string; quantity: number }) => {
            const usedQty = partsUsedQuantity[p.code] || p.quantity;
            return usedQty > 1 ? `${p.code} (x${usedQty})` : p.code;
        })
        .join(', ');
    
    if (form.getValues("replacedPart") !== replacedPartText) {
        setValue("replacedPart", replacedPartText);
    }
  }, [partsStatus, partsUsedQuantity, currentRouteStop, setValue, form]);


  const previewText = useMemo(() => {
    const data = allFormValues;
    const tech = technicians.find(t => t.id === data.technician);
    let technicianName = tech?.name || '';
    if (assistantName) {
      technicianName = `${technicianName} / ${assistantName}`;
    }
    const today = format(new Date(), "dd/MM/yyyy");

    let serviceDetails = '';
    const collectionTypeLabel = data.collectionType ? data.collectionType.charAt(0).toUpperCase() + data.collectionType.slice(1) : '';

    const serviceTypeLabels: Record<string, string> = {
        reparo_samsung: `Reparo Samsung - ${data.samsungRepairType || ''}`,
        visita_orcamento_samsung: `Visita orçamento Samsung - Aprovado: ${data.samsungBudgetApproved ? 'Sim' : 'Não'}${data.samsungBudgetApproved && data.samsungBudgetValue ? `, Valor: R$ ${data.samsungBudgetValue}` : ''}`,
        visita_assurant: 'Visita Assurant',
        coleta_eco_rma: `Coleta - ${collectionTypeLabel}`,
        instalacao_inicial: 'Instalação Inicial',
    };
    serviceDetails = data.serviceType ? (serviceTypeLabels[data.serviceType] || data.serviceType) : '';

    const isPending = !data.isFinalized;

    const baseTextParts = [
      `**Data: ${today} - ${data.equipmentType}**`,
      `**Ordem de Serviço: ${data.serviceOrderNumber}**`,
      `- **Técnico:** ${technicianName}`,
      isPending ? `⚠️ **ATENDIMENTO NÃO FINALIZADO:** ${data.pendingReason} ⚠️` : '',
      (!isPending && serviceDetails) ? `- **Atendimento:** ${serviceDetails}` : '',
    ];

    let serviceSpecificParts: string[] = [];

    const serviceNeedsCodes = data.serviceType ? !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType) : false;

    if (data.serviceType === 'visita_assurant') {
        if (data.defectFound) serviceSpecificParts.push(`- **Defeito Constatado:** ${data.defectFound}`);
        if (data.partsRequested) serviceSpecificParts.push(`- **Peças Solicitadas:** ${data.partsRequested}`);
    } else if (serviceNeedsCodes) {
        const symptomDescription = data.symptomCode && data.equipmentType && symptomCodes[data.equipmentType as keyof typeof symptomCodes]
            ? `${data.symptomCode} - ${symptomCodes[data.equipmentType as keyof typeof symptomCodes]?.find(s => s.code === data.symptomCode)?.description}`
            : '';
        if (symptomDescription) serviceSpecificParts.push(`- **Sintoma:** ${symptomDescription}`);

        const repairDescription = data.repairCode && data.equipmentType && repairCodes[data.equipmentType as keyof typeof repairCodes]
            ? `${data.repairCode} - ${repairCodes[data.equipmentType as keyof typeof repairCodes]?.find(r => r.code === data.repairCode)?.description}`
            : '';
        if (repairDescription) serviceSpecificParts.push(`- **Reparo:** ${repairDescription}`);
    } else if (data.serviceType && ['coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType)) {
        if(data.productCollectedOrInstalled) serviceSpecificParts.push(`- **Produto Coletado/Instalado:** ${data.productCollectedOrInstalled}`);
    }

    const optionalParts = [
        data.replacedPart ? `- **Peça Trocada:** ${data.replacedPart}` : '',
        ((data.samsungRepairType === 'LP' || currentRouteStop?.warrantyType === 'LP') && data.samsungLpSurveyPerformed) ? `- **Pesquisa de Satisfação LP:** Realizada` : '',
        data.observations ? `- **Observações:** ${data.observations}` : ''
    ].filter(Boolean);

    return [...baseTextParts, ...serviceSpecificParts, ...optionalParts].filter(Boolean).join('\n');
  }, [allFormValues, technicians, assistantName, symptomCodes, repairCodes, currentRouteStop]);

  const onSubmit = async (data: FormValues) => {
    // Bloquear envio se há peças da rota não revisadas
    const currentParts = currentRouteStop?.parts || [];
    const unreviewed = currentParts.filter((p: { code: string }) => partsStatus[p.code] === null || partsStatus[p.code] === undefined);
    if (unreviewed.length > 0) {
        toast({
            variant: "destructive",
            title: "⚠️ Confirme o status das peças!",
            description: `${unreviewed.length} peça(s) ainda sem confirmação. Marque cada uma como USADA ou NÃO USADA.`,
        });
        document.getElementById('parts-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    setGeneratedText(previewText);

    try {
        const newServiceOrder: Partial<ServiceOrder> = {
            technicianId: data.technician,
            serviceOrderNumber: data.serviceOrderNumber,
            serviceType: data.serviceType as any,
            equipmentType: data.equipmentType as any,
            date: new Date(),
            samsungRepairType: data.samsungRepairType || '',
            samsungBudgetApproved: data.samsungBudgetApproved || false,
            samsungBudgetValue: data.samsungBudgetValue ? parseFloat(data.samsungBudgetValue) : 0,
            symptomCode: data.symptomCode || '',
            repairCode: data.repairCode || '',
            replacedPart: data.replacedPart || '',
            observations: ((data.samsungRepairType === 'LP' || currentRouteStop?.warrantyType === 'LP') && data.samsungLpSurveyPerformed)
                ? `${data.observations || ''}\n[Pesquisa LP realizada: Sim]`.trim()
                : data.observations || '',
            defectFound: data.defectFound || '',
            partsRequested: data.partsRequested || '',
            productCollectedOrInstalled: data.productCollectedOrInstalled || '',
            collectionType: data.collectionType as any,
            cleaningPerformed: data.cleaningPerformed || false,
            isFinalized: data.isFinalized !== undefined ? data.isFinalized : true,
            pendingReason: data.pendingReason || '',
        };

        await serviceOrderService.create(newServiceOrder as Omit<ServiceOrder, 'id'>);
        setOsIsSaved(true);
        setIsSuccessDialogOpen(true);
        toast({
            title: "OS Lançada com Sucesso!",
            description: `A ordem de serviço ${data.serviceOrderNumber} foi salva.`,
        });

        await refreshDynamicData();

    } catch (error) {
        setOsIsSaved(false);
        console.error("Error adding service order: ", error);
        toast({
            variant: "destructive",
            title: "Erro ao Salvar OS",
            description: "Não foi possível salvar a ordem de serviço no banco de dados.",
        });
    }
  };

  const handleCopy = () => {
    const textToCopy = previewText;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        toast({
          title: "Texto Copiado!",
          description: "O texto da OS foi copiado para sua área de transferência.",
        });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Erro ao copiar",
          description: "Não foi possível copiar o texto.",
        });
      });
  };
  
  const resetForm = () => {
    form.reset({
        technician: localTechnician,
        serviceOrderNumber: "",
        serviceType: "",
        samsungRepairType: "",
        samsungBudgetApproved: false,
        samsungBudgetValue: "",
        equipmentType: "",
        presetId: "none",
        symptomCode: "",
        repairCode: "",
        replacedPart: "",
        observations: "",
        defectFound: "",
        partsRequested: "",
        productCollectedOrInstalled: "",
        collectionType: "",
        cleaningPerformed: false,
        isFinalized: true,
        pendingReason: "",
        samsungLpSurveyPerformed: false,
    });
     setGeneratedText("");
    setOsIsSaved(false);
    setIsSuccessDialogOpen(false);
    setChecklistData({});
    setCurrentStep(1);
    setPartsUsedQuantity({});
  }

  const handleNewOS = () => {
    resetForm();
  }

  const handleClearForm = () => {
    resetForm();
    localStorage.removeItem('serviceOrderFormData');
    localStorage.removeItem('checklistFormData');
    // Não removemos assistantName nem lastTechnician
    
    setValue('technician', localTechnician);
    
    toast({ title: "Formulário Limpo", description: "Todos os dados da OS foram removidos, mas a equipe foi mantida." });
  }

  const handlePartStatusChange = (partCode: string, status: 'used' | 'not_used') => {
    setPartsStatus(prev => ({ ...prev, [partCode]: status }));
    if (status === 'not_used') {
        setPartsUsedQuantity(prev => {
            const next = { ...prev };
            delete next[partCode];
            return next;
        });
    }
  };

  const handleQuantityChange = (partCode: string, qty: number) => {
    setPartsUsedQuantity(prev => ({ ...prev, [partCode]: qty }));
  };


  const filteredPresets = presets.filter(p => p.equipmentType === watchedEquipmentType);
  const serviceRequiresCodes = !watchedServiceType || !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);
  const showReplacedPart = !watchedServiceType || !['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);
  const routeParts = currentRouteStop?.parts || [];
  const reviewedCount = routeParts.filter((p: { code: string }) => partsStatus[p.code] !== null && partsStatus[p.code] !== undefined).length;
  const hasUnreviewedParts = routeParts.length > 0 && reviewedCount < routeParts.length;

  if (dataFetchError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[50vh]">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Erro de Conexão</h2>
        <p className="text-slate-500 max-w-md">Não foi possível conectar ao banco de dados. Verifique sua conexão com a internet ou tente novamente mais tarde.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full animate-in fade-in ease-out duration-300">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <Card className="w-full border-none shadow-none bg-transparent md:glass-card md:border-solid md:shadow-xl overflow-visible">
                <CardHeader className="px-1 pt-0 pb-3 md:p-6 space-y-4 md:bg-primary/5 md:border-b md:border-border/40 md:rounded-t-xl">
                    <div>
                                        <CardTitle className="text-[22px] md:text-2xl tracking-tight leading-none">Lançamento Rápido de OS</CardTitle>
                                        <CardDescription className="text-xs md:text-sm mt-1 leading-tight text-muted-foreground/80 md:text-muted-foreground">
                                            Preencha os campos abaixo para gerar o texto da ordem de serviço.
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center justify-between w-full max-w-md mt-4">
                                        {[
                                            { step: 1, title: 'Básico', icon: User },
                                            { step: 2, title: 'Status', icon: Package },
                                            { step: 3, title: 'Detalhes', icon: Wrench },
                                            { step: 4, title: 'Fim', icon: CheckCircle }
                                        ].map((s, index) => {
                                            const Icon = s.icon;
                                            const isActive = currentStep === s.step;
                                            const isCompleted = currentStep > s.step;
                                            return (
                                                <div key={s.step} className="flex items-center flex-1 last:flex-initial">
                                                    <div className="flex items-center">
                                                        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all shrink-0 ${
                                                            isActive ? 'border-primary bg-primary text-primary-foreground shadow-sm scale-105' :
                                                            isCompleted ? 'border-primary bg-transparent text-primary' :
                                                            'border-muted bg-transparent text-muted-foreground'
                                                        }`}>
                                                            <Icon className="h-4 w-4" />
                                                        </div>
                                                        <span className={cn(
                                                            "ml-2 text-sm font-semibold transition-all whitespace-nowrap",
                                                            isActive ? "text-foreground inline" : "text-muted-foreground hidden md:inline"
                                                        )}>
                                                            {s.title}
                                                        </span>
                                                    </div>
                                                    {index < 3 && (
                                                        <div className={cn(
                                                            "flex-1 h-[2px] mx-2 min-w-[0.75rem] transition-colors duration-300",
                                                            isCompleted ? 'bg-primary' : 'bg-muted'
                                                        )} />
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </CardHeader>
                                <CardContent className="px-1 md:px-6">
                                    <Form {...form}>
                                        <form 
                                            onSubmit={(e) => e.preventDefault()} 
                                            className="space-y-4 md:space-y-5"
                                        >
                                            {currentStep === 1 && (
                                                <div className="space-y-4 md:space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                                                    <FormField control={form.control} name="equipmentType" render={({ field }) => (
                                                         <FormItem className="space-y-2">
                                                             <FormLabel>Tipo de Aparelho</FormLabel>
                                                             <FormControl>
                                                                 <div className="grid grid-cols-2 gap-3">
                                                                     <Button
                                                                         type="button"
                                                                         variant={field.value === "TV/AV" ? "default" : "outline"}
                                                                         className={cn(
                                                                             "h-14 flex items-center justify-center gap-2 border text-sm font-semibold transition-all rounded-lg w-full",
                                                                             field.value === "TV/AV" 
                                                                                 ? "border-primary bg-primary text-primary-foreground shadow-sm" 
                                                                                 : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                                                                         )}
                                                                         onClick={() => field.onChange("TV/AV")}
                                                                     >
                                                                         <Tv className="h-5 w-5 shrink-0" />
                                                                         <span>TV / AV</span>
                                                                     </Button>
                                                                     <Button
                                                                         type="button"
                                                                         variant={field.value === "DA" ? "default" : "outline"}
                                                                         className={cn(
                                                                             "h-14 flex items-center justify-center gap-2 border text-sm font-semibold transition-all rounded-lg w-full",
                                                                             field.value === "DA" 
                                                                                 ? "border-primary bg-primary text-primary-foreground shadow-sm" 
                                                                                 : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                                                                         )}
                                                                         onClick={() => field.onChange("DA")}
                                                                     >
                                                                         <Wrench className="h-5 w-5 shrink-0" />
                                                                         <span>DA (Linha Branca)</span>
                                                                     </Button>
                                                                 </div>
                                                             </FormControl>
                                                             <FormMessage />
                                                         </FormItem>
                                                     )}/>
                                                    
                                                    <FormField control={form.control} name="presetId" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel className="flex items-center gap-2"><Bookmark className="h-4 w-4" />Preset de Códigos (Opcional)</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value || 'none'} disabled={!watchedEquipmentType || !serviceRequiresCodes}>
                                                                <FormControl>
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder={!watchedEquipmentType ? "Selecione um tipo de aparelho primeiro" : !serviceRequiresCodes ? "Não aplicável para este atendimento" : "Selecione um preset para preencher os códigos"} />
                                                                    </SelectTrigger>
                                                                </FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="none">Nenhum</SelectItem>
                                                                    {filteredPresets.map((preset) => (
                                                                        <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <FormField control={form.control} name="technician" render={() => (
                                                            <FormItem>
                                                                <FormLabel>Técnico</FormLabel>
                                                                {technicians.length === 0 ? (
                                                                    <Select disabled>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Carregando..." /></SelectTrigger></FormControl>
                                                                    </Select>
                                                                ) : (
                                                                    <Select 
                                                                        onValueChange={(val) => {
                                                                            setLocalTechnician(val);
                                                                            setValue('technician', val, { shouldValidate: true, shouldDirty: true });
                                                                            localStorage.setItem('lastTechnician', val);
                                                                        }} 
                                                                        value={localTechnician || undefined}
                                                                    >
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="Selecione o Técnico" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            {technicians.map((tech) => (
                                                                                <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                                                            ))}
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}/>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="assistant" className="line-clamp-1">Auxiliar (Opcional)</Label>
                                                            <Input id="assistant" placeholder="Nome" value={assistantName} onChange={(e) => setAssistantName(e.target.value)} />
                                                        </div>
                                                    </div>

                                                    <FormField control={form.control} name="serviceOrderNumber" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Número da OS</FormLabel>
                                                            <FormControl><Input placeholder="Digite o número da OS" {...field} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>
                                                </div>
                                            )}

                                            {currentStep === 2 && (
                                                <div className="space-y-4 md:space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                                                    <div className="grid grid-cols-1 gap-4 items-start rounded-lg border p-4 bg-slate-50/50 dark:bg-slate-900/50">
                                                        <FormField control={form.control} name="isFinalized" render={({ field }) => (
                                                            <FormItem className="flex flex-row items-center justify-between">
                                                                <div className="space-y-0.5 mt-1">
                                                                    <FormLabel className="text-base text-slate-700 dark:text-slate-200">Atendimento Finalizado?</FormLabel>
                                                                    <div className="text-xs text-muted-foreground">Desmarque caso precise de mais peças, reagendamento ou peça com defeito</div>
                                                                </div>
                                                                <FormControl>
                                                                    <Switch 
                                                                        checked={field.value} 
                                                                        onCheckedChange={(val) => {
                                                                            field.onChange(val);
                                                                            if (!val && currentRouteStop?.parts) {
                                                                                const newStatus = { ...partsStatus };
                                                                                currentRouteStop.parts.forEach((p: { code: string }) => {
                                                                                    newStatus[p.code] = 'not_used';
                                                                                });
                                                                                setPartsStatus(newStatus);
                                                                            }
                                                                        }} 
                                                                    />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}/>
                                                        {!form.watch('isFinalized') && (
                                                            <FormField control={form.control} name="pendingReason" render={({ field }) => (
                                                                <FormItem className="animate-in fade-in slide-in-from-top-2">
                                                                    <FormLabel className="text-red-600 dark:text-red-400">Motivo da Pendência</FormLabel>
                                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                                        <FormControl><SelectTrigger className="border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"><SelectValue placeholder="Selecione o motivo..." /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="Peça nova com defeito">Peça nova com defeito</SelectItem>
                                                                            <SelectItem value="Repedido">Repedido</SelectItem>
                                                                            <SelectItem value="Remarcação">Remarcação</SelectItem>
                                                                            <SelectItem value="Ausente">Ausente / Cliente não estava</SelectItem>
                                                                            <SelectItem value="Outro">Outro</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                        )}
                                                    </div>

                                                    {form.watch('isFinalized') && routeParts.length > 0 && (
                                                        <div id="parts-section" className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900 overflow-hidden">
                                                            {/* Header da secção */}
                                                            <div className="px-4 py-3 bg-amber-100/80 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                                                                        <Package className="h-3.5 w-3.5 text-white" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Confirmação de Peças</p>
                                                                        <p className="text-[10px] text-amber-700 dark:text-amber-400">Obrigatório antes de avançar</p>
                                                                    </div>
                                                                </div>
                                                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
                                                                    reviewedCount === routeParts.length
                                                                        ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400 dark:border-green-700'
                                                                        : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700'
                                                                }`}>
                                                                    {reviewedCount === routeParts.length ? <Check className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                                                                    {reviewedCount} / {routeParts.length} revisadas
                                                                </div>
                                                            </div>

                                                            {/* Lista de peças */}
                                                            <div className="p-3 space-y-2">
                                                                {routeParts.map((part: { code: string; quantity: number; description?: string }) => {
                                                                    const status = partsStatus[part.code] ?? null;
                                                                    const usedQty = partsUsedQuantity[part.code] || part.quantity;

                                                                    return (
                                                                        <div key={part.code} className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${
                                                                            status === null
                                                                                ? 'border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900'
                                                                                : status === 'used'
                                                                                    ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30'
                                                                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 opacity-70'
                                                                        }`}>
                                                                            {/* Info da peça */}
                                                                            <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                                                                                <div className="min-w-0 flex-1">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className="font-mono font-black text-sm tracking-wider">{part.code}</span>
                                                                                        {part.quantity > 1 && (
                                                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">x{part.quantity}</span>
                                                                                        )}
                                                                                        {status === null && (
                                                                                            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                                                                <span>&#9888;</span> Pendente
                                                                                            </span>
                                                                                        )}
                                                                                        {status === 'used' && (
                                                                                            <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                                                                <Check className="h-2.5 w-2.5" /> Usada{part.quantity > 1 ? ` (${usedQty}/${part.quantity})` : ''}
                                                                                            </span>
                                                                                        )}
                                                                                        {status === 'not_used' && (
                                                                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                                                                                <XCircle className="h-2.5 w-2.5" /> Não usada
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    {part.description && (
                                                                                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{part.description}</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* Botões de ação */}
                                                                            <div className="px-3 pb-3 flex flex-col gap-2">
                                                                                <div className="grid grid-cols-2 gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handlePartStatusChange(part.code, 'used')}
                                                                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border-2 transition-all duration-150 min-h-[46px] ${
                                                                                            status === 'used'
                                                                                                ? 'bg-green-500 border-green-500 text-white shadow-md scale-[0.99]'
                                                                                                : 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 bg-white dark:bg-transparent hover:bg-green-50 dark:hover:bg-green-950/30 hover:border-green-400'
                                                                                        }`}
                                                                                    >
                                                                                        <Check className="h-4 w-4" />
                                                                                        USADA
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handlePartStatusChange(part.code, 'not_used')}
                                                                                        className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold border-2 transition-all duration-150 min-h-[46px] ${
                                                                                            status === 'not_used'
                                                                                                ? 'bg-slate-500 border-slate-500 text-white shadow-md scale-[0.99]'
                                                                                                : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400 bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900/30'
                                                                                        }`}
                                                                                    >
                                                                                        <XCircle className="h-4 w-4" />
                                                                                        NÃO USADA
                                                                                    </button>
                                                                                </div>

                                                                                {/* Seletor de quantidade parcial */}
                                                                                {status === 'used' && part.quantity > 1 && (
                                                                                    <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/40 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-top-1 duration-200">
                                                                                        <div>
                                                                                            <p className="text-xs font-bold text-green-800 dark:text-green-300">Quantidade usada</p>
                                                                                            <p className="text-[10px] text-green-600 dark:text-green-500">Total disponível: {part.quantity}</p>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleQuantityChange(part.code, usedQty - 1)}
                                                                                                disabled={usedQty <= 1}
                                                                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-green-800 border-2 border-green-300 dark:border-green-600 text-green-800 dark:text-green-100 disabled:opacity-40 font-bold text-lg hover:bg-green-50 dark:hover:bg-green-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                                                                                            >−</button>
                                                                                            <span className="font-black text-base w-6 text-center text-green-900 dark:text-green-100">{usedQty}</span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => handleQuantityChange(part.code, usedQty + 1)}
                                                                                                disabled={usedQty >= part.quantity}
                                                                                                className="w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-green-800 border-2 border-green-300 dark:border-green-600 text-green-800 dark:text-green-100 disabled:opacity-40 font-bold text-lg hover:bg-green-50 dark:hover:bg-green-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                                                                                            >+</button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Rodapé de progresso */}
                                                            {reviewedCount < routeParts.length && (
                                                                <div className="px-4 py-2 bg-amber-100/60 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 bg-amber-200 dark:bg-amber-800 rounded-full h-1.5">
                                                                            <div
                                                                                className="bg-amber-500 h-1.5 rounded-full transition-all duration-300"
                                                                                style={{ width: `${routeParts.length > 0 ? (reviewedCount / routeParts.length) * 100 : 0}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                                                            {routeParts.length - reviewedCount} restante{routeParts.length - reviewedCount !== 1 ? 's' : ''}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {currentStep === 3 && (
                                                <div className="space-y-4 md:space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                                                    <FormField control={form.control} name="serviceType" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Tipo de Atendimento</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger></FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="reparo_samsung">Reparo Samsung</SelectItem>
                                                                    <SelectItem value="visita_orcamento_samsung">Visita Orçamento Samsung</SelectItem>
                                                                    <SelectItem value="visita_assurant">Visita Assurant</SelectItem>
                                                                    <SelectItem value="coleta_eco_rma">Coleta Eco /RMA</SelectItem>
                                                                    <SelectItem value="instalacao_inicial">Instalação Inicial</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>

                                                    {watchedServiceType === 'coleta_eco_rma' && (
                                                        <FormField control={form.control} name="collectionType" render={({ field }) => (
                                                            <FormItem className="pl-4 border-l-2 border-primary/50">
                                                                <FormLabel>Tipo de Coleta</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value || ""}>
                                                                    <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo de coleta" /></SelectTrigger></FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="reparo">Reparo</SelectItem>
                                                                        <SelectItem value="rma">RMA</SelectItem>
                                                                        <SelectItem value="eco">Eco</SelectItem>
                                                                        <SelectItem value="descarte">Descarte</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}/>
                                                    )}

                                                    {watchedServiceType === 'reparo_samsung' && (
                                                        <div className="space-y-4">
                                                            <FormField control={form.control} name="samsungRepairType" render={({ field }) => (
                                                                <FormItem className="pl-4 border-l-2 border-primary/50">
                                                                    <FormLabel>Sub-tipo Reparo Samsung</FormLabel>
                                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                                        <FormControl><SelectTrigger><SelectValue placeholder="LP / OW / VOID" /></SelectTrigger></FormControl>
                                                                        <SelectContent>
                                                                            <SelectItem value="LP">LP</SelectItem>
                                                                            <SelectItem value="OW">OW</SelectItem>
                                                                            <SelectItem value="VOID">VOID</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>

                                                            {((currentRouteStop && currentRouteStop.warrantyType === 'LP') || (!currentRouteStop && watchedSamsungRepairType === 'LP')) && (
                                                                <div className="pl-4 border-l-2 border-amber-500 bg-amber-50/50 dark:bg-amber-955/10 p-3 rounded-r-lg space-y-3 mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                    <div className="flex items-start gap-2.5">
                                                                        <span className="text-xl">📋</span>
                                                                        <div className="space-y-0.5">
                                                                            <h5 className="text-sm font-bold text-amber-800 dark:text-amber-400">Pesquisa de Satisfação LP Obrigatória</h5>
                                                                            <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-snug">
                                                                                Samsung exige que seja feita a pesquisa de satisfação para todo atendimento sub-tipo LP.
                                                                            </p>
                                                                            <div className="flex gap-2">
                                                                                <Button 
                                                                                    type="button" 
                                                                                    size="sm" 
                                                                                    variant="outline" 
                                                                                    className="h-8 text-xs font-semibold border-amber-300 text-amber-800 bg-white hover:bg-amber-100/50 dark:bg-slate-900 dark:border-amber-900 dark:text-amber-300"
                                                                                    onClick={async () => {
                                                                                        const soNum = form.getValues('serviceOrderNumber') || currentRouteStop?.serviceOrder || '';
                                                                                        if (soNum) {
                                                                                            await copyToClipboard(soNum);
                                                                                        }
                                                                                        form.setValue('samsungLpSurveyPerformed', true);
                                                                                        toast({
                                                                                            title: "OS Copiada e Pesquisa Marcada! 📋",
                                                                                            description: `Número ${soNum} copiado. Pesquisa LP marcada como realizada.`,
                                                                                        });
                                                                                        window.open('https://samsungcontigo.com/#/account/signTechnician', '_blank', 'noopener,noreferrer');
                                                                                    }}
                                                                                >
                                                                                    Abrir Link da Pesquisa 🔗
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <FormField control={form.control} name="samsungLpSurveyPerformed" render={({ field }) => (
                                                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-slate-900 p-3 shadow-sm">
                                                                            <div className="space-y-0.5">
                                                                                <FormLabel className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                                                                    Realizou a pesquisa de satisfação com o cliente?
                                                                                </FormLabel>
                                                                            </div>
                                                                            <FormControl>
                                                                                <Switch checked={field.value || false} onCheckedChange={field.onChange} />
                                                                            </FormControl>
                                                                        </FormItem>
                                                                    )}/>
                                                                </div>
                                                             )}
                                                        </div>
                                                    )}

                                                    {watchedServiceType === 'visita_orcamento_samsung' && (
                                                        <div className="pl-4 border-l-2 border-primary/50 space-y-4">
                                                            <FormField control={form.control} name="samsungBudgetApproved" render={({ field }) => (
                                                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                                                    <div className="space-y-0.5"><FormLabel>Orçamento Aprovado?</FormLabel></div>
                                                                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                                </FormItem>
                                                            )}/>
                                                            {form.watch('samsungBudgetApproved') && (
                                                                <FormField control={form.control} name="samsungBudgetValue" render={({ field }) => (
                                                                    <FormItem>
                                                                        <FormLabel>Valor (R$)</FormLabel>
                                                                        <FormControl><Input type="number" placeholder="Ex: 150.00" {...field} /></FormControl>
                                                                        <FormMessage />
                                                                    </FormItem>
                                                                )}/>
                                                            )}
                                                        </div>
                                                    )}
                                                    
                                                    {(watchedServiceType && ['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType)) ? (
                                                        <FormField control={form.control} name="productCollectedOrInstalled" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Produto Coletado/Instalado</FormLabel>
                                                                <FormControl><Input placeholder="Descreva o produto" {...field} value={field.value || ''} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}/>
                                                    ) : null}

                                                    {serviceRequiresCodes ? (
                                                        <>
                                                            <FormField control={form.control} name="symptomCode" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Código de Sintoma</FormLabel>
                                                                    <FormControl>
                                                                        <SearchableSelect value={field.value || ""} onChange={field.onChange} placeholder="Selecione o sintoma" options={symptomCodes[watchedEquipmentType as keyof typeof symptomCodes]?.map(s => ({ value: s.code, label: `${s.code} - ${s.description}` })) || []} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                            <FormField control={form.control} name="repairCode" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Código de Reparo {(watchedServiceType === 'visita_orcamento_samsung' || watchedServiceType === 'reparo_samsung') && '(Opcional)'}</FormLabel>
                                                                    <FormControl>
                                                                        <SearchableSelect value={field.value || ""} onChange={field.onChange} placeholder="Selecione o reparo" options={repairCodes[watchedEquipmentType as keyof typeof repairCodes]?.map(r => ({ value: r.code, label: `${r.code} - ${r.description}` })) || []} />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                        </>
                                                    ) : watchedServiceType === 'visita_assurant' ? (
                                                        <>
                                                            <FormField control={form.control} name="defectFound" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Defeito constatado</FormLabel>
                                                                    <FormControl><Input placeholder="Descreva o defeito constatado" {...field} value={field.value || ''} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                            <FormField control={form.control} name="partsRequested" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Peças solicitadas</FormLabel>
                                                                    <FormControl><Input placeholder="Liste as peças solicitadas" {...field} value={field.value || ''} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                        </>
                                                    ) : null}
                                                </div>
                                            )}

                                            {currentStep === 4 && (
                                                <div className="space-y-4 md:space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                                                    {showReplacedPart && (
                                                        <FormField control={form.control} name="replacedPart" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Peça Trocada (Opcional)</FormLabel>
                                                                <FormControl><Input placeholder="Ex: Placa principal BN94-12345A" {...field} value={field.value || ''} /></FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}/>
                                                    )}

                                                    <FormField control={form.control} name="cleaningPerformed" render={({ field }) => (
                                                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                                            <div className="space-y-0.5">
                                                                <FormLabel>Foi feita limpeza nesta OS?</FormLabel>
                                                                <FormDescription className="text-xs">Marque somente se você executou a limpeza.</FormDescription>
                                                            </div>
                                                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                        </FormItem>
                                                    )}/>

                                                    <FormField control={form.control} name="observations" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Observações {form.watch('isFinalized') && '(Opcional)'}</FormLabel>
                                                            <FormControl><Textarea placeholder="Descreva observações adicionais aqui..." {...field} value={field.value || ''} /></FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>

                                                    <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 p-4">
                                                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-200">
                                                            <Eye className="h-4 w-4" /> Resumo para Envio
                                                        </h4>
                                                        <pre className="whitespace-pre-wrap text-[13px] md:text-sm font-sans text-muted-foreground bg-white dark:bg-slate-950 p-3 rounded-md border">{previewText}</pre>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex gap-3 pt-4 border-t mt-4">
                                                {currentStep > 1 && (
                                                    <Button type="button" variant="outline" onClick={handlePrevStep} className="flex-1 h-12 font-medium text-base shadow-none">
                                                        Voltar
                                                    </Button>
                                                )}

                                                {currentStep < totalSteps ? (
                                                    <Button type="button" onClick={handleNextStep} className="flex-1 h-12 font-medium text-base shadow-none">
                                                        Próximo
                                                    </Button>
                                                ) : (
                                                    <Button type="button" onClick={form.handleSubmit(onSubmit)} disabled={form.formState.isSubmitting || osIsSaved} className="flex-1 h-12 text-base md:text-sm font-medium shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                                        {form.watch('isFinalized') ? (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <CheckCircle className="h-4 w-4" /> {form.formState.isSubmitting ? 'Salvando...' : osIsSaved ? 'Salva!' : 'Salvar OS'}
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <AlertTriangle className="h-4 w-4" /> {form.formState.isSubmitting ? 'Salvando...' : osIsSaved ? 'Salva!' : 'Salvar Pendência'}
                                                            </div>
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
</form>
                                    </Form>
                                </CardContent>
                            </Card>

                            <div className="lg:sticky lg:top-24 h-fit space-y-4">
                                <Card className={`w-full transition-all duration-300 ${osIsSaved ? 'opacity-100 border-green-200 dark:border-green-900/50' : 'opacity-50'}`}>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Texto Gerado</CardTitle>
                                            <CardDescription>{osIsSaved ? 'OS salva com sucesso. Copie o texto.' : 'Aguardando salvamento da OS.'}</CardDescription>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={handleCopy} disabled={!osIsSaved}>
                                            <Copy className="h-5 w-5" />
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        {osIsSaved ? (
                                            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md font-sans">{generatedText}</pre>
                                        ) : (
                                            <div className="text-center text-muted-foreground py-10">
                                                <p>Conclua todas as etapas e clique em "Salvar OS" para gerar o texto final.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                     <CardFooter className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={handleNewOS} disabled={!osIsSaved}>
                                            Nova OS
                                        </Button>
                                        <Button variant="destructive" size="sm" onClick={handleClearForm}>
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Limpar Formulário
                                        </Button>
                                    </CardFooter>
                                </Card>
                                
                                <ChecklistSection 
                                    checklistTemplates={checklistTemplates}
                                    routeStopData={currentRouteStop}
                                    mainFormData={allFormValues}
                                    checklistData={checklistData}
                                    onChecklistDataChange={setChecklistData}
                                    technicianName={technicians.find(t => t.id === watchedTechnician)?.name}
                                />
                            </div>
                        </div>
            {/* Success Dialog */}
            <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-green-600 dark:text-green-400 flex items-center gap-2">
                            <CheckCircle className="h-6 w-6" /> OS Lançada com Sucesso!
                        </DialogTitle>
                        <DialogDescription>
                            Ordem de Serviço salva no banco de dados. Copie o resumo formatado abaixo:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="my-4">
                        <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md font-sans max-h-[300px] overflow-y-auto">
                            {generatedText}
                        </pre>
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button
                            className="w-full sm:flex-1"
                            onClick={handleCopy}
                        >
                            <Copy className="mr-2 h-4 w-4" /> Copiar Texto
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full sm:flex-1"
                            onClick={() => {
                                setIsSuccessDialogOpen(false);
                                handleNewOS();
                            }}
                        >
                            Nova OS
                        </Button>
                    </DialogFooter>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 mt-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Camera className="h-4 w-4 shrink-0" />
                            <span>Quer registrar fotos e a descrição do reparo desta OS?</span>
                        </div>
                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                            <Link href={`/reports?os=${encodeURIComponent(allFormValues.serviceOrderNumber || "")}`} target="_blank">
                                Preencher Relatório <Badge variant="secondary" className="ml-2 font-normal">opcional</Badge>
                            </Link>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
  );
}

    
