

"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, isAfter, startOfMonth, startOfYear, subDays, differenceInDays } from "date-fns";
import { type Technician, type ServiceOrder, type Preset, type Return, type Indicator, type Route, type RouteStop, type Chargeback, type CounterBudget, type InHomeBudget, type RoutePart, type ChecklistTemplate, type ChecklistField } from "@/lib/data";
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
import { Check, ChevronsUpDown, Copy, Wrench, LogIn, ListTree, ClipboardCheck, ShieldCheck, Bookmark, Package, PackageOpen, History, Trophy, Sparkles, Target, ChevronDown, Route as RouteIcon, Eye, Calendar, MapPin, Sun, Car, MessageSquare, Download, Users, Percent, Link as LinkIcon, Trash2, TrendingUp, ScanLine } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { ptBR } from 'date-fns/locale';
import dynamic from "next/dynamic";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);


type FieldWithPosition = ChecklistField & { x: number; y: number };

const availableVariables: { key: keyof RouteStop | 'currentDate' | 'technicianName', label: string }[] = [
    { key: 'serviceOrder', label: 'Número da OS' },
    { key: 'consumerName', label: 'Nome do Cliente' },
    { key: 'model', label: 'Modelo do Produto' },
    { key: 'city', label: 'Cidade' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'requestDate', label: 'Data de Solicitação' },
    { key: 'warrantyType', label: 'Tipo de Garantia' },
    { key: 'replacedPart', label: 'Peças Trocadas'},
    { key: 'observations', label: 'Observações'},
    { key: 'technicianName', label: 'Nome do Técnico'},
    { key: 'currentDate', label: 'Data Atual (DD/MM/AAAA)'},
];

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
  cleaningPerformed: z.boolean().optional(),
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
    
    const repairIsOptional = data.serviceType === 'visita_orcamento_samsung' || data.serviceType === 'reparo_samsung';

    if (!repairIsOptional && (!data.repairCode || data.repairCode.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Selecione o código de reparo.",
            path: ["repairCode"],
        });
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
    const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPromptEvent(event);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = () => {
        if (!installPromptEvent) {
            return;
        }
        installPromptEvent.prompt();
        installPromptEvent.userChoice.then((choiceResult: { outcome: string }) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            setInstallPromptEvent(null);
        });
    };
    
    return (
        <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
            <Link href="/" className="flex items-center gap-3 text-primary">
                <Wrench className="w-6 h-6 sm:w-7 sm:h-7" />
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">SmartService OS</h1>
            </Link>
            <div className="flex items-center gap-2">
                 {installPromptEvent && (
                    <Button onClick={handleInstallClick} size="sm" className="relative">
                        <Download className="mr-0 sm:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Instalar App</span>
                    </Button>
                )}
                <Button asChild variant="outline" size="sm">
                    <Link href="/admin/login">
                        <LogIn className="mr-0 sm:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Área Admin</span>
                    </Link>
                </Button>
            </div>
        </header>
    );
}

function PerformanceDashboard({ technicians, serviceOrders, returns, indicators, chargebacks, counterBudgets, inHomeBudgets }: { 
    technicians: Technician[], 
    serviceOrders: ServiceOrder[], 
    returns: Return[],
    indicators: Indicator[],
    chargebacks: Chargeback[],
    counterBudgets: CounterBudget[],
    inHomeBudgets: InHomeBudget[]
}) {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);

    const serviceOrdersThisMonth = serviceOrders.filter(os =>
        isAfter(os.date, startOfCurrentMonth)
    );

    const returnsThisMonth = returns.filter(r =>
        r.returnDate && isAfter(r.returnDate, startOfCurrentMonth)
    );

    const chargebacksThisMonth = chargebacks.filter(c =>
        c.date && isAfter(c.date, startOfCurrentMonth)
    );

    const counterBudgetsThisMonth = counterBudgets.filter(cb =>
        cb.date && isAfter(cb.date, startOfCurrentMonth)
    );

    const inHomeBudgetsThisMonth = inHomeBudgets.filter(ihb =>
        ihb.date && isAfter(ihb.date, startOfCurrentMonth)
    );
    
    const serviceTypeConfig: Record<string, { label: string; icon: React.ElementType }> = {
        reparo_samsung: { label: "Reparo Samsung", icon: Wrench },
        visita_orcamento_samsung: { label: "Visita Orçamento Samsung", icon: ClipboardCheck },
        visita_assurant: { label: "Visita Assurant", icon: ShieldCheck },
        coleta_eco_rma: { label: "Coleta Eco /RMA", icon: Package },
        instalacao_inicial: { label: "Instalação Inicial", icon: PackageOpen },
    };

    const performanceData = technicians.map(tech => {
        const techOrdersThisMonth = serviceOrdersThisMonth.filter(os =>
            os.technicianId === tech.id
        );

        const techReturnsThisMonth = returnsThisMonth.filter(r => 
            r.technicianId === tech.id
        );

        const techChargebacksThisMonth = chargebacksThisMonth.filter(c =>
            c.technicianId === tech.id
        );

        const techCounterBudgetsThisMonth = counterBudgetsThisMonth.filter(cb =>
            cb.technicianId === tech.id
        );
        
        const techInHomeBudgetsThisMonth = inHomeBudgetsThisMonth.filter(ihb =>
            ihb.technicianId === tech.id
        );

        const osCount = techOrdersThisMonth.length;
        const cleaningsCount = techOrdersThisMonth.filter(os => os.cleaningPerformed).length;
        
        const osCountByType = techOrdersThisMonth.reduce((acc, os) => {
            const type = os.serviceType;
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const budgetVisitOrders = techOrdersThisMonth.filter(os => os.serviceType === 'visita_orcamento_samsung');
        const approvedBudgets = budgetVisitOrders.filter(os => os.samsungBudgetApproved).length;
        const conversionRate = budgetVisitOrders.length > 0 ? (approvedBudgets / budgetVisitOrders.length) * 100 : 0;
        
        const grossRevenue = techOrdersThisMonth.reduce((total, os) => {
            if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
                return total + os.samsungBudgetValue;
            }
            return total;
        }, 0) + techCounterBudgetsThisMonth.reduce((total, cb) => total + cb.value, 0) + techInHomeBudgetsThisMonth.reduce((total, ihb) => total + ihb.value, 0);

        const totalChargebacks = techChargebacksThisMonth.reduce((total, c) => total + c.value, 0);

        const netRevenue = grossRevenue - totalChargebacks;

        const goal = tech.goal || 0;
        const progress = goal > 0 ? Math.min((netRevenue / goal) * 100, 100) : 0;

        return {
            ...tech,
            revenue: netRevenue,
            goal,
            progress,
            osCount,
            osCountByType,
            returnCount: techReturnsThisMonth.length,
            cleaningsCount,
            conversionRate,
        };
    }).sort((a, b) => (b.goal > 0 ? (b.revenue / b.goal) : 0) - (a.goal > 0 ? (a.revenue / a.goal) : 0));

    const osByServiceType = serviceOrdersThisMonth.reduce((acc, os) => {
        if (!acc[os.serviceType]) {
            acc[os.serviceType] = 0;
        }
        acc[os.serviceType]++;
        return acc;
    }, {} as Record<ServiceOrder['serviceType'], number>);

    const getGoalDisplay = (indicator: Indicator) => {
        if (indicator.goalType === 'percentage') {
            return `${indicator.goalValue}%`
        }
        return indicator.goalDescription || '-';
    };

    const checkIsOnTarget = (indicator: Indicator): boolean => {
        if (indicator.goalType !== 'percentage' || indicator.goalValue === undefined || indicator.currentValue === undefined) {
            return true; // Cannot determine, so assume it's on target
        }
        if (indicator.evaluationLogic === 'above_is_better') {
            return indicator.currentValue >= indicator.goalValue;
        }
        if (indicator.evaluationLogic === 'below_is_better') {
            return indicator.currentValue <= indicator.goalValue;
        }
        return true;
    };


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Desempenho do Mês</CardTitle>
                    <CardDescription>
                        Acompanhe o faturamento, OS e retornos dos técnicos em relação às suas metas mensais.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-2">
                    {performanceData.map(tech => (
                        <Card key={tech.id}>
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg">{tech.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
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
                                 <div className="border-t pt-4 space-y-1">
                                     <Collapsible>
                                        <CollapsibleTrigger className="w-full">
                                            <div className="flex justify-between items-center text-sm py-1">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <ClipboardCheck className="h-4 w-4" />
                                                    <span>Total de OS</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{tech.osCount}</span>
                                                    <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                                </div>
                                            </div>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="text-sm pl-6 mt-1 space-y-1">
                                            {Object.entries(tech.osCountByType).map(([type, count]) => {
                                                const Icon = serviceTypeConfig[type]?.icon || Wrench;
                                                const label = serviceTypeConfig[type]?.label || type;
                                                return (
                                                     <div key={type} className="flex justify-between items-center text-xs">
                                                         <div className="flex items-center gap-2 text-muted-foreground">
                                                            <Icon className="h-3 w-3" />
                                                            <span>{label}</span>
                                                        </div>
                                                        <span className="font-bold">{count}</span>
                                                     </div>
                                                )
                                            })}
                                        </CollapsibleContent>
                                     </Collapsible>
                                    <div className="flex justify-between items-center text-sm py-1">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <History className="h-4 w-4" />
                                            <span>Total de Retornos</span>
                                        </div>
                                        <span className="font-bold">{tech.returnCount}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm py-1">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Sparkles className="h-4 w-4" />
                                            <span>Total de Limpezas</span>
                                        </div>
                                        <span className="font-bold">{tech.cleaningsCount}</span>
                                    </div>
                                     <div className="flex justify-between items-center text-sm py-1">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Percent className="h-4 w-4" />
                                            <span>Taxa de Conversão</span>
                                        </div>
                                        <span className="font-bold">{tech.conversionRate.toFixed(1)}%</span>
                                    </div>
                                 </div>
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Target className="h-5 w-5" /> Indicadores da Equipe
                        </CardTitle>
                        <CardDescription>Resultados da equipe em relação às metas definidas.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                         {indicators.length > 0 ? indicators.map(indicator => {
                            const isOnTarget = checkIsOnTarget(indicator);
                            return (
                                <Collapsible key={indicator.id} className={cn(
                                    "rounded-lg border p-3 transition-colors",
                                    !isOnTarget && "border-destructive/50 bg-destructive/10"
                                )}>
                                    <CollapsibleTrigger className="w-full">
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between text-sm font-medium">
                                                <span>{indicator.name}</span>
                                                <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground">Resultado:</span>
                                                    <span className="font-bold">{indicator.currentValue ?? 0}{indicator.goalType === 'percentage' ? '%' : ''}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground">Meta:</span>
                                                    <span className="font-bold">{getGoalDisplay(indicator)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        {indicator.description && <p className="text-xs text-muted-foreground pt-2 mt-2 border-t">{indicator.description}</p>}
                                    </CollapsibleContent>
                                </Collapsible>
                            )
                         }) : (
                            <p className="text-sm text-muted-foreground text-center">Nenhum indicador de equipe cadastrado.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ReturnsRanking({ technicians, returns }: { technicians: Technician[], returns: Return[] }) {
    const now = new Date();
    const startOfCurrentYear = startOfYear(now);
    
    const returnsThisYear = returns.filter(r => r.returnDate && isAfter(r.returnDate, startOfCurrentYear));

    const returnsByTechnician = technicians.map(tech => {
        const techReturns = returnsThisYear.filter(r => r.technicianId === tech.id);
        const returnCount = techReturns.length;
        const totalDaysToReturn = techReturns.reduce((acc, r) => acc + r.daysToReturn, 0);
        const averageDaysToReturn = returnCount > 0 ? totalDaysToReturn / returnCount : 0;
        
        return {
            ...tech,
            returnCount,
            averageDaysToReturn,
            returns: techReturns,
        };
    }).sort((a, b) => {
        if (a.returnCount !== b.returnCount) {
            return a.returnCount - b.returnCount;
        }
        return b.averageDaysToReturn - a.averageDaysToReturn;
    });

    const getTrophyColor = (rank: number) => {
        if (rank === 0) return "text-yellow-500";
        if (rank === 1) return "text-gray-400";
        if (rank === 2) return "text-yellow-800";
        return "text-muted-foreground";
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Ranking Anual de Retornos</CardTitle>
                <CardDescription>Técnicos com a menor quantidade de retornos no ano corrente. Clique no nome para ver os detalhes.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Posição</TableHead>
                            <TableHead>Técnico</TableHead>
                            <TableHead className="text-center">Retornos (Ano)</TableHead>
                            <TableHead className="text-right">Média de Dias p/ Retorno</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {returnsByTechnician.map((tech, index) => (
                            <TableRow key={tech.id}>
                                <TableCell className="font-bold text-lg flex items-center gap-2">
                                    <Trophy className={`h-5 w-5 ${getTrophyColor(index)}`} />
                                    <span>#{index + 1}</span>
                                </TableCell>
                                <TableCell>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="link" className="font-medium p-0 h-auto" disabled={tech.returnCount === 0}>
                                                {tech.name}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-3xl">
                                            <DialogHeader>
                                                <DialogTitle>Retornos de {tech.name}</DialogTitle>
                                                <DialogDescription>
                                                    Detalhes dos retornos do técnico no ano corrente.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="max-h-[60vh] overflow-y-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Data</TableHead>
                                                            <TableHead>OS Original</TableHead>
                                                            <TableHead>OS Retorno</TableHead>
                                                            <TableHead>Modelo</TableHead>
                                                            <TableHead className="text-right">Dias</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {tech.returns.map((r, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell>{r.returnDate ? format(r.returnDate, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                                                <TableCell className="font-mono">{r.originalServiceOrder}</TableCell>
                                                                <TableCell className="font-mono">{r.returnServiceOrder}</TableCell>
                                                                <TableCell>{r.productModel}</TableCell>
                                                                <TableCell className="text-right">{r.daysToReturn}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </TableCell>
                                <TableCell className="text-center font-mono font-semibold">{tech.returnCount}</TableCell>
                                <TableCell className="text-right font-mono font-semibold">{Math.round(tech.averageDaysToReturn)} dias</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
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

function RouteDetailsRow({ stop, index, serviceOrders, routeCreatedAt, visitTemplate }: { 
    stop: RouteStop, 
    index: number, 
    serviceOrders: ServiceOrder[], 
    routeCreatedAt: Date | Timestamp,
    visitTemplate: string
}) {
    const { toast } = useToast();
    const createdAtAsDate = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
    const isCompleted = serviceOrders.some(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, createdAtAsDate)
    );

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getRowClass = () => {
        if (isCompleted) return "bg-green-100 dark:bg-green-900/50 line-through";
        switch (stop.stopType) {
            case 'coleta': return 'bg-yellow-100 dark:bg-yellow-900/50';
            case 'entrega': return 'bg-blue-100 dark:bg-blue-900/50';
            default: return '';
        }
    };

    const stopTypeLabels = {
        padrao: 'Padrão',
        coleta: 'Coleta',
        entrega: 'Entrega'
    };

    return (
        <React.Fragment key={index}>
            <CollapsibleTrigger asChild>
                <TableRow className={cn("cursor-pointer", getRowClass())}>
                    <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                    <TableCell>{stopTypeLabels[stop.stopType || 'padrao']}</TableCell>
                    <TableCell>{stop.city}</TableCell>
                    <TableCell>{stop.neighborhood}</TableCell>
                    <TableCell>{stop.model}</TableCell>
                    <TableCell>
                        {stop.parts && stop.parts.length > 0 ? (
                            <div>
                                {stop.parts.map((part, pIndex) => (
                                    <div key={pIndex} className="font-mono text-xs">
                                        {part.code} (x{part.quantity})
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                        <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                    </TableCell>
                </TableRow>
            </CollapsibleTrigger>
            <CollapsibleContent asChild>
                <tr className="bg-muted/50">
                    <TableCell colSpan={7} className="p-2">
                            <div className="p-2 bg-background/50 rounded space-y-2">
                            <div>
                                <p className="font-semibold text-xs mb-1">Nome Consumidor:</p>
                                <p className="text-sm text-foreground">{stop.consumerName || "N/A"}</p>
                            </div>
                             <div>
                                <p className="font-semibold text-xs mb-1">Detalhes:</p>
                                <p className="text-sm text-foreground">{stop.ascJobNumber} / {stop.ts} / {stop.warrantyType}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-xs mb-1">Status Comment:</p>
                                <p className="text-sm text-foreground">{stop.statusComment || "N/A"}</p>
                            </div>
                            <div className="border-t pt-2">
                                    <Button size="sm" variant="outline" onClick={handleCopyVisitText}>
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Copiar Anúncio de Visita
                                </Button>
                            </div>
                        </div>
                    </TableCell>
                </tr>
            </CollapsibleContent>
        </React.Fragment>
    )
}

function RoutesTab({ serviceOrders, visitTemplate, activeRoutes }: { serviceOrders: ServiceOrder[], visitTemplate: string, activeRoutes: Route[] }) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if(activeRoutes.length > 0 || activeRoutes.length === 0){
            setIsLoading(false);
        }
    },[activeRoutes])


    if (isLoading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><RouteIcon /> Rotas Ativas da Equipe</CardTitle>
                    <CardDescription>Buscando as rotas ativas...</CardDescription>
                </CardHeader>
                <CardContent className="text-center py-10">
                    <p>Carregando...</p>
                </CardContent>
            </Card>
        );
    }

    if (activeRoutes.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><RouteIcon /> Rotas Ativas da Equipe</CardTitle>
                    <CardDescription>Nenhuma rota ativa encontrada para a equipe.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-muted-foreground py-10">
                        <p>Nenhuma rota ativa encontrada para a equipe.</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {activeRoutes.map(route => {
                const departure = route.departureDate ? (route.departureDate instanceof Timestamp ? route.departureDate.toDate() : route.departureDate) : new Date();
                const arrival = route.arrivalDate ? (route.arrivalDate instanceof Timestamp ? route.arrivalDate.toDate() : route.arrivalDate) : new Date();
                const duration = differenceInDays(arrival, departure) + 1;

                const totalStops = route.stops.length;
                const completedStopsCount = route.stops.filter(stop => 
                    serviceOrders.some(os => 
                        os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt)
                    )
                ).length;
                const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;


                return (
                    <Card key={route.id}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><RouteIcon /> Rota: {route.name}</CardTitle>
                             <CardDescription>
                                Técnico responsável: <span className="font-medium text-foreground">{route.technicianName}</span>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm border-t border-b py-4">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Saída</p>
                                        <p className="font-semibold">{format(departure, 'dd/MM/yyyy')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Chegada</p>
                                        <p className="font-semibold">{format(arrival, 'dd/MM/yyyy')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Sun className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Duração</p>
                                        <p className="font-semibold">{duration} dia{duration !== 1 ? 's' : ''}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Tipo</p>
                                        <p className="font-semibold capitalize">{route.routeType}</p>
                                    </div>
                                </div>
                                {route.licensePlate && (
                                    <div className="flex items-center gap-2">
                                        <Car className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <p className="text-xs text-muted-foreground">Placa</p>
                                            <p className="font-semibold uppercase">{route.licensePlate}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="space-y-2">
                                <Progress value={progress} />
                                <p className="text-xs text-muted-foreground text-right">{completedStopsCount} de {totalStops} paradas concluídas</p>
                            </div>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant="outline"><Eye className="mr-2 h-4 w-4" /> Ver Detalhes da Rota</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-6xl">
                                    <DialogHeader>
                                        <DialogTitle>Detalhes da Rota: {route.name}</DialogTitle>
                                        <DialogDescription>
                                            Use a legenda de cores para identificar os tipos de parada.
                                        </DialogDescription>
                                         <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-2">
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></div><span>Coleta</span></div>
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300"></div><span>Entrega</span></div>
                                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-100 border border-green-300"></div><span>Finalizada</span></div>
                                        </div>
                                    </DialogHeader>
                                    <div className="max-h-[70vh] overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>OS</TableHead>
                                                    <TableHead>Tipo</TableHead>
                                                    <TableHead>Cidade</TableHead>
                                                    <TableHead>Bairro</TableHead>
                                                    <TableHead>Modelo</TableHead>
                                                    <TableHead>Peças</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {route.stops.map((stop, index) => (
                                                    <Collapsible asChild key={index}>
                                                        <RouteDetailsRow stop={stop} index={index} serviceOrders={serviceOrders} routeCreatedAt={(route.createdAt as Date)} visitTemplate={visitTemplate} />
                                                    </Collapsible>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );
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

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
                                            {isAutoFilled && <LinkIcon className="h-4 w-4 text-blue-500" title="Preenchido automaticamente" />}
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

export default function ServiceOrderPage() {
  const [generatedText, setGeneratedText] = useState("");
  const [osIsSaved, setOsIsSaved] = useState(false);
  const { toast } = useToast();
  const [symptomCodes, setSymptomCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [repairCodes, setRepairCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [counterBudgets, setCounterBudgets] = useState<CounterBudget[]>([]);
  const [inHomeBudgets, setInHomeBudgets] = useState<InHomeBudget[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [assistantName, setAssistantName] = useState("");
  const [visitTemplate, setVisitTemplate] = useState("");
  const [activeRoutes, setActiveRoutes] = useState<Route[]>([]);
  const [currentRouteStop, setCurrentRouteStop] = useState<RouteStop | null>(null);
  const [selectedParts, setSelectedParts] = useState<Record<string, number>>({});
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [checklistData, setChecklistData] = useState<Record<string, string | boolean>>({});


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
      cleaningPerformed: false,
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

  const fetchDynamicData = async () => {
    try {
        const [ordersSnapshot, returnsSnapshot, indicatorsSnapshot, chargebacksSnapshot, counterBudgetsSnapshot, inHomeBudgetsSnapshot, activeRoutesSnapshot, checklistsSnapshot] = await Promise.all([
            getDocs(collection(db, "serviceOrders")),
            getDocs(collection(db, "returns")),
            getDocs(collection(db, "indicators")),
            getDocs(collection(db, "chargebacks")),
            getDocs(collection(db, "counterBudgets")),
            getDocs(collection(db, "inHomeBudgets")),
            getDocs(query(collection(db, "routes"), where("isActive", "==", true))),
            getDocs(collection(db, "checklistTemplates"))
        ]);
        
        const orders = ordersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as ServiceOrder;
        });
        setServiceOrders(orders);

        const returnsData = returnsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                returnDate: (data.returnDate as Timestamp)?.toDate(),
            } as Return;
        });
        setReturns(returnsData);

        const chargebacksData = chargebacksSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as Chargeback;
        });
        setChargebacks(chargebacksData);
        
        const counterBudgetsData = counterBudgetsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as CounterBudget;
        });
        setCounterBudgets(counterBudgetsData);

        const inHomeBudgetsData = inHomeBudgetsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as InHomeBudget;
        });
        setInHomeBudgets(inHomeBudgetsData);

        const indicatorsData = indicatorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Indicator));
        setIndicators(indicatorsData);

        const routesData = activeRoutesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate(),
                departureDate: (data.departureDate as Timestamp)?.toDate(),
                arrivalDate: (data.arrivalDate as Timestamp)?.toDate(),
            } as Route;
        });
        setActiveRoutes(routesData);

        const checklists = checklistsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistTemplate));
        setChecklistTemplates(checklists);

    } catch (error) {
        console.error("Error fetching dynamic data:", error);
        toast({
            variant: "destructive",
            title: "Erro ao buscar dados dinâmicos",
            description: "Não foi possível carregar os dados mais recentes.",
        });
    }
  };

  useEffect(() => {
    const fetchInitialData = async () => {
        try {
            const [symptomsDoc, repairsDoc, techsSnapshot, presetsSnapshot, templateDoc] = await Promise.all([
                getDoc(doc(db, "codes", "symptoms")),
                getDoc(doc(db, "codes", "repairs")),
                getDocs(collection(db, "technicians")),
                getDocs(collection(db, "presets")),
                getDoc(doc(db, "textTemplates", "visitAnnouncement"))
            ]);

            if (symptomsDoc.exists()) setSymptomCodes(symptomsDoc.data() as CodeCategory);
            if (repairsDoc.exists()) setRepairCodes(repairsDoc.data() as CodeCategory);
            
            const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
            setTechnicians(techs);
            
            const presetsData = presetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Preset));
            setPresets(presetsData);

            if (templateDoc.exists()) {
                setVisitTemplate(templateDoc.data().template);
            } else {
                setVisitTemplate(`Olá, bom dia! Somos da assistência técnica autorizada Samsung. Referente ao seu atendimento da ordem de serviço {{serviceOrder}}, para o cliente {{consumerName}} na cidade de {{city}}. Poderia me confirmar a sua localização?`);
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
    
    fetchInitialData().then(() => {
        fetchDynamicData();
    });

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

  useEffect(() => {
    if (watchedServiceOrderNumber) {
        let foundStop: RouteStop | null = null;
        for (const route of activeRoutes) {
            const stop = route.stops.find(s => s.serviceOrder === watchedServiceOrderNumber);
            if (stop) {
                foundStop = stop;
                break;
            }
        }
        setCurrentRouteStop(foundStop);
        setSelectedParts({});
        setValue("replacedPart", "");
    } else {
        setCurrentRouteStop(null);
    }
    setOsIsSaved(false);
  }, [watchedServiceOrderNumber, activeRoutes, setValue]);
  
  useEffect(() => {
    const replacedPartText = Object.entries(selectedParts)
        .filter(([, qty]) => qty > 0)
        .map(([code, qty]) => qty > 1 ? `${code} (x${qty})` : code)
        .join(', ');
    setValue("replacedPart", replacedPartText);
  }, [selectedParts, setValue]);


  const onSubmit = async (data: FormValues) => {
    const tech = technicians.find(t => t.id === data.technician);
    let technicianName = tech?.name || '';
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
            cleaningPerformed: data.cleaningPerformed || false,
        };

        await addDoc(collection(db, "serviceOrders"), newServiceOrder);
        setOsIsSaved(true);
        toast({
            title: "OS Lançada com Sucesso!",
            description: `A ordem de serviço ${data.serviceOrderNumber} foi salva.`,
        });

        fetchDynamicData();

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
        cleaningPerformed: false,
    });
    setGeneratedText("");
    setOsIsSaved(false);
    setChecklistData({});
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

  const handlePartQuantityChange = (partCode: string, quantity: number) => {
    setSelectedParts(prev => {
        const newParts = { ...prev, [partCode]: quantity };
        if (quantity === 0) {
            delete newParts[partCode];
        }
        return newParts;
    });
  };


  const filteredPresets = presets.filter(p => p.equipmentType === watchedEquipmentType);
  const serviceRequiresCodes = !['visita_assurant', 'coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);
  const showReplacedPart = !['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType);
  const routeParts = currentRouteStop?.parts || [];

  return (
    <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow p-4 sm:p-6 md:p-8">
            <div className="max-w-4xl mx-auto">
                <Tabs defaultValue="os-form" className="w-full">
                    <TabsList className="mb-6 h-auto justify-start md:h-10 md:grid md:w-full md:grid-cols-4">
                        <TabsTrigger value="os-form" className="flex flex-1 items-center justify-center gap-2 px-2">
                           <Wrench />
                           <span className="hidden sm:inline">Lançar OS</span>
                        </TabsTrigger>
                        <TabsTrigger value="dashboard" className="flex flex-1 items-center justify-center gap-2 px-2">
                           <TrendingUp />
                           <span className="hidden sm:inline">Desempenho</span>
                        </TabsTrigger>
                        <TabsTrigger value="returns-ranking" className="flex flex-1 items-center justify-center gap-2 px-2">
                           <Trophy />
                           <span className="hidden sm:inline">Ranking</span>
                        </TabsTrigger>
                        <TabsTrigger value="routes" className="flex flex-1 items-center justify-center gap-2 px-2">
                           <RouteIcon />
                           <span className="hidden sm:inline">Rotas</span>
                        </TabsTrigger>
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

                                            {routeParts.length > 0 && (
                                                <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
                                                    <div className="space-y-1">
                                                        <Label className="font-semibold">Peças da Rota para esta OS</Label>
                                                        <p className="text-xs text-muted-foreground">Selecione as peças usadas</p>
                                                    </div>
                                                    <div className="space-y-3 pt-2">
                                                        {routeParts.map((part) => (
                                                            <div key={part.code} className="flex items-center justify-between gap-4">
                                                                <div className="flex items-center gap-2">
                                                                     <Checkbox
                                                                        id={`part-${part.code}`}
                                                                        checked={!!selectedParts[part.code] || (part.quantity > 1 && (selectedParts[part.code] || 0) > 0)}
                                                                        onCheckedChange={(checked) => handlePartQuantityChange(part.code, checked ? part.quantity : 0)}
                                                                    />
                                                                    <label
                                                                        htmlFor={`part-${part.code}`}
                                                                        className="text-sm font-mono leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                                    >
                                                                        {part.code}
                                                                    </label>
                                                                </div>
                                                                 {part.quantity > 1 ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <Label htmlFor={`qty-${part.code}`} className="text-xs">Qtd:</Label>
                                                                        <Select
                                                                            value={String(selectedParts[part.code] || 0)}
                                                                            onValueChange={(value) => handlePartQuantityChange(part.code, Number(value))}
                                                                        >
                                                                            <SelectTrigger className="h-8 w-20">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {[...Array(part.quantity + 1).keys()].map(qty => (
                                                                                    <SelectItem key={qty} value={String(qty)}>{qty}</SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                ) : <span className="text-sm text-muted-foreground">x{part.quantity}</span>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

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
                                                            <FormLabel>Código de Reparo {(watchedServiceType === 'visita_orcamento_samsung' || watchedServiceType === 'reparo_samsung') && '(Opcional)'}</FormLabel>
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

                                            <FormField control={form.control} name="cleaningPerformed" render={({ field }) => (
                                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                                    <div className="space-y-0.5">
                                                        <FormLabel>Foi feita limpeza nesta OS?</FormLabel>
                                                        <FormDescription className="text-xs">
                                                            Marque somente se você executou a limpeza.
                                                        </FormDescription>
                                                    </div>
                                                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                                </FormItem>
                                            )}/>
                                            
                                            <Button type="submit" className="w-full">Gerar Texto e Salvar OS</Button>
                                        </form>
                                    </Form>
                                </CardContent>
                            </Card>

                            <div className="lg:sticky lg:top-24 h-fit space-y-4">
                                <Card className={`w-full transition-all duration-300 ${generatedText ? 'opacity-100' : 'opacity-50'}`}>
                                    <CardHeader className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>Texto Gerado</CardTitle>
                                            <CardDescription>Copie o texto para a área de transferência.</CardDescription>
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
                                     <CardFooter className="flex justify-end gap-2">
                                        <Button variant="outline" size="sm" onClick={handleNewOS} disabled={!generatedText}>
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
                    </TabsContent>
                    <TabsContent value="dashboard">
                        <PerformanceDashboard 
                            technicians={technicians} 
                            serviceOrders={serviceOrders} 
                            returns={returns} 
                            indicators={indicators}
                            chargebacks={chargebacks}
                            counterBudgets={counterBudgets}
                            inHomeBudgets={inHomeBudgets}
                        />
                    </TabsContent>
                    <TabsContent value="returns-ranking">
                        <ReturnsRanking technicians={technicians} returns={returns} />
                    </TabsContent>
                    <TabsContent value="routes">
                        <RoutesTab serviceOrders={serviceOrders} visitTemplate={visitTemplate} activeRoutes={activeRoutes} />
                    </TabsContent>
                </Tabs>
            </div>
        </main>
        <footer className="bg-card border-t p-4 text-center text-xs text-muted-foreground">
            <p>SmartService OS - Feito com ❤️ para simplificar sua vida.</p>
            <Link href="/counter-technician/login" className="text-primary hover:underline">Acesso Técnico Balcão</Link>
        </footer>
    </div>
  );
}










