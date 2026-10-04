"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, BadgeCheck, ChevronLeft, ChevronRight, Sparkles, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { useTechnicians } from "@/hooks/queries";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import type { ServiceOrder } from "@/lib/data";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SERVICE_TYPE_LABELS: Record<ServiceOrder["serviceType"], string> = {
  reparo_samsung: "Reparo Samsung",
  visita_orcamento_samsung: "Visita Orçamento",
  visita_assurant: "Visita Assurant",
  coleta_eco_rma: "Coleta Eco/RMA",
  instalacao_inicial: "Instalação Inicial",
};

function OrderCard({ os, showValue }: { os: ServiceOrder; showValue?: boolean }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono font-semibold">{os.serviceOrderNumber}</p>
            <p className="text-xs text-muted-foreground">{format(os.date, "dd/MM/yyyy 'às' HH:mm")}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {showValue && os.samsungBudgetValue != null && (
              <span className="font-bold text-green-600">{brl(os.samsungBudgetValue)}</span>
            )}
            <div className="flex gap-1">
              <Badge variant="outline" className="text-[10px]">{os.equipmentType}</Badge>
              <Badge variant="secondary" className="text-[10px]">{SERVICE_TYPE_LABELS[os.serviceType] || os.serviceType}</Badge>
            </div>
          </div>
        </div>
        {os.productCollectedOrInstalled && <p className="text-sm">{os.productCollectedOrInstalled}</p>}
        {os.observations && <p className="text-xs text-muted-foreground line-clamp-2">{os.observations}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-lg">{text}</div>
  );
}

export default function ProducaoPage() {
  const { appUser } = useAuth();
  const { data: technicians = [] } = useTechnicians();
  const isTechnician = appUser?.role === "technician" || appUser?.role === "counter_technician";

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  // Admin/master abrindo esta tela escolhem de qual técnico querem ver; o técnico
  // vê sempre a própria produção (o id do técnico é o mesmo do login).
  const [pickedTechId, setPickedTechId] = useState("");
  const technicianId = isTechnician ? appUser?.uid || "" : pickedTechId;

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["producao", appUser?.uid, technicianId, month.toISOString()],
    queryFn: () => serviceOrderService.getByTechnicianInRange(technicianId, startOfMonth(month), endOfMonth(month)),
    enabled: !!technicianId,
    staleTime: 60 * 1000,
  });

  const { cleanings, approved, budgetVisits } = useMemo(() => {
    const budgetVisits = orders.filter(os => os.serviceType === "visita_orcamento_samsung");
    return {
      cleanings: orders.filter(os => os.cleaningPerformed),
      approved: budgetVisits.filter(os => os.samsungBudgetApproved),
      budgetVisits,
    };
  }, [orders]);

  const approvedTotal = approved.reduce((sum, os) => sum + (os.samsungBudgetValue || 0), 0);
  const conversion = budgetVisits.length > 0 ? (approved.length / budgetVisits.length) * 100 : 0;
  const isCurrentMonth = startOfMonth(new Date()).getTime() === month.getTime();

  return (
    <div className="w-full animate-in fade-in ease-out duration-300 space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Minha Produção</h2>

      {!isTechnician && (
        <Select value={pickedTechId} onValueChange={setPickedTechId}>
          <SelectTrigger className="max-w-xs"><SelectValue placeholder="Escolha um técnico" /></SelectTrigger>
          <SelectContent>
            {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center justify-between rounded-lg border p-2">
        <Button variant="ghost" size="icon" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold">{format(month, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth(m => addMonths(m, 1))} disabled={isCurrentMonth} aria-label="Próximo mês">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {!technicianId ? (
        <EmptyState text="Escolha um técnico para ver a produção." />
      ) : isError ? (
        <div className="flex flex-col items-center p-8 text-center">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" />
          <p className="text-sm text-muted-foreground">Não foi possível carregar. Verifique a conexão e tente de novo.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3 text-center">
                <Sparkles className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-2xl font-bold">{cleanings.length}</p>
                <p className="text-[11px] text-muted-foreground">Limpezas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <BadgeCheck className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-2xl font-bold">{approved.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  Orçamentos aprovados{budgetVisits.length > 0 ? ` (${conversion.toFixed(0)}%)` : ""}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Wallet className="h-4 w-4 mx-auto text-muted-foreground" />
                <p className="text-lg font-bold leading-8">{brl(approvedTotal)}</p>
                <p className="text-[11px] text-muted-foreground">Valor aprovado</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="limpezas">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="limpezas">Limpezas ({cleanings.length})</TabsTrigger>
              <TabsTrigger value="orcamentos">Orçamentos aprovados ({approved.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="limpezas" className="space-y-2 mt-3">
              {cleanings.length === 0
                ? <EmptyState text="Nenhuma limpeza registrada neste mês." />
                : cleanings.map(os => <OrderCard key={os.id} os={os} />)}
            </TabsContent>
            <TabsContent value="orcamentos" className="space-y-2 mt-3">
              {approved.length === 0
                ? <EmptyState text="Nenhum orçamento aprovado neste mês." />
                : approved.map(os => <OrderCard key={os.id} os={os} showValue />)}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
