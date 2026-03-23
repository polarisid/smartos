import React from "react";
import { format, isAfter, startOfMonth } from "date-fns";
import { type Technician, type ServiceOrder, type Return, type Indicator, type Chargeback } from "@/lib/data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Wrench,
  ClipboardCheck,
  ShieldCheck,
  Package,
  PackageOpen,
  History,
  Sparkles,
  Percent,
  ChevronDown,
  ListTree,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";

export function PerformanceDashboard({ 
    technicians, 
    serviceOrders, 
    returns, 
    indicators, 
    chargebacks 
}: { 
    technicians: Technician[], 
    serviceOrders: ServiceOrder[], 
    returns: Return[],
    indicators: Indicator[],
    chargebacks: Chargeback[]
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
        }, 0);

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
                        <Card key={tech.id} className="transition-all hover:shadow-md border-muted/60">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-lg">{tech.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Progress value={tech.progress} className="h-2" />
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
