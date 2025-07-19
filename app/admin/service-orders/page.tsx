
"use client";

import { useState, useEffect } from "react";
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
import { Edit, Trash2, Calendar as CalendarIcon, FilterX, Sparkles } from "lucide-react";
import { type ServiceOrder, type Technician } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Form schema for editing a service order
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
});
type FormValues = z.infer<typeof formSchema>;


export default function ServiceOrdersPage() {
    const { toast } = useToast();
    const [serviceOrders, setServiceOrders] = useState<(ServiceOrder & { technicianName?: string })[]>([]);
    const [filteredOrders, setFilteredOrders] = useState<(ServiceOrder & { technicianName?: string })[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);

    const [filters, setFilters] = useState<{
        technicianId: string;
        serviceType: string;
        date: DateRange | undefined;
        cleaningOnly: boolean;
    }>({
        technicianId: 'all',
        serviceType: 'all',
        date: undefined,
        cleaningOnly: false,
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
    });
    const watchedServiceType = form.watch("serviceType");

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
                    const techName = techs.find(t => t.id === data.technicianId)?.name || 'N/A';
                    return {
                        id: doc.id,
                        ...data,
                        date: (data.date as Timestamp).toDate(),
                        technicianName: techName
                    } as ServiceOrder & { technicianName?: string };
                }).sort((a, b) => b.date.getTime() - a.date.getTime()); // Sort by most recent
                setServiceOrders(orders);
                setFilteredOrders(orders);
            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar as ordens de serviço." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    useEffect(() => {
        let newFilteredOrders = [...serviceOrders];

        if (filters.technicianId !== 'all') {
            newFilteredOrders = newFilteredOrders.filter(o => o.technicianId === filters.technicianId);
        }

        if (filters.serviceType !== 'all') {
            newFilteredOrders = newFilteredOrders.filter(o => o.serviceType === filters.serviceType);
        }

        if (filters.date?.from) {
            const interval = {
                start: startOfDay(filters.date.from),
                end: filters.date.to ? endOfDay(filters.date.to) : endOfDay(filters.date.from)
            };
            newFilteredOrders = newFilteredOrders.filter(o => isWithinInterval(o.date, interval));
        }

        if (filters.cleaningOnly) {
            newFilteredOrders = newFilteredOrders.filter(o => o.cleaningPerformed);
        }

        setFilteredOrders(newFilteredOrders);
    }, [filters, serviceOrders]);
    
    const handleOpenEditDialog = (order: ServiceOrder) => {
        setSelectedOrder(order);
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
            observations: order.observations || "",
            defectFound: order.defectFound || "",
            partsRequested: order.partsRequested || "",
            productCollectedOrInstalled: order.productCollectedOrInstalled || "",
            cleaningPerformed: order.cleaningPerformed || false,
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
            const orderRef = doc(db, "serviceOrders", selectedOrder.id);
            // We keep original technicianId and date
            const updatedData: Partial<ServiceOrder> = {
                ...data,
                samsungBudgetValue: data.samsungBudgetValue ? parseFloat(data.samsungBudgetValue) : 0
            };
            
            await setDoc(orderRef, updatedData, { merge: true });

            setServiceOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, ...updatedData, technicianName: o.technicianName } : o));
            toast({ title: "OS atualizada com sucesso!" });
            setIsFormDialogOpen(false);
        } catch (error) {
            console.error("Error saving service order:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível atualizar a OS." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedOrder) return;
        
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "serviceOrders", selectedOrder.id));
            setServiceOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
            toast({ title: "OS excluída com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedOrder(null);
        } catch(error) {
            console.error("Error deleting service order:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir a OS." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const serviceTypeLabels: Record<string, string> = {
        reparo_samsung: "Reparo Samsung",
        visita_orcamento_samsung: "Visita Orçamento Samsung",
        visita_assurant: "Visita Assurant",
        coleta_eco_rma: "Coleta Eco /RMA",
        instalacao_inicial: "Instalação Inicial",
    };

    const handleFilterChange = (key: keyof typeof filters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setFilters({
            technicianId: 'all',
            serviceType: 'all',
            date: undefined,
            cleaningOnly: false,
        });
    };

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Ordens de Serviço</h1>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Filtros</CardTitle>
                        <CardDescription>Filtre as ordens de serviço por técnico, data ou tipo de atendimento.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <Label>Técnico</Label>
                            <Select value={filters.technicianId} onValueChange={(v) => handleFilterChange('technicianId', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Técnicos</SelectItem>
                                    {technicians.map(tech => (
                                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Tipo de Atendimento</Label>
                             <Select value={filters.serviceType} onValueChange={(v) => handleFilterChange('serviceType', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos os Tipos</SelectItem>
                                    {Object.entries(serviceTypeLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Período</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !filters.date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {filters.date?.from ? (
                                        filters.date.to ? (
                                            <>
                                            {format(filters.date.from, "LLL dd, y", { locale: ptBR })} -{" "}
                                            {format(filters.date.to, "LLL dd, y", { locale: ptBR })}
                                            </>
                                        ) : (
                                            format(filters.date.from, "LLL dd, y", { locale: ptBR })
                                        )
                                        ) : (
                                        <span>Selecione um período</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    locale={ptBR}
                                    mode="range"
                                    selected={filters.date}
                                    onSelect={(date) => handleFilterChange('date', date)}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                         <div className="flex items-end">
                            <Button variant="outline" onClick={clearFilters} className="w-full">
                                <FilterX className="mr-2 h-4 w-4" />
                                Limpar Filtros
                            </Button>
                        </div>
                    </CardContent>
                     <CardContent className="pt-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t mt-4 pt-6">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="cleaning-filter"
                                checked={filters.cleaningOnly}
                                onCheckedChange={(checked) => handleFilterChange('cleaningOnly', checked)}
                            />
                            <Label htmlFor="cleaning-filter">Mostrar apenas OS com limpeza</Label>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Atendimentos Registrados</CardTitle>
                        <CardDescription>Visualize, edite ou exclua as ordens de serviço.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center p-4">Carregando ordens de serviço...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nº da OS</TableHead>
                                        <TableHead>Data</TableHead>
                                        <TableHead>Técnico</TableHead>
                                        <TableHead>Atendimento</TableHead>
                                        <TableHead className="text-center">Limpeza</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredOrders.length > 0 ? filteredOrders.map(order => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-mono">{order.serviceOrderNumber}</TableCell>
                                            <TableCell>{format(order.date, 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{order.technicianName}</TableCell>
                                            <TableCell>{serviceTypeLabels[order.serviceType] || order.serviceType}</TableCell>
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
                                            <TableCell colSpan={6} className="text-center h-24">
                                                Nenhuma ordem de serviço encontrada com os filtros selecionados.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Form Dialog for Edit */}
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

            {/* Delete Confirmation Dialog */}
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
