
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isAfter, startOfMonth } from "date-fns";
import { type Technician, type ServiceOrder, type Preset } from "@/lib/data";
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
import { Check, ChevronsUpDown, Copy, Wrench, LogIn, ListTree, ClipboardCheck, ShieldCheck, Bookmark, Package, PackageOpen } from "lucide-react";
import Link from 'next/link';
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, addDoc } from "firebase/firestore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type CodeItem = { code: string; description: string; };
type CodeCategory = { "TV/AV": CodeItem[]; "DA": CodeItem[]; };

const formSchema = z.object({
  technician: z.string().min(1, "Selecione um técnico."),
  serviceOrderNumber: z.string().min(1, "Insira o número da OS."),
  serviceType: z.string().min(1, "Selecione o tipo de atendimento."),
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
}).superRefine((data, ctx) => {
  const serviceRequiresCodes = !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType);
  
  if (serviceRequiresCodes) {
    if (!data.symptomCode || data.symptomCode.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o código de sintoma.",
        path: ["symptomCode"],
      });
    }

    if (data.serviceType !== 'visita_orcamento_samsung') {
      if (!data.repairCode || data.repairCode.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecione o código de reparo.",
          path: ["repairCode"],
        });
      }
    }
  }

  if (['coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType)) {
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

function Header() {
    return (
        <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
            <Link href="/" className="flex items-center gap-3 text-primary">
                <Wrench className="w-7 h-7" />
                <h1 className="text-2xl font-bold text-foreground">SmartService OS</h1>
            </Link>
            <Button asChild variant="outline">
                <Link href="/admin">
                    <LogIn className="mr-2 h-4 w-4" /> Área Admin
                </Link>
            </Button>
        </header>
    );
}

function PerformanceDashboard({ technicians, serviceOrders }: { technicians: Technician[], serviceOrders: ServiceOrder[] }) {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);

    const serviceOrdersThisMonth = serviceOrders.filter(os =>
        isAfter(os.date, startOfCurrentMonth)
    );

    const performanceData = technicians.map(tech => {
        const techOrdersThisMonth = serviceOrdersThisMonth.filter(os =>
            os.technicianId === tech.id
        );

        const osCount = techOrdersThisMonth.length;
        
        const revenue = techOrdersThisMonth.reduce((total, os) => {
            if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
                return total + os.samsungBudgetValue;
            }
            return total;
        }, 0);

        const goal = tech.goal || 0;
        const progress = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;

        return {
            ...tech,
            revenue,
            goal,
            progress,
            osCount
        };
    }).sort((a, b) => (b.goal > 0 ? (b.revenue / b.goal) : 0) - (a.goal > 0 ? (a.revenue / a.goal) : 0));

    const osByServiceType = serviceOrdersThisMonth.reduce((acc, os) => {
        if (!acc[os.serviceType]) {
            acc[os.serviceType] = 0;
        }
        acc[os.serviceType]++;
        return acc;
    }, {} as Record<ServiceOrder['serviceType'], number>);

    const serviceTypeConfig: Record<string, { label: string; icon: React.ElementType }> = {
        reparo_samsung: { label: "Reparo Samsung", icon: Wrench },
        visita_orcamento_samsung: { label: "Visita Orçamento Samsung", icon: ClipboardCheck },
        visita_assurant: { label: "Visita Assurant", icon: ShieldCheck },
        coleta_eco_rma: { label: "Coleta Eco /RMA", icon: Package },
        instalacao_inicial: { label: "Instalação Inicial", icon: PackageOpen },
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Desempenho do Mês</CardTitle>
                    <CardDescription>
                        Acompanhe o faturamento dos técnicos em relação às suas metas mensais.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    {performanceData.map(tech => (
                        <Card key={tech.id}>
                            <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg">{tech.name}</CardTitle>
                                    <span className="text-sm font-medium text-muted-foreground">{tech.osCount} OS</span>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <Progress value={tech.progress} />
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>
                                            {tech.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                        <span className="font-semibold text-foreground">
                                            Meta: {tech.goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ListTree className="h-5 w-5" />
                        <span>OS por Atendimento no Mês</span>
                    </CardTitle>
                    <CardDescription>Distribuição das ordens de serviço por tipo no mês corrente.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    {Object.entries(serviceTypeConfig).map(([type, config]) => {
                        const count = osByServiceType[type as keyof typeof osByServiceType] || 0;
                        if (!config) return null; // Safeguard if a type is in data but not config
                        const Icon = config.icon;
                        return (
                            <div key={type} className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Icon className="h-4 w-4" />
                                    <span>{config.label}</span>
                                </div>
                                <span className="font-bold">{count}</span>
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    );
}

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

export default function ServiceOrderPage() {
  const [generatedText, setGeneratedText] = useState("");
  const { toast } = useToast();
  const [symptomCodes, setSymptomCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [repairCodes, setRepairCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [assistantName, setAssistantName] = useState("");

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
    },
  });

  const watchedServiceType = form.watch("serviceType");
  const watchedEquipmentType = form.watch("equipmentType");
  const watchedTechnician = form.watch("technician");
  const watchedPreset = form.watch("presetId");

  const fetchServiceOrders = async () => {
    try {
        const querySnapshot = await getDocs(collection(db, "serviceOrders"));
        const orders = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date.toDate(), // Convert Firestore Timestamp to Date
            } as ServiceOrder;
        });
        setServiceOrders(orders);
    } catch (error) {
        console.error("Error fetching service orders:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar OS",
            description: "Não foi possível carregar os dados das Ordens de Serviço.",
        });
        setServiceOrders([]);
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
        try {
            const [symptomsDoc, repairsDoc, techsSnapshot, presetsSnapshot] = await Promise.all([
                getDoc(doc(db, "codes", "symptoms")),
                getDoc(doc(db, "codes", "repairs")),
                getDocs(collection(db, "technicians")),
                getDocs(collection(db, "presets"))
            ]);

            if (symptomsDoc.exists()) setSymptomCodes(symptomsDoc.data() as CodeCategory);
            if (repairsDoc.exists()) setRepairCodes(repairsDoc.data() as CodeCategory);
            if (!techsSnapshot.empty) {
                const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);
            }
            if (!presetsSnapshot.empty) {
                const presetsData = presetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Preset));
                setPresets(presetsData);
            }
        } catch (error) {
            console.error("Error fetching initial data:", error);
            toast({
                variant: "destructive",
                title: "Erro ao carregar dados",
                description: "Não foi possível buscar alguns dados. A página pode não funcionar corretamente.",
            });
        }
    };
    
    fetchInitialData();
    fetchServiceOrders();
  }, [toast]);

  useEffect(() => {
    const savedTechnician = localStorage.getItem("selectedTechnician");
    if (savedTechnician) {
      form.setValue("technician", savedTechnician);
    }
    const savedAssistant = localStorage.getItem("assistantName");
    if (savedAssistant) {
      setAssistantName(savedAssistant);
    }
  }, [form]);

  useEffect(() => {
    if (watchedTechnician) {
      localStorage.setItem("selectedTechnician", watchedTechnician);
    }
  }, [watchedTechnician]);

  useEffect(() => {
    localStorage.setItem("assistantName", assistantName);
  }, [assistantName]);

  useEffect(() => {
    form.resetField("symptomCode");
    form.resetField("repairCode");
    form.resetField("presetId", { defaultValue: "none" });
    form.resetField("replacedPart");
    form.resetField("observations");
  }, [watchedEquipmentType, form]);

  useEffect(() => {
    const selectedPreset = presets.find(p => p.id === watchedPreset);
    if (selectedPreset) {
      form.setValue("symptomCode", selectedPreset.symptomCode);
      form.setValue("repairCode", selectedPreset.repairCode);
      form.setValue("replacedPart", selectedPreset.replacedPart || "");
      form.setValue("observations", selectedPreset.observations || "");
    } else if (watchedPreset === "none") {
      form.setValue("symptomCode", "");
      form.setValue("repairCode", "");
      form.setValue("replacedPart", "");
      form.setValue("observations", "");
    }
  }, [watchedPreset, presets, form]);


  const onSubmit = async (data: FormValues) => {
    // Generate text first
    let technicianName = technicians.find(t => t.id === data.technician)?.name || '';
    if (assistantName) {
      technicianName = `${technicianName} / ${assistantName}`;
    }
    const today = format(new Date(), "dd/MM/yyyy");

    let serviceDetails = '';
    const serviceTypeLabels: Record<string, string> = {
        reparo_samsung: `Reparo Samsung - ${data.samsungRepairType || ''}`,
        visita_orcamento_samsung: `Visita orçamento Samsung - Aprovado: ${data.samsungBudgetApproved ? 'Sim' : 'Não'}${data.samsungBudgetApproved && data.samsungBudgetValue ? `, Valor: R$ ${data.samsungBudgetValue}` : ''}`,
        visita_assurant: 'Visita Assurant',
        coleta_eco_rma: 'Coleta Eco /RMA',
        instalacao_inicial: 'Instalação Inicial',
    };
    serviceDetails = serviceTypeLabels[data.serviceType] || data.serviceType;

    const baseTextParts = [
      `**Data: ${today} - ${data.equipmentType}**`,
      `**Ordem de Serviço: ${data.serviceOrderNumber}**`,
      `- **Técnico:** ${technicianName}`,
      `- **Atendimento:** ${serviceDetails}`,
    ];

    let serviceSpecificParts: string[] = [];

    const serviceNeedsCodes = !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType);

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
    } else if (['coleta_eco_rma', 'instalacao_inicial'].includes(data.serviceType)) {
        if(data.productCollectedOrInstalled) serviceSpecificParts.push(`- **Produto Coletado/Instalado:** ${data.productCollectedOrInstalled}`);
    }

    const optionalParts = [
        data.replacedPart ? `- **Peça Trocada:** ${data.replacedPart}` : '',
        data.observations ? `- **Observações:** ${data.observations}` : ''
    ].filter(Boolean);

    const text = [...baseTextParts, ...serviceSpecificParts, ...optionalParts].filter(Boolean).join('\n');
    setGeneratedText(text);

    // Save to Firestore
    try {
        const newServiceOrder = {
            technicianId: data.technician,
            serviceOrderNumber: data.serviceOrderNumber,
            serviceType: data.serviceType,
            equipmentType: data.equipmentType,
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
        };

        await addDoc(collection(db, "serviceOrders"), newServiceOrder);
        
        toast({
            title: "OS Lançada com Sucesso!",
            description: `A ordem de serviço ${data.serviceOrderNumber} foi salva.`,
        });

        fetchServiceOrders(); // Refetch data for dashboard

        const technicianBeforeReset = form.getValues("technician");
        
        form.reset({
            technician: technicianBeforeReset, // Keep technician selected
            serviceOrderNumber: "",
            serviceType: "",
            samsungRepairType: "",
            samsungBudgetApproved: false,
            samsungBudgetValue: "",
            equipmentType: "", // Reset equipment type
            presetId: "none",
            symptomCode: "",
            repairCode: "",
            replacedPart: "",
            observations: "",
            defectFound: "",
            partsRequested: "",
            productCollectedOrInstalled: "",
        });

    } catch (error) {
        console.error("Error adding service order: ", error);
        toast({
            variant: "destructive",
            title: "Erro ao Salvar OS",
            description: "Não foi possível salvar a ordem de serviço no banco de dados.",
        });
    }
  };

  const handleCopy = () => {
    if (!generatedText) return;
    navigator.clipboard.writeText(generatedText)
      .then(() => {
        toast({
          title: "Texto Copiado!",
          description: "O texto formatado da OS foi copiado para sua área de transferência.",
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

  const filteredPresets = presets.filter(p => p.equipmentType === watchedEquipmentType);
  const serviceRequiresCodes = !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);
  const showReplacedPart = !['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);

  return (
    <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow p-4 sm:p-6 md:p-8">
            <div className="max-w-4xl mx-auto">
                <Tabs defaultValue="os-form" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6">
                        <TabsTrigger value="os-form">Lançar OS</TabsTrigger>
                        <TabsTrigger value="dashboard">Desempenho do Mês</TabsTrigger>
                    </TabsList>
                    <TabsContent value="os-form">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <Card className="w-full">
                                <CardHeader>
                                    <CardTitle>Lançamento Rápido de OS</CardTitle>
                                    <CardDescription>
                                        Preencha os campos abaixo para gerar o texto da ordem de serviço.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Form {...form}>
                                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                            
                                            <FormField
                                                control={form.control}
                                                name="presetId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel className="flex items-center gap-2"><Bookmark className="h-4 w-4" />Preset de Códigos (Opcional)</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value || 'none'} disabled={!watchedEquipmentType || !serviceRequiresCodes}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder={
                                                                        !watchedEquipmentType ? "Selecione um tipo de aparelho primeiro" 
                                                                        : !serviceRequiresCodes ? "Não aplicável para este atendimento"
                                                                        : "Selecione um preset para preencher os códigos"
                                                                    } />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="none">Nenhum</SelectItem>
                                                                {filteredPresets.map((preset) => (
                                                                    <SelectItem key={preset.id} value={preset.id}>
                                                                        {preset.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="technician"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Técnico</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione o técnico" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {technicians.map((tech) => (
                                                                    <SelectItem key={tech.id} value={tech.id}>
                                                                        {tech.name}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            
                                            <div className="space-y-2">
                                                <Label htmlFor="assistant">Auxiliar (Opcional)</Label>
                                                <Input
                                                    id="assistant"
                                                    placeholder="Digite o nome do auxiliar"
                                                    value={assistantName}
                                                    onChange={(e) => setAssistantName(e.target.value)}
                                                />
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="serviceOrderNumber"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Número da OS</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Digite o número da OS" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="serviceType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Tipo de Atendimento</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                                                            </FormControl>
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
                                                )}
                                            />

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
                                            
                                            {serviceRequiresCodes ? (
                                                <>
                                                    <FormField control={form.control} name="symptomCode" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Código de Sintoma</FormLabel>
                                                                <FormControl>
                                                                <SearchableSelect
                                                                    value={field.value || ""}
                                                                    onChange={field.onChange}
                                                                    placeholder="Selecione o sintoma"
                                                                    options={symptomCodes[watchedEquipmentType as keyof typeof symptomCodes]?.map(s => ({ value: s.code, label: `${s.code} - ${s.description}` })) || []}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}/>
                                                    <FormField control={form.control} name="repairCode" render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>Código de Reparo {watchedServiceType === 'visita_orcamento_samsung' && '(Opcional)'}</FormLabel>
                                                                <FormControl>
                                                                <SearchableSelect
                                                                    value={field.value || ""}
                                                                    onChange={field.onChange}
                                                                    placeholder="Selecione o reparo"
                                                                    options={repairCodes[watchedEquipmentType as keyof typeof repairCodes]?.map(r => ({ value: r.code, label: `${r.code} - ${r.description}` })) || []}
                                                                />
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
                                            ) : ['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType) ? (
                                                <FormField control={form.control} name="productCollectedOrInstalled" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Produto Coletado/Instalado</FormLabel>
                                                        <FormControl><Input placeholder="Descreva o produto" {...field} value={field.value || ''} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}/>
                                            ) : null}
                                            
                                            {showReplacedPart && (
                                                <FormField control={form.control} name="replacedPart" render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Peça Trocada (Opcional)</FormLabel>
                                                        <FormControl><Input placeholder="Ex: Placa principal BN94-12345A" {...field} value={field.value || ''} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}/>
                                            )}

                                            <FormField control={form.control} name="observations" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Observações (Opcional)</FormLabel>
                                                    <FormControl><Textarea placeholder="Descreva observações adicionais aqui..." {...field} value={field.value || ''} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}/>

                                            <Button type="submit" className="w-full">Gerar Texto e Salvar OS</Button>
                                        </form>
                                    </Form>
                                </CardContent>
                            </Card>

                            <div className="lg:sticky lg:top-24 h-fit">
                                <Card className={`w-full transition-all duration-300 ${generatedText ? 'opacity-100' : 'opacity-50'}`}>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Texto Gerado</CardTitle>
                                            <CardDescription>Copie o texto abaixo.</CardDescription>
                                        </div>
                                        <Button variant="ghost" size="icon" onClick={handleCopy} disabled={!generatedText}>
                                            <Copy className="h-5 w-5" />
                                        </Button>
                                    </CardHeader>
                                    <CardContent>
                                        {generatedText ? (
                                            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md font-sans">{generatedText}</pre>
                                        ) : (
                                            <div className="text-center text-muted-foreground py-10">
                                                <p>O texto formatado da sua OS aparecerá aqui.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="dashboard">
                        <PerformanceDashboard technicians={technicians} serviceOrders={serviceOrders} />
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    </div>
  );
}
