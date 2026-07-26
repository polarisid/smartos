
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { type DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Trash2, Calendar as CalendarIcon, FilterX, Sparkles, Search, ChevronDown, Loader2 } from "lucide-react";
import { type ServiceOrder, type Technician } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";

import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useTechnicians } from "@/hooks/queries";

const PAGE_SIZE = 20;

const formSchema = z.object({
  serviceOrderNumber: z.string().min(1, "Insira o número da OS."),
  serviceType: z.string().min(1, "Selecione o tipo de atendimento."),
  equipmentType: z.string().min(1, "Selecione o tipo de aparelho."),
  samsungRepairType: z.string().optional(),
  samsungBudgetApproved: z.boolean().optional(),
  samsungBudgetValue: z.string().optional(),
  symptomCode: z.string().optional(),
  repairCode: z.string().optional(),
  replacedPart: z.string().optional(),
  observations: z.string().optional(),
  defectFound: z.string().optional(),
  partsRequested: z.string().optional(),
  productCollectedOrInstalled: z.string().optional(),
  cleaningPerformed: z.boolean().optional(),
  samsungLpSurveyPerformed: z.boolean().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const serviceTypeLabels: Record<string, string> = {
  reparo_samsung: "Reparo Samsung",
  visita_orcamento_samsung: "Visita Orçamento Samsung",
  visita_assurant: "Visita Assurant",
  coleta_eco_rma: "Coleta Eco /RMA",
  instalacao_inicial: "Instalação Inicial",
};

export default function ServiceOrdersPage() {
  const { toast } = useToast();
  const { data: technicians = [] } = useTechnicians();

  // Data state
  const [serviceOrders, setServiceOrders] = useState<(ServiceOrder & { technicianName?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [techMap, setTechMap] = useState<Record<string, string>>({});
  const [surveyFilter, setSurveyFilter] = useState<'all' | 'completed' | 'pending'>('all');

  const filteredServiceOrders = useMemo(() => {
    return serviceOrders.filter(order => {
      if (surveyFilter === 'all') return true;
      const hasSurvey = order.samsungRepairType === 'LP' && order.observations?.includes('[Pesquisa LP realizada: Sim]');
      if (surveyFilter === 'completed') return hasSurvey;
      if (surveyFilter === 'pending') {
        return order.samsungRepairType === 'LP' && !order.observations?.includes('[Pesquisa LP realizada: Sim]');
      }
      return true;
    });
  }, [serviceOrders, surveyFilter]);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Dialog state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const watchedServiceType = form.watch("serviceType");

  // Build techMap from AppDataContext (no extra Firestore read)
  useEffect(() => {
    const map: Record<string, string> = {};
    technicians.forEach(t => { map[t.id] = t.name; });
    setTechMap(map);
  }, [technicians]);

  const loadInitialOrders = useCallback(async (map: Record<string, string>) => {
    setIsLoading(true);
    try {
      const data = await serviceOrderService.getPaginated(PAGE_SIZE);
      const orders = data.orders.map(o => ({
          ...o,
          technicianName: map[o.technicianId] || "N/A",
      }));
      setServiceOrders(orders);
      setLastDoc(data.lastDoc);
      setHasMore(data.hasMore);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao carregar OS" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadInitialOrders(techMap);
  }, [techMap]);

  // --- LOAD MORE (pagination) ---
  const handleLoadMore = async () => {
    if (!lastDoc || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await serviceOrderService.getPaginated(PAGE_SIZE, lastDoc);
      const newOrders = data.orders.map(o => ({
          ...o,
          technicianName: techMap[o.technicianId] || "N/A",
      }));
      setServiceOrders(prev => [...prev, ...newOrders]);
      setLastDoc(data.lastDoc);
      setHasMore(data.hasMore);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao carregar mais OS" });
    } finally {
      setIsLoadingMore(false);
    }
  };

  // --- SEARCH DIRECTLY IN FIRESTORE ---
  const handleSearch = async () => {
    const term = searchInput.trim();
    if (!term) {
      setSearchTerm("");
      loadInitialOrders(techMap);
      return;
    }
    setSearchTerm(term);
    setIsSearching(true);
    try {
      // Search by OS number (exact prefix match using Firestore range query)
      const results = await serviceOrderService.searchByNumber(term);
      const mappedResults = results.map(o => ({
          ...o,
          technicianName: techMap[o.technicianId] || "N/A",
      }));
      setServiceOrders(mappedResults);
      setHasMore(false); // disable "load more" during search
      setLastDoc(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro na busca", description: "Verifique se o índice do Firestore está configurado." });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // --- EDIT / DELETE ---
  const handleOpenEditDialog = (order: ServiceOrder) => {
    setSelectedOrder(order);
    const isSurveyYes = order.observations?.includes('[Pesquisa LP realizada: Sim]') || false;
    const cleanObs = order.observations
      ?.replace(/\n?\[Pesquisa LP realizada: (Sim|Não)\]/g, "")
      .trim() || "";

    form.reset({
      serviceOrderNumber: order.serviceOrderNumber,
      serviceType: order.serviceType,
      equipmentType: order.equipmentType,
      samsungRepairType: order.samsungRepairType || "",
      samsungBudgetApproved: order.samsungBudgetApproved || false,
      samsungBudgetValue: order.samsungBudgetValue?.toString() || "",
      symptomCode: order.symptomCode || "",
      repairCode: order.repairCode || "",
      replacedPart: order.replacedPart || "",
      observations: cleanObs,
      defectFound: order.defectFound || "",
      partsRequested: order.partsRequested || "",
      productCollectedOrInstalled: order.productCollectedOrInstalled || "",
      cleaningPerformed: order.cleaningPerformed || false,
      samsungLpSurveyPerformed: isSurveyYes,
    });
    setIsFormDialogOpen(true);
  };

  const handleOpenDeleteDialog = (order: ServiceOrder) => {
    setSelectedOrder(order);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async (data: FormValues) => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const finalObs = data.samsungRepairType === 'LP'
        ? `${data.observations || ''}\n[Pesquisa LP realizada: ${data.samsungLpSurveyPerformed ? 'Sim' : 'Não'}]`.trim()
        : data.observations || '';

      const updatedData: Partial<ServiceOrder> = {
        ...data,
        equipmentType: data.equipmentType as "TV/AV" | "DA",
        serviceType: data.serviceType as any,
        samsungBudgetValue: data.samsungBudgetValue ? parseFloat(data.samsungBudgetValue) : 0,
        observations: finalObs,
      };
      await serviceOrderService.update(selectedOrder.id, updatedData);
      setServiceOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, ...updatedData, technicianName: o.technicianName } : o));
      toast({ title: "OS atualizada com sucesso!" });
      setIsFormDialogOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao Salvar" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      await serviceOrderService.remove(selectedOrder.id);
      setServiceOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
      toast({ title: "OS excluída com sucesso!" });
      setIsDeleteDialogOpen(false);
      setSelectedOrder(null);
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao Excluir" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Ordens de Serviço</h1>
        </div>

        {/* Search bar */}
        <Card>
          <CardHeader>
            <CardTitle>Buscar OS</CardTitle>
            <CardDescription>
              Digite o número da OS para buscar diretamente no banco de dados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Número da OS (ex: 4801234567)"
                    className="pl-9"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  Buscar
                </Button>
                {searchTerm && (
                  <Button variant="outline" onClick={() => {
                    setSearchInput("");
                    setSearchTerm("");
                    loadInitialOrders(techMap);
                  }}>
                    <FilterX className="h-4 w-4 mr-2" /> Limpar
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-2 min-w-[260px]">
                <Label htmlFor="survey-filter" className="text-xs shrink-0 font-bold">Pesquisa LP:</Label>
                <Select value={surveyFilter} onValueChange={(v: any) => setSurveyFilter(v)}>
                  <SelectTrigger id="survey-filter" className="h-10 text-sm">
                    <SelectValue placeholder="Filtrar por pesquisa..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as OSs</SelectItem>
                    <SelectItem value="completed">Com Pesquisa Realizada</SelectItem>
                    <SelectItem value="pending">Pesquisa LP Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {searchTerm && (
              <p className="text-sm text-muted-foreground mt-2">
                Mostrando resultados para: <span className="font-mono font-semibold">{searchTerm}</span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Atendimentos Registrados</CardTitle>
                <CardDescription>
                  {searchTerm
                    ? `${filteredServiceOrders.length} resultado(s) encontrado(s)`
                    : surveyFilter !== 'all'
                      ? `Exibindo ${filteredServiceOrders.length} OSs correspondentes ao filtro (de ${serviceOrders.length} carregadas)`
                      : `Exibindo as ${serviceOrders.length} OSs mais recentes`}
                </CardDescription>
              </div>
              {!searchTerm && (
                <Badge variant="outline" className="text-xs">
                  Mais recentes primeiro
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº da OS</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Técnico</TableHead>
                      <TableHead>Atendimento</TableHead>
                      <TableHead>Valor Aprovado</TableHead>
                      <TableHead className="text-center">Limpeza</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServiceOrders.length > 0 ? filteredServiceOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">{order.serviceOrderNumber}</TableCell>
                        <TableCell>{format(order.date, 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{order.technicianName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5 items-start">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {serviceTypeLabels[order.serviceType] || order.serviceType}
                              {order.samsungRepairType ? ` - ${order.samsungRepairType}` : ''}
                            </span>
                            {order.samsungRepairType === 'LP' && (
                              <div>
                                {order.observations?.includes('[Pesquisa LP realizada: Sim]') ? (
                                  <Badge className="bg-green-50 hover:bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 text-[10px] px-1.5 py-0 border-green-200">
                                    ✓ Pesquisa Realizada
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="bg-rose-50 hover:bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-300 text-[10px] px-1.5 py-0 border-rose-200">
                                    ⚠ Pesquisa Pendente
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {order.samsungBudgetApproved && order.samsungBudgetValue ? (
                            <span className="font-mono text-green-600">
                              {order.samsungBudgetValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {order.cleaningPerformed && <Sparkles className="h-5 w-5 text-yellow-500 mx-auto" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(order)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(order)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </Button>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                          {searchTerm ? "Nenhuma OS encontrada para este número." : surveyFilter !== 'all' ? "Nenhuma ordem de serviço corresponde a este filtro de pesquisa." : "Nenhuma ordem de serviço registrada."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {/* Load More Button */}
                {!searchTerm && hasMore && (
                  <div className="flex justify-center mt-6">
                    <Button
                      variant="outline"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="gap-2"
                    >
                      {isLoadingMore
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <ChevronDown className="h-4 w-4" />}
                      {isLoadingMore ? "Carregando..." : "Ver mais"}
                    </Button>
                  </div>
                )}

                {!searchTerm && !hasMore && serviceOrders.length > 0 && (
                  <p className="text-center text-xs text-muted-foreground mt-4">
                    Todos os registros foram carregados ({serviceOrders.length} no total).
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Ordem de Serviço</DialogTitle>
            <DialogDescription>
              Editando OS nº <span className="font-mono">{selectedOrder?.serviceOrderNumber}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSave)} className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serviceOrderNumber">Nº da OS</Label>
                <Input id="serviceOrderNumber" {...form.register("serviceOrderNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="equipmentType">Tipo de Aparelho</Label>
                <Select value={form.watch('equipmentType')} onValueChange={(v) => form.setValue('equipmentType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TV/AV">TV/AV</SelectItem>
                    <SelectItem value="DA">DA (Linha Branca)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="serviceType">Tipo de Atendimento</Label>
              <Select value={watchedServiceType} onValueChange={(v) => form.setValue('serviceType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reparo_samsung">Reparo Samsung</SelectItem>
                  <SelectItem value="visita_orcamento_samsung">Visita Orçamento Samsung</SelectItem>
                  <SelectItem value="visita_assurant">Visita Assurant</SelectItem>
                  <SelectItem value="coleta_eco_rma">Coleta Eco /RMA</SelectItem>
                  <SelectItem value="instalacao_inicial">Instalação Inicial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {watchedServiceType === 'reparo_samsung' && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/50">
                <div className="space-y-2">
                  <Label>Sub-tipo Reparo Samsung</Label>
                  <Select value={form.watch('samsungRepairType')} onValueChange={(v) => form.setValue('samsungRepairType', v)}>
                    <SelectTrigger><SelectValue placeholder="LP / OW / VOID" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LP">LP</SelectItem>
                      <SelectItem value="OW">OW</SelectItem>
                      <SelectItem value="VOID">VOID</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.watch('samsungRepairType') === 'LP' && (
                  <div className="flex items-center justify-between rounded-lg border p-4 bg-amber-50/50 dark:bg-amber-955/10 border-amber-200 dark:border-amber-900">
                    <div className="space-y-0.5">
                      <Label htmlFor="admin-lp-survey" className="font-bold text-amber-800 dark:text-amber-400">
                        Pesquisa LP Realizada?
                      </Label>
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        Marque se o técnico concluiu a pesquisa Medallia Contigo.
                      </p>
                    </div>
                    <Switch 
                      id="admin-lp-survey" 
                      checked={form.watch('samsungLpSurveyPerformed') || false} 
                      onCheckedChange={(c) => form.setValue('samsungLpSurveyPerformed', c)} 
                    />
                  </div>
                )}
              </div>
            )}

            {watchedServiceType === 'visita_orcamento_samsung' && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <Label>Orçamento Aprovado?</Label>
                  <Switch checked={form.watch('samsungBudgetApproved')} onCheckedChange={(c) => form.setValue('samsungBudgetApproved', c)} />
                </div>
                {form.watch('samsungBudgetApproved') && (
                  <div className="space-y-2">
                    <Label htmlFor="samsungBudgetValue">Valor (R$)</Label>
                    <Input id="samsungBudgetValue" type="number" {...form.register('samsungBudgetValue')} />
                  </div>
                )}
              </div>
            )}

            {['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType) && (
              <div className="space-y-2">
                <Label>Produto Coletado/Instalado</Label>
                <Input {...form.register('productCollectedOrInstalled')} />
              </div>
            )}

            {watchedServiceType === 'visita_assurant' ? (
              <>
                <div className="space-y-2">
                  <Label>Defeito Constatado</Label>
                  <Input {...form.register('defectFound')} />
                </div>
                <div className="space-y-2">
                  <Label>Peças Solicitadas</Label>
                  <Input {...form.register('partsRequested')} />
                </div>
              </>
            ) : !['coleta_eco_rma', 'instalacao_inicial'].includes(watchedServiceType) ? (
              <>
                <div className="space-y-2">
                  <Label>Código de Sintoma</Label>
                  <Input {...form.register('symptomCode')} />
                </div>
                <div className="space-y-2">
                  <Label>Código de Reparo</Label>
                  <Input {...form.register('repairCode')} />
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label>Peça Trocada (Opcional)</Label>
              <Input {...form.register('replacedPart')} />
            </div>
            <div className="space-y-2">
              <Label>Observações (Opcional)</Label>
              <Textarea {...form.register('observations')} />
            </div>

            <div className="flex items-center space-x-2 rounded-lg border p-4">
              <Switch id="cleaning-performed" checked={form.watch('cleaningPerformed')} onCheckedChange={(c) => form.setValue('cleaningPerformed', c)} />
              <Label htmlFor="cleaning-performed">Foi realizada limpeza nesta OS?</Label>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsFormDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente a OS
              <span className="font-bold font-mono mx-1">{selectedOrder?.serviceOrderNumber}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
