
"use client";

import { useState, useEffect, useMemo, Suspense, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isAfter, startOfMonth, startOfYear, subDays, differenceInDays } from "date-fns";
import { type Technician, type ServiceOrder, type Preset, type Return, type Indicator, type Route, type RouteStop, type Chargeback, type RoutePart, type ChecklistTemplate, type ChecklistField } from "@/lib/data";
import { Button } from "@/components/ui/button";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, CheckCircle, ChevronsUpDown, Copy, Wrench, LogIn, ListTree, ClipboardCheck, ShieldCheck, Bookmark, Package, PackageOpen, History, Trophy, Sparkles, Target, ChevronDown, Route as RouteIcon, Eye, Calendar, MapPin, Sun, Car, MessageSquare, Download, Users, User, Percent, Link as LinkIcon, Trash2, TrendingUp, ScanLine, QrCode, XCircle } from "lucide-react";
import Link from 'next/link';
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, addDoc, Timestamp, query, orderBy, limit, where } from "firebase/firestore";
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
import dynamic from "next/dynamic";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FirebaseSetupPrompt } from "@/components/FirebaseSetupPrompt";
import { useAppData } from "@/context/AppDataContext";

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
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const handleNextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['equipmentType', 'technician', 'serviceOrderNumber'];
    } else if (currentStep === 2) {
      if (!form.getValues('isFinalized')) {
          fieldsToValidate = ['pendingReason'];
      } else {
          const routeParts = currentRouteStop?.parts || [];
          const unreviewed = routeParts.filter((p: { code: string }) => partsStatus[p.code] === null || partsStatus[p.code] === undefined);
          if (unreviewed.length > 0) {
              toast({
                  variant: "destructive",
                  title: "⚠️ Confirme o status das peças!",
                  description: `${unreviewed.length} peça(s) ainda sem confirmação.`,
              });
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
    const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
    const [fields, setFields] = useState<FieldWithPosition[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTargetField, setScanTargetField] = useState<string | null>(null);

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
            
            fields.forEach(field => {
                const value = checklistData[field.id];
                
                if (value !== undefined && value !== null) {
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
            });

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
                                {checklistTemplates.map(t => (
                                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
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
                                        ) : (
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

export default function OsFormPage() {
  const { symptomCodes, repairCodes, technicians, presets, activeRoutes, checklistTemplates, visitTemplate, dataFetchError, refreshDynamicData } = useAppData();
  const [generatedText, setGeneratedText] = useState("");
  const [osIsSaved, setOsIsSaved] = useState(false);
  const [assistantName, setAssistantName] = useState("");
  const [currentRouteStop, setCurrentRouteStop] = useState<RouteStop | null>(null);
  const [partsStatus, setPartsStatus] = useState<Record<string, 'used' | 'not_used' | null>>({});
  const [partsUsedQuantity, setPartsUsedQuantity] = useState<Record<string, number>>({});
  const [checklistData, setChecklistData] = useState<Record<string, string | boolean>>({});
const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const handleNextStep = async () => {
    let fieldsToValidate: any[] = [];
    if (currentStep === 1) {
      fieldsToValidate = ['equipmentType', 'technician', 'serviceOrderNumber'];
    } else if (currentStep === 2) {
      if (!form.getValues('isFinalized')) {
          fieldsToValidate = ['pendingReason'];
      } else {
          const routeParts = currentRouteStop?.parts || [];
          const unreviewed = routeParts.filter((p: { code: string }) => partsStatus[p.code] === null || partsStatus[p.code] === undefined);
          if (unreviewed.length > 0) {
              toast({
                  variant: "destructive",
                  title: "⚠️ Confirme o status das peças!",
                  description: `${unreviewed.length} peça(s) ainda sem confirmação.`,
              });
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
    },
  });

  const allFormValues = form.watch();

   useEffect(() => {
        try {
            const savedFormData = localStorage.getItem('serviceOrderFormData');
            if (savedFormData) {
                const parsedData = JSON.parse(savedFormData);
                form.reset(parsedData);
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
      setValue("symptomCode", selectedPreset.symptomCode);
      setValue("repairCode", selectedPreset.repairCode);
      setValue("replacedPart", selectedPreset.replacedPart || "");
      setValue("observations", selectedPreset.observations || "");
    } else if (watchedPreset === "none") {
      setValue("symptomCode", "");
      setValue("repairCode", "");
      setValue("replacedPart", "");
      setValue("observations", "");
    }
  }, [watchedPreset, presets, setValue]);

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
        setCurrentRouteStop(foundStop);
        
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
        setCurrentRouteStop(null);
        if (previousOsRef.current !== null) {
            setOsIsSaved(false);
            previousOsRef.current = null;
        }
    }
  }, [watchedServiceOrderNumber, activeRoutes, setValue]);
  
  useEffect(() => {
    const replacedPartText = (currentRouteStop?.parts || [])
        .filter((p: { code: string; quantity: number }) => partsStatus[p.code] === 'used')
        .map((p: { code: string; quantity: number }) => {
            const usedQty = partsUsedQuantity[p.code] || p.quantity;
            return usedQty > 1 ? `${p.code} (x${usedQty})` : p.code;
        })
        .join(', ');
    setValue("replacedPart", replacedPartText);
  }, [partsStatus, partsUsedQuantity, currentRouteStop, setValue]);


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
        data.observations ? `- **Observações:** ${data.observations}` : ''
    ].filter(Boolean);

    return [...baseTextParts, ...serviceSpecificParts, ...optionalParts].filter(Boolean).join('\n');
  }, [allFormValues, technicians, assistantName, symptomCodes, repairCodes]);

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
            observations: data.observations || '',
            defectFound: data.defectFound || '',
            partsRequested: data.partsRequested || '',
            productCollectedOrInstalled: data.productCollectedOrInstalled || '',
            collectionType: data.collectionType as any,
            cleaningPerformed: data.cleaningPerformed || false,
            isFinalized: data.isFinalized !== undefined ? data.isFinalized : true,
            pendingReason: data.pendingReason || '',
        };

        await addDoc(collection(db, "serviceOrders"), newServiceOrder);
        setOsIsSaved(true);
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
    const technicianBeforeReset = form.getValues("technician");
    form.reset({
        technician: technicianBeforeReset,
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
    });
    setGeneratedText("");
    setOsIsSaved(false);
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
    localStorage.removeItem('assistantName');
    setAssistantName("");
    form.reset({ technician: "" });
    toast({ title: "Formulário Limpo", description: "Todos os dados foram removidos." });
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
    return <FirebaseSetupPrompt />;
  }

  return (
    <div className="max-w-7xl mx-auto w-full animate-in fade-in ease-out duration-300">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            <Card className="w-full border-none shadow-none bg-transparent md:border-solid md:shadow-sm md:bg-card">
                                <CardHeader className="px-1 pt-0 pb-3 md:p-6 space-y-4">
                                    <div>
                                        <CardTitle className="text-[22px] md:text-2xl tracking-tight leading-none">Lançamento Rápido de OS</CardTitle>
                                        <CardDescription className="text-xs md:text-sm mt-1 leading-tight text-muted-foreground/80 md:text-muted-foreground">
                                            Preencha os campos abaixo para gerar o texto da ordem de serviço.
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
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
                                                <div key={s.step} className="flex items-center min-w-max">
                                                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                                                        isActive ? 'border-[#1a85ff] bg-[#1a85ff] text-white' : 
                                                        isCompleted ? 'border-[#1a85ff] bg-transparent text-[#1a85ff]' : 
                                                        'border-muted bg-transparent text-muted-foreground'
                                                    }`}>
                                                        <Icon className="h-4 w-4" />
                                                    </div>
                                                    <span className={`ml-2 text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                        {s.title}
                                                    </span>
                                                    {index < 3 && <div className={`w-8 md:w-12 h-[2px] ml-2 ${isCompleted ? 'bg-[#1a85ff]' : 'bg-muted'}`} />}
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
                                                        <FormItem>
                                                            <FormLabel>Tipo de Aparelho</FormLabel>
                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                <FormControl><SelectTrigger><SelectValue placeholder="Selecione o tipo de aparelho" /></SelectTrigger></FormControl>
                                                                <SelectContent>
                                                                    <SelectItem value="TV/AV">TV/AV</SelectItem>
                                                                    <SelectItem value="DA">DA (Linha Branca)</SelectItem>
                                                                </SelectContent>
                                                            </Select>
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
                                                        <FormField control={form.control} name="technician" render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>Técnico</FormLabel>
                                                                <Select onValueChange={field.onChange} value={field.value}>
                                                                    <FormControl><SelectTrigger><SelectValue placeholder="Técnico" /></SelectTrigger></FormControl>
                                                                    <SelectContent>
                                                                        {technicians.map((tech) => (
                                                                            <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
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
                                                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
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
                                                        <div id="parts-section" className="space-y-3 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 p-4">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="space-y-0.5">
                                                                    <Label className="font-semibold flex items-center gap-2 text-amber-800 dark:text-amber-300">
                                                                        <Package className="h-4 w-4" />
                                                                        Peças da Rota — Revisão Obrigatória
                                                                    </Label>
                                                                    <p className="text-xs text-muted-foreground">Marque cada peça como Usada ou Não Usada antes de salvar</p>
                                                                </div>
                                                                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${reviewedCount === routeParts.length ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                                                                    {reviewedCount}/{routeParts.length}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col gap-3 mt-1">
                                                                {routeParts.map((part: { code: string; quantity: number; description?: string }) => {
                                                                    const status = partsStatus[part.code] ?? null;
                                                                    return (
                                                                        <div key={part.code} className={`rounded-lg border-2 p-3 transition-all duration-200 ${status === null ? 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900' : status === 'used' ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-950/30' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40'}`}>
                                                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                                                                                <div className="flex-1 min-w-0 flex flex-col">
                                                                                    <div>
                                                                                        <span className="text-sm font-mono font-bold tracking-wide">{part.code}</span>
                                                                                        {part.quantity > 1 && <span className="ml-2 text-xs text-muted-foreground">x{part.quantity}</span>}
                                                                                        {status === null && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">⚠ Pendente</span>}
                                                                                    </div>
                                                                                    {part.description && (
                                                                                        <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1" title={part.description}>
                                                                                            {part.description}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="flex flex-col gap-2 w-full sm:w-auto">
                                                                                    <div className="flex gap-2">
                                                                                        <button type="button" onClick={() => handlePartStatusChange(part.code, 'used')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all duration-150 min-h-[44px] cursor-pointer ${status === 'used' ? 'bg-green-500 border-green-500 text-white shadow-sm' : 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400 bg-white dark:bg-transparent hover:bg-green-50 dark:hover:bg-green-950/30'}`}>
                                                                                            <Check className="h-4 w-4" /> USADA
                                                                                        </button>
                                                                                        <button type="button" onClick={() => handlePartStatusChange(part.code, 'not_used')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all duration-150 min-h-[44px] cursor-pointer ${status === 'not_used' ? 'bg-slate-500 border-slate-500 text-white shadow-sm' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400 bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-slate-900/30'}`}>
                                                                                            <XCircle className="h-4 w-4" /> NÃO USADA
                                                                                        </button>
                                                                                    </div>
                                                                                    {status === 'used' && part.quantity > 1 && (
                                                                                        <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/40 px-3 py-2 rounded-md border border-green-200 dark:border-green-800 animate-in fade-in slide-in-from-top-2 mt-1">
                                                                                            <span className="text-xs font-bold text-green-800 dark:text-green-300">Qtd Usada:</span>
                                                                                            <div className="flex items-center gap-3">
                                                                                                <button type="button" onClick={() => handleQuantityChange(part.code, (partsUsedQuantity[part.code] || part.quantity) - 1)} disabled={(partsUsedQuantity[part.code] || part.quantity) <= 1} className="w-7 h-7 flex items-center justify-center rounded-full bg-green-300 dark:bg-green-700 text-green-900 dark:text-green-100 disabled:opacity-50 font-bold hover:bg-green-400 dark:hover:bg-green-600 transition-colors cursor-pointer disabled:cursor-not-allowed">-</button>
                                                                                                <span className="font-bold text-sm w-4 text-center text-green-900 dark:text-green-100">{partsUsedQuantity[part.code] || part.quantity}</span>
                                                                                                <button type="button" onClick={() => handleQuantityChange(part.code, (partsUsedQuantity[part.code] || part.quantity) + 1)} disabled={(partsUsedQuantity[part.code] || part.quantity) >= part.quantity} className="w-7 h-7 flex items-center justify-center rounded-full bg-green-300 dark:bg-green-700 text-green-900 dark:text-green-100 disabled:opacity-50 font-bold hover:bg-green-400 dark:hover:bg-green-600 transition-colors cursor-pointer disabled:cursor-not-allowed">+</button>
                                                                                            </div>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
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
                                                    <Button type="button" onClick={handlePrevStep} className="flex-1 h-12 bg-[#9900ff] hover:bg-[#8000d6] text-white font-medium text-base shadow-none">
                                                        Voltar
                                                    </Button>
                                                )}
                                                
                                                {currentStep < totalSteps ? (
                                                    <Button type="button" onClick={handleNextStep} className="flex-1 h-12 bg-[#1a85ff] hover:bg-[#156fc2] text-white font-medium text-base shadow-none">
                                                        Próximo
                                                    </Button>
                                                ) : (
                                                    <Button type="button" onClick={form.handleSubmit(onSubmit)} className="flex-1 h-12 bg-[#1a85ff] hover:bg-[#156fc2] text-white text-base md:text-sm font-medium shadow-none transition-all">
                                                        {form.watch('isFinalized') ? (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <CheckCircle className="h-4 w-4" /> Salvar OS
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-center gap-2">
                                                                <AlertTriangle className="h-4 w-4" /> Salvar Pendência
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
        </div>
  );
}

    
