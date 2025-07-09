
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isAfter, startOfMonth } from "date-fns";
import {
  technicians as initialTechnicians,
  symptomCodes as initialSymptomCodes,
  repairCodes as initialRepairCodes,
  serviceOrders as allServiceOrders,
  type Technician,
  type ServiceOrder,
} from "@/lib/data";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronsUpDown, Copy, Wrench, LogIn, ListTree, ClipboardCheck, ShieldCheck } from "lucide-react";
import Link from 'next/link';
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
  symptomCode: z.string().optional(),
  repairCode: z.string().optional(),
  replacedPart: z.string().optional(),
  observations: z.string().optional(),
  defectFound: z.string().optional(),
  partsRequested: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.serviceType !== 'visita_assurant') {
    // Symptom is required for all non-assurant types
    if (!data.symptomCode || data.symptomCode.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione o código de sintoma.",
        path: ["symptomCode"],
      });
    }

    // Repair is required for all non-assurant and non-budget types
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

function PerformanceDashboard({ technicians }: { technicians: Technician[] }) {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const OS_VALUE = 25.50;

    const serviceOrdersThisMonth = allServiceOrders.filter(os =>
        isAfter(os.date, startOfCurrentMonth)
    );

    const performanceData = technicians.map(tech => {
        const techOrdersThisMonth = serviceOrdersThisMonth.filter(os =>
            os.technicianId === tech.id
        );

        const osCount = techOrdersThisMonth.length;
        const budgetValue = techOrdersThisMonth
            .filter(os => os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue)
            .reduce((total, os) => total + (os.samsungBudgetValue || 0), 0);
        
        const revenue = (osCount * OS_VALUE) + budgetValue;
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

    const serviceTypeConfig: Record<ServiceOrder['serviceType'], { label: string; icon: React.ElementType }> = {
        reparo_samsung: { label: "Reparo Samsung", icon: Wrench },
        visita_orcamento_samsung: { label: "Visita Orçamento Samsung", icon: ClipboardCheck },
        visita_assurant: { label: "Visita Assurant", icon: ShieldCheck }
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
                        const Icon = config.icon;
                        const count = osByServiceType[type as keyof typeof osByServiceType] || 0;
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
  const [symptomCodes, setSymptomCodes] = useState<CodeCategory>(initialSymptomCodes);
  const [repairCodes, setRepairCodes] = useState<CodeCategory>(initialRepairCodes);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      technician: "",
      serviceOrderNumber: "",
      serviceType: "",
      equipmentType: "",
      symptomCode: "",
      repairCode: "",
      samsungBudgetApproved: false,
      defectFound: "",
      partsRequested: "",
    },
  });

  const watchedServiceType = form.watch("serviceType");
  const watchedEquipmentType = form.watch("equipmentType");
  const watchedTechnician = form.watch("technician");

  useEffect(() => {
    const fetchCodes = async () => {
        try {
            const symptomsDoc = await getDoc(doc(db, "codes", "symptoms"));
            if (symptomsDoc.exists()) {
                setSymptomCodes(symptomsDoc.data() as CodeCategory);
            }
            const repairsDoc = await getDoc(doc(db, "codes", "repairs"));
            if (repairsDoc.exists()) {
                setRepairCodes(repairsDoc.data() as CodeCategory);
            }
        } catch (error) {
            console.error("Error fetching codes for service order form:", error);
            toast({
                variant: "destructive",
                title: "Erro ao carregar códigos",
                description: "Não foi possível buscar os dados mais recentes. Usando dados padrão.",
            });
        }
    };
    
    const fetchTechnicians = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, "technicians"));
            if (!querySnapshot.empty) {
                const techs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);
            } else {
                 setTechnicians(initialTechnicians); // Fallback
            }
        } catch (error) {
            console.error("Error fetching technicians:", error);
            setTechnicians(initialTechnicians); // Use static data as fallback
            toast({
                variant: "destructive",
                title: "Erro ao carregar técnicos",
                description: "Não foi possível buscar os dados mais recentes. Usando dados padrão.",
            });
        }
    };

    fetchCodes();
    fetchTechnicians();
  }, [toast]);

  useEffect(() => {
    const savedTechnician = localStorage.getItem("selectedTechnician");
    if (savedTechnician) {
      form.setValue("technician", savedTechnician);
    }
  }, [form]);

  useEffect(() => {
    if (watchedTechnician) {
      localStorage.setItem("selectedTechnician", watchedTechnician);
    }
  }, [watchedTechnician]);

  useEffect(() => {
    form.resetField("symptomCode");
    form.resetField("repairCode");
  }, [watchedEquipmentType, form]);

  const onSubmit = (data: FormValues) => {
    const technicianName = technicians.find(t => t.id === data.technician)?.name;
    const today = format(new Date(), "dd/MM/yyyy");

    let serviceDetails = '';
    switch(data.serviceType) {
        case 'reparo_samsung':
            serviceDetails = `Reparo Samsung - ${data.samsungRepairType || ''}`;
            break;
        case 'visita_orcamento_samsung':
            serviceDetails = `Visita orçamento Samsung - Aprovado: ${data.samsungBudgetApproved ? 'Sim' : 'Não'}${data.samsungBudgetApproved && data.samsungBudgetValue ? `, Valor: R$ ${data.samsungBudgetValue}` : ''}`;
            break;
        case 'visita_assurant':
            serviceDetails = 'Visita Assurant';
            break;
    }

    const baseTextParts = [
      `**Data: ${today}**`,
      `**Ordem de Serviço: ${data.serviceOrderNumber}**`,
      `- **Técnico:** ${technicianName}`,
      `- **Atendimento:** ${serviceDetails}`,
      `- **Tipo de Aparelho:** ${data.equipmentType}`,
    ];

    let serviceSpecificParts: string[] = [];

    if (data.serviceType === 'visita_assurant') {
        if (data.defectFound) serviceSpecificParts.push(`- **Defeito Constatado:** ${data.defectFound}`);
        if (data.partsRequested) serviceSpecificParts.push(`- **Peças Solicitadas:** ${data.partsRequested}`);
    } else {
        const symptomDescription = data.symptomCode && data.equipmentType
            ? `${data.symptomCode} - ${symptomCodes[data.equipmentType as keyof typeof symptomCodes]?.find(s => s.code === data.symptomCode)?.description}`
            : '';
        if (symptomDescription) serviceSpecificParts.push(`- **Sintoma:** ${symptomDescription}`);

        const repairDescription = data.repairCode && data.equipmentType
            ? `${data.repairCode} - ${repairCodes[data.equipmentType as keyof typeof repairCodes]?.find(r => r.code === data.repairCode)?.description}`
            : '';
        if (repairDescription) serviceSpecificParts.push(`- **Reparo:** ${repairDescription}`);
    }

    const optionalParts = [
        data.replacedPart ? `- **Peça Trocada:** ${data.replacedPart}` : '',
        data.observations ? `- **Observações:** ${data.observations}` : ''
    ].filter(Boolean);

    const text = [...baseTextParts, ...serviceSpecificParts, ...optionalParts].filter(Boolean).join('\n');

    setGeneratedText(text);
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
                                            
                                            {watchedEquipmentType && (
                                                <>
                                                    {watchedServiceType !== 'visita_assurant' ? (
                                                        <>
                                                            <FormField control={form.control} name="symptomCode" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Código de Sintoma</FormLabel>
                                                                     <FormControl>
                                                                        <SearchableSelect
                                                                            value={field.value}
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
                                                                            value={field.value}
                                                                            onChange={field.onChange}
                                                                            placeholder="Selecione o reparo"
                                                                            options={repairCodes[watchedEquipmentType as keyof typeof repairCodes]?.map(r => ({ value: r.code, label: `${r.code} - ${r.description}` })) || []}
                                                                        />
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <FormField control={form.control} name="defectFound" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Defeito constatado</FormLabel>
                                                                    <FormControl><Input placeholder="Descreva o defeito constatado" {...field} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                            <FormField control={form.control} name="partsRequested" render={({ field }) => (
                                                                <FormItem>
                                                                    <FormLabel>Peças solicitadas</FormLabel>
                                                                    <FormControl><Input placeholder="Liste as peças solicitadas" {...field} /></FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}/>
                                                        </>
                                                    )}
                                                </>
                                            )}

                                            <FormField control={form.control} name="replacedPart" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Peça Trocada (Opcional)</FormLabel>
                                                    <FormControl><Input placeholder="Ex: Placa principal BN94-12345A" {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}/>
                                            <FormField control={form.control} name="observations" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Observações (Opcional)</FormLabel>
                                                    <FormControl><Textarea placeholder="Descreva observações adicionais aqui..." {...field} /></FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}/>
                                            <Button type="submit" className="w-full">Gerar Texto da OS</Button>
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
                        <PerformanceDashboard technicians={technicians} />
                    </TabsContent>
                </Tabs>
            </div>
        </main>
    </div>
  );
}
