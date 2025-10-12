
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
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
import { PlusCircle, Edit, Trash2, Home, DollarSign, Calendar as CalendarIcon, FileMinus, Save, Filter, UserCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, Timestamp, getDoc } from "firebase/firestore";
import { type InHomeBudget, type Technician, type Chargeback, type ServiceOrder } from "@/lib/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, isWithinInterval, startOfMonth, endOfMonth, getYear, getMonth, setYear, setMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";


function BudgetsTab({ technicians, filteredBudgets }: { technicians: Technician[], filteredBudgets: InHomeBudget[] }) {
    const [budgets, setBudgets] = useState<InHomeBudget[]>([]);
    const [selectedBudget, setSelectedBudget] = useState<InHomeBudget | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Omit<InHomeBudget, 'id'>>>({
        approvedBy: '',
        serviceOrderNumber: '',
        value: 0,
        observations: '',
        date: new Date(),
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        setBudgets(filteredBudgets);
        setIsLoading(false);
    }, [filteredBudgets]);
    
    const handleOpenAddDialog = () => {
        setDialogMode('add');
        setSelectedBudget(null);
        setFormData({ approvedBy: '', serviceOrderNumber: '', value: 0, observations: '', date: new Date() });
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (item: InHomeBudget) => {
        setDialogMode('edit');
        setSelectedBudget(item);
        setFormData({ ...item });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (item: InHomeBudget) => {
        setSelectedBudget(item);
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleFormSelectChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        if (!formData.serviceOrderNumber || !formData.date || !formData.value) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "OS, Data e Valor são obrigatórios." });
            return;
        }

        if (formData.value <= 0) {
            toast({ variant: "destructive", title: "Valor inválido", description: "O valor do orçamento deve ser maior que zero." });
            return;
        }

        setIsSubmitting(true);
        
        const matchingTechnician = technicians.find(
            t => t.name.toLowerCase() === formData.approvedBy?.toLowerCase()
        );

        const dataToSave: Omit<InHomeBudget, 'id'> = {
            approvedBy: formData.approvedBy || '',
            technicianId: matchingTechnician?.id || '',
            serviceOrderNumber: formData.serviceOrderNumber || '',
            value: formData.value || 0,
            observations: formData.observations || '',
            date: formData.date || new Date(),
        };

        try {
            if (dialogMode === 'add') {
                await addDoc(collection(db, "inHomeBudgets"), dataToSave);
                toast({ title: "Orçamento registrado com sucesso!" });
            } else if (selectedBudget) {
                const budgetRef = doc(db, "inHomeBudgets", selectedBudget.id);
                await setDoc(budgetRef, dataToSave, { merge: true });
                toast({ title: "Orçamento atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
            // Parent component will refetch and pass down new props
        } catch (error) {
            console.error("Error saving budget:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o registro de orçamento." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedBudget) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "inHomeBudgets", selectedBudget.id));
            setBudgets(prev => prev.filter(p => p.id !== selectedBudget.id));
            toast({ title: "Orçamento excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedBudget(null);
        } catch (error) {
            console.error("Error deleting budget:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o registro." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                            <Home className="w-5 h-5" /><DollarSign className="w-5 h-5" /> Registros Manuais de Orçamento
                            </CardTitle>
                            <CardDescription>Adicione manualmente orçamentos aprovados que contarão para a meta dos técnicos de campo.</CardDescription>
                        </div>
                         <Button onClick={handleOpenAddDialog}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Registrar Orçamento
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center p-4">Carregando orçamentos...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Aprovado Por</TableHead>
                                    <TableHead>OS</TableHead>
                                    <TableHead>Valor (R$)</TableHead>
                                    <TableHead>Observações</TableHead>
                                    <TableHead className="text-right w-[220px]">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {budgets.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.date ? format(item.date, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                        <TableCell className="font-medium">{item.approvedBy}</TableCell>
                                        <TableCell className="font-mono">{item.serviceOrderNumber}</TableCell>
                                        <TableCell className="font-mono text-green-600">{item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                        <TableCell>{item.observations}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(item)}>
                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                            </Button>
                                            <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(item)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{dialogMode === 'add' ? 'Registrar Novo Orçamento' : 'Editar Orçamento'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do orçamento In-Home.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="space-y-2">
                            <Label htmlFor="date">Data</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !formData.date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formData.date ? (
                                        format(formData.date, "PPP", { locale: ptBR })
                                        ) : (
                                        <span>Selecione uma data</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    locale={ptBR}
                                    mode="single"
                                    selected={formData.date}
                                    onSelect={(date) => handleFormSelectChange('date', date)}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="approvedBy">Aprovado Por (Opcional)</Label>
                            <Input id="approvedBy" value={formData.approvedBy || ''} onChange={handleFormInputChange} placeholder="Nome do técnico ou aprovador" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="serviceOrderNumber">Nº da OS (Samsung)</Label>
                            <Input id="serviceOrderNumber" value={formData.serviceOrderNumber || ''} onChange={handleFormInputChange} placeholder="Número da OS relacionada" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="value">Valor Aprovado (R$)</Label>
                            <Input id="value" type="number" value={formData.value || 0} onChange={handleFormInputChange} placeholder="Ex: 550.00" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="observations">Observações</Label>
                            <Textarea id="observations" value={formData.observations || ''} onChange={handleFormInputChange} placeholder="Descreva observações adicionais" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFormDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o registro de orçamento da OS
                            <span className="font-bold mx-1">{selectedBudget?.serviceOrderNumber}</span>.
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

function FieldBudgetsTab({ technicians, filteredServiceOrders }: { technicians: Technician[], filteredServiceOrders: ServiceOrder[] }) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(false);
    }, [filteredServiceOrders]);

    if (isLoading) {
        return <div className="text-center p-4">Carregando orçamentos de campo...</div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <UserCheck /> Orçamentos Aprovados (Campo)
                </CardTitle>
                <CardDescription>Orçamentos registrados pelos técnicos durante as visitas.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Técnico</TableHead>
                            <TableHead>OS</TableHead>
                            <TableHead>ASC Job No.</TableHead>
                            <TableHead>Valor (R$)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredServiceOrders.length > 0 ? (
                            filteredServiceOrders.map(order => (
                                <TableRow key={order.id}>
                                    <TableCell>{format(order.date, 'dd/MM/yyyy')}</TableCell>
                                    <TableCell className="font-medium">{technicians.find(t => t.id === order.technicianId)?.name || 'N/A'}</TableCell>
                                    <TableCell className="font-mono">{order.serviceOrderNumber}</TableCell>
                                    <TableCell className="font-mono">{(order as any).ascJobNumber || 'N/A'}</TableCell>
                                    <TableCell className="font-mono text-green-600">
                                        {order.samsungBudgetValue?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">Nenhum orçamento de campo aprovado no período.</TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}


function ChargebacksTab({ technicians, filteredChargebacks }: { technicians: Technician[], filteredChargebacks: Chargeback[] }) {
    const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
    const [selectedChargeback, setSelectedChargeback] = useState<Chargeback | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Omit<Chargeback, 'id' | 'technicianName'>>>({
        technicianId: '',
        serviceOrderNumber: '',
        value: 0,
        reason: '',
        date: new Date(),
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setIsLoading(true);
        const enrichedChargebacks = filteredChargebacks.map(c => ({
            ...c,
            technicianName: technicians.find(t => t.id === c.technicianId)?.name || 'N/A',
        }));
        setChargebacks(enrichedChargebacks);
        setIsLoading(false);
    }, [filteredChargebacks, technicians]);

    const handleOpenAddDialog = () => {
        setDialogMode('add');
        setSelectedChargeback(null);
        setFormData({ technicianId: '', serviceOrderNumber: '', value: 0, reason: '', date: new Date() });
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (item: Chargeback) => {
        setDialogMode('edit');
        setSelectedChargeback(item);
        setFormData({ ...item });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (item: Chargeback) => {
        setSelectedChargeback(item);
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleFormSelectChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        if (!formData.technicianId || !formData.serviceOrderNumber || !formData.date || !formData.reason || !formData.value) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "Todos os campos são obrigatórios." });
            return;
        }

        if (formData.value <= 0) {
            toast({ variant: "destructive", title: "Valor inválido", description: "O valor do estorno deve ser maior que zero." });
            return;
        }

        setIsSubmitting(true);
        const dataToSave = { ...formData };

        try {
            if (dialogMode === 'add') {
                await addDoc(collection(db, "chargebacks"), dataToSave);
                toast({ title: "Estorno registrado com sucesso!" });
            } else if (selectedChargeback) {
                const chargebackRef = doc(db, "chargebacks", selectedChargeback.id);
                await setDoc(chargebackRef, dataToSave, { merge: true });
                toast({ title: "Estorno atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
             // Parent component will refetch and pass down new props
        } catch (error) {
            console.error("Error saving chargeback:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o registro de estorno." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedChargeback) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "chargebacks", selectedChargeback.id));
            setChargebacks(prev => prev.filter(p => p.id !== selectedChargeback.id));
            toast({ title: "Estorno excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedChargeback(null);
        } catch (error) {
            console.error("Error deleting chargeback:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o registro." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                         <div>
                            <CardTitle className="flex items-center gap-2">
                            <FileMinus /> Registros de Estorno
                            </CardTitle>
                            <CardDescription>Adicione e gerencie os estornos que serão deduzidos do faturamento dos técnicos.</CardDescription>
                         </div>
                        <Button onClick={handleOpenAddDialog}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Registrar Estorno
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center p-4">Carregando estornos...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Técnico</TableHead>
                                    <TableHead>OS</TableHead>
                                    <TableHead>Valor (R$)</TableHead>
                                    <TableHead>Motivo</TableHead>
                                    <TableHead className="text-right w-[220px]">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {chargebacks.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.date ? format(item.date, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                        <TableCell className="font-medium">{item.technicianName}</TableCell>
                                        <TableCell className="font-mono">{item.serviceOrderNumber}</TableCell>
                                        <TableCell className="font-mono text-red-600">-{item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                        <TableCell>{item.reason}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(item)}>
                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                            </Button>
                                            <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(item)}>
                                                <Trash2 className="mr-2 h-4 w-4" /> Excluir
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{dialogMode === 'add' ? 'Registrar Novo Estorno' : 'Editar Estorno'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do estorno.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="space-y-2">
                            <Label htmlFor="date">Data do Estorno</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !formData.date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formData.date ? (
                                        format(formData.date, "PPP", { locale: ptBR })
                                        ) : (
                                        <span>Selecione uma data</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    locale={ptBR}
                                    mode="single"
                                    selected={formData.date}
                                    onSelect={(date) => handleFormSelectChange('date', date)}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="technicianId">Técnico</Label>
                            <Select value={formData.technicianId} onValueChange={(v) => handleFormSelectChange('technicianId', v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione um técnico" /></SelectTrigger>
                                <SelectContent>
                                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="serviceOrderNumber">Nº da OS</Label>
                            <Input id="serviceOrderNumber" value={formData.serviceOrderNumber || ''} onChange={handleFormInputChange} placeholder="Número da OS relacionada" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="value">Valor do Estorno (R$)</Label>
                            <Input id="value" type="number" value={formData.value || 0} onChange={handleFormInputChange} placeholder="Ex: 50.00" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason">Motivo</Label>
                            <Textarea id="reason" value={formData.reason || ''} onChange={handleFormInputChange} placeholder="Descreva o motivo do estorno" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsFormDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={isSubmitting}>
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o registro de estorno da OS
                            <span className="font-bold mx-1">{selectedChargeback?.serviceOrderNumber}</span>.
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

function GoalManagement() {
    const { toast } = useToast();
    const [goalValue, setGoalValue] = useState<number>(15000);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchGoal = async () => {
            setIsLoading(true);
            try {
                const goalDocRef = doc(db, "configs", "inHomeGoal");
                const goalDoc = await getDoc(goalDocRef);
                if (goalDoc.exists()) {
                    setGoalValue(goalDoc.data().value || 15000);
                }
            } catch (error) {
                console.error("Error fetching goal:", error);
                toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar a meta salva." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchGoal();
    }, [toast]);
    
    const handleSaveGoal = async () => {
        setIsSubmitting(true);
        try {
            const goalDocRef = doc(db, "configs", "inHomeGoal");
            await setDoc(goalDocRef, { value: goalValue });
            toast({ title: "Meta salva com sucesso!" });
        } catch (error) {
            console.error("Error saving goal:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar a meta." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gerenciar Meta In-Home</CardTitle>
                <CardDescription>Defina a meta de faturamento geral para os serviços In-Home. Este valor será usado no dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="in-home-goal">Meta de Faturamento (R$)</Label>
                    <Input 
                        id="in-home-goal"
                        type="number"
                        value={goalValue}
                        onChange={(e) => setGoalValue(parseFloat(e.target.value) || 0)}
                        placeholder="Ex: 15000"
                        disabled={isLoading || isSubmitting}
                    />
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSaveGoal} disabled={isLoading || isSubmitting}>
                    <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Meta"}
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function InHomeManagementPage() {
    const { toast } = useToast();
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [allBudgets, setAllBudgets] = useState<InHomeBudget[]>([]);
    const [allChargebacks, setAllChargebacks] = useState<Chargeback[]>([]);
    const [allServiceOrders, setAllServiceOrders] = useState<ServiceOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date());

    const years = Array.from({ length: 5 }, (_, i) => getYear(new Date()) - i);
    const months = Array.from({ length: 12 }, (_, i) => ({
        value: i,
        label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
    }));


    useEffect(() => {
        const fetchAllData = async () => {
            setIsLoading(true);
            try {
                const [techsSnapshot, budgetsSnapshot, chargebacksSnapshot, serviceOrdersSnapshot] = await Promise.all([
                    getDocs(collection(db, "technicians")),
                    getDocs(collection(db, "inHomeBudgets")),
                    getDocs(collection(db, "chargebacks")),
                    getDocs(collection(db, "serviceOrders")),
                ]);
                
                const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);

                const budgetsData = budgetsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        date: (data.date as Timestamp)?.toDate(),
                    } as InHomeBudget;
                });
                setAllBudgets(budgetsData);
                
                const chargebacksData = chargebacksSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        date: (data.date as Timestamp)?.toDate(),
                    } as Chargeback;
                });
                setAllChargebacks(chargebacksData);

                const serviceOrdersData = serviceOrdersSnapshot.docs.map(doc => {
                     const data = doc.data();
                     return {
                        id: doc.id,
                        ...data,
                        date: (data.date as Timestamp).toDate(),
                    } as ServiceOrder;
                });
                setAllServiceOrders(serviceOrdersData);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: "destructive", title: "Erro ao carregar dados" });
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllData();
    }, [toast]);
    
    const filteredBudgets = useMemo(() => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        return allBudgets.filter(b => b.date && isWithinInterval(b.date, { start, end }))
                         .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [allBudgets, selectedDate]);

    const filteredChargebacks = useMemo(() => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        return allChargebacks.filter(c => c.date && isWithinInterval(c.date, { start, end }))
                             .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [allChargebacks, selectedDate]);
    
    const filteredServiceOrders = useMemo(() => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        return allServiceOrders
            .filter(so => so.date && isWithinInterval(so.date, { start, end }) && so.samsungBudgetApproved && so.serviceType === 'visita_orcamento_samsung')
            .sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [allServiceOrders, selectedDate]);
    
    if (isLoading) {
        return <p className="text-center p-6">Carregando...</p>;
    }
    
    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Gerenciar Lançamentos In-Home</h1>
            </div>

            <GoalManagement />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter />Filtro por Período</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4">
                     <div className="flex-1 space-y-2">
                        <Label>Mês</Label>
                        <Select
                            value={String(getMonth(selectedDate))}
                            onValueChange={(value) => setSelectedDate(prev => setMonth(prev, Number(value)))}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {months.map(month => (
                                    <SelectItem key={month.value} value={String(month.value)}>
                                        {month.label.charAt(0).toUpperCase() + month.label.slice(1)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="flex-1 space-y-2">
                        <Label>Ano</Label>
                        <Select
                            value={String(getYear(selectedDate))}
                            onValueChange={(value) => setSelectedDate(prev => setYear(prev, Number(value)))}
                        >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {years.map(year => (
                                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="budgets">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="budgets">Lançamentos Manuais</TabsTrigger>
                    <TabsTrigger value="field_budgets">Orçamentos de Campo</TabsTrigger>
                    <TabsTrigger value="chargebacks">Registrar Estorno</TabsTrigger>
                </TabsList>
                <TabsContent value="budgets" className="mt-6">
                   <BudgetsTab technicians={technicians} filteredBudgets={filteredBudgets} />
                </TabsContent>
                 <TabsContent value="field_budgets" className="mt-6">
                   <FieldBudgetsTab technicians={technicians} filteredServiceOrders={filteredServiceOrders} />
                </TabsContent>
                <TabsContent value="chargebacks" className="mt-6">
                   <ChargebacksTab technicians={technicians} filteredChargebacks={filteredChargebacks} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
