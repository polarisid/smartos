"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useServiceOrders } from "@/hooks/queries";
import { Wrench, CheckCircle, Clock, PlusCircle } from "lucide-react";
import { format, isToday } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function CounterTechnicianDashboardPage() {
  const { data: serviceOrders = [], isLoading } = useServiceOrders(10);
  
  // No caso real, filtraríamos as OSs apenas desse técnico e do dia de hoje.
  // Como simplificação, pegamos as mais recentes:
  const recentOrders = [...serviceOrders]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  const todayOrders = serviceOrders.filter(os => isToday(os.date));
  
  const stats = {
    totalHoje: todayOrders.length,
    orcamentosAprovados: todayOrders.filter(os => os.samsungBudgetApproved).length,
    pendentes: todayOrders.filter(os => !os.samsungBudgetApproved && os.samsungBudgetValue).length
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel do Balcão</h1>
          <p className="text-muted-foreground">Gerencie atendimentos rápidos e orçamentos na loja.</p>
        </div>
        <Button className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Novo Atendimento
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atendimentos Hoje</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalHoje}</div>
            <p className="text-xs text-muted-foreground">
              +2 em relação a ontem
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Orçamentos Aprovados</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.orcamentosAprovados}</div>
            <p className="text-xs text-muted-foreground">
              66% de taxa de conversão
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Aprovação</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendentes}</div>
            <p className="text-xs text-muted-foreground">
              Requer atenção
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos Atendimentos (Balcão)</CardTitle>
          <CardDescription>Ordens de serviço registradas ou atualizadas recentemente.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2 py-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS Nº</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aparelho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.length > 0 ? recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium">{order.serviceOrderNumber}</TableCell>
                    <TableCell>{format(order.date, 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="capitalize">{order.serviceType.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{order.equipmentType}</TableCell>
                    <TableCell>
                      {order.samsungBudgetApproved ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Aprovado</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Em Análise</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Ver Detalhes</Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Nenhum atendimento recente.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
