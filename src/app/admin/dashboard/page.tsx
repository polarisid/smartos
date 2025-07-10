
"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Wrench, Users, Tag, Tv, WashingMachine, ShieldCheck, ListTree, ClipboardCheck } from "lucide-react";
import { type ServiceOrder, type Technician } from "@/lib/data";
import { startOfWeek, startOfMonth, isAfter, startOfYear, isToday } from 'date-fns';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function DashboardPage() {
    const [filterPeriod, setFilterPeriod] = useState<'today' | 'this_week' | 'this_month' | 'this_year' | 'all_time'>('this_month');
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const techSnapshot = await getDocs(collection(db, "technicians"));
                const techs = techSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);

                const orderSnapshot = await getDocs(collection(db, "serviceOrders"));
                const orders = orderSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        date: data.date.toDate(),
                    } as ServiceOrder;
                });
                setServiceOrders(orders);
            } catch (error) {
                console.error("Error fetching dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const now = new Date();

    const filterLabels: Record<typeof filterPeriod, string> = {
        today: "Hoje",
        this_week: "Semana",
        this_month: "Mês",
        this_year: "Ano",
        all_time: "Total"
    };

    const filteredServiceOrders = serviceOrders.filter(os => {
        if (filterPeriod === 'all_time') return true;
        
        const osDate = os.date;
        if (filterPeriod === 'today') return isToday(osDate);
        if (filterPeriod === 'this_week') return isAfter(osDate, startOfWeek(now, { weekStartsOn: 1 }));
        if (filterPeriod === 'this_month') return isAfter(osDate, startOfMonth(now));
        if (filterPeriod === 'this_year') return isAfter(osDate, startOfYear(now));
        return true;
    });

    const totalOsFiltered = filteredServiceOrders.length;
    
    const totalRevenueFiltered = filteredServiceOrders.reduce((total, os) => {
        if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
            return total + os.samsungBudgetValue;
        }
        return total;
    }, 0);
    const totalBonusFiltered = totalRevenueFiltered.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });


    const performanceData = technicians.map(tech => {
        const techOrders = filteredServiceOrders.filter(os => os.technicianId === tech.id);
        const revenue = techOrders.reduce((total, os) => {
            if (os.serviceType === 'visita_orcamento_samsung' && os.samsungBudgetApproved && os.samsungBudgetValue) {
                return total + os.samsungBudgetValue;
            }
            return total;
        }, 0);
        const goal = tech.goal || 0;
        const progress = goal > 0 ? Math.min((revenue / goal) * 100, 100) : 0;
        
        return {
          technician: tech,
          osCount: techOrders.length,
          revenue,
          goal,
          progress,
        };
    }).sort((a, b) => b.revenue - a.revenue);

    const osByEquipmentType = filteredServiceOrders.reduce((acc, os) => {
        if (!acc[os.equipmentType]) {
        acc[os.equipmentType] = 0;
        }
        acc[os.equipmentType]++;
        return acc;
    }, {} as Record<ServiceOrder['equipmentType'], number>);

    const osByServiceType = filteredServiceOrders.reduce((acc, os) => {
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

    if (isLoading) {
        return <div className="p-6 text-center">Carregando dashboard...</div>;
    }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold">Dashboard</h1>
             <Tabs defaultValue="this_month" onValueChange={(value) => setFilterPeriod(value as any)} className="w-full sm:w-auto">
                <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
                    <TabsTrigger value="today">Hoje</TabsTrigger>
                    <TabsTrigger value="this_week">Semana</TabsTrigger>
                    <TabsTrigger value="this_month">Mês</TabsTrigger>
                    <TabsTrigger value="this_year">Ano</TabsTrigger>
                    <TabsTrigger value="all_time">Total</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ordens de Serviço ({filterLabels[filterPeriod]})</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOsFiltered}</div>
            <p className="text-xs text-muted-foreground">Total de OS no período selecionado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Técnicos Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{technicians.length}</div>
            <p className="text-xs text-muted-foreground">Todos os técnicos operando</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Faturamento ({filterLabels[filterPeriod]})</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBonusFiltered}</div>
            <p className="text-xs text-muted-foreground">Valor estimado no período</p>
          </CardContent>
        </Card>
      </div>
       <Card>
          <CardHeader>
            <CardTitle>Desempenho por Técnico</CardTitle>
            <CardDescription>Contagem de OS e acompanhamento de metas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead className="text-center">OS no Período</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="w-[250px] text-right">Progresso da Meta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {performanceData.map((data) => (
                  <TableRow key={data.technician.id}>
                    <TableCell className="font-medium">{data.technician.name}</TableCell>
                    <TableCell className="text-center">{data.osCount}</TableCell>
                    <TableCell className="text-right">{data.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                    <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                            <Progress value={data.progress} className="h-2"/>
                            <span className="text-xs text-muted-foreground">
                                Meta: {data.goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                        </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                    <ListTree className="h-5 w-5" />
                    <span>OS por Equipamento</span>
                    </CardTitle>
                    <CardDescription>Distribuição das ordens de serviço no período.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Tv className="h-4 w-4" />
                            <span>TV/AV</span>
                        </div>
                        <span className="font-bold">{osByEquipmentType['TV/AV'] || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <WashingMachine className="h-4 w-4" />
                            <span>Linha Branca (DA)</span>
                        </div>
                        <span className="font-bold">{osByEquipmentType['DA'] || 0}</span>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ListTree className="h-5 w-5" />
                        <span>OS por Atendimento</span>
                    </CardTitle>
                    <CardDescription>Distribuição das ordens de serviço no período.</CardDescription>
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
    </div>
  );
