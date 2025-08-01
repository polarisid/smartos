
"use client";

import { useState, useEffect } from "react";
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
import { PlusCircle, Edit, Trash2, FileMinus, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Chargeback, type Technician } from "@/lib/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Textarea } from "@/components/ui/textarea";

type FormData = Omit<Chargeback, 'id' | 'technicianName'>;

export default function ChargebacksPage() {
    const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);

    const [selectedChargeback, setSelectedChargeback] = useState<Chargeback | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<Partial<FormData>>({
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
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [chargebacksSnapshot, techsSnapshot] = await Promise.all([
                    getDocs(collection(db, "chargebacks")),
                    getDocs(collection(db, "technicians")),
                ]);
                
                const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);
                
                const chargebacksData = chargebacksSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        date: (data.date as Timestamp)?.toDate(),
                        technicianName: techs.find(t => t.id === data.technicianId)?.name || 'N/A',
                    } as Chargeback;
                }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
                setChargebacks(chargebacksData);

            } catch (error) {
                console.error("Error fetching data:", error);
                toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os dados do banco de dados." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [toast]);

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
            const technicianName = technicians.find(t => t.id === dataToSave.technicianId)?.name;
            const fullDataToSave: Chargeback = { id: '', technicianName, ...dataToSave } as Chargeback;

            if (dialogMode === 'add') {
                const docRef = await addDoc(collection(db, "chargebacks"), dataToSave);
                fullDataToSave.id = docRef.id;
                setChargebacks(prev => [...prev, fullDataToSave].sort((a,b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
                toast({ title: "Estorno registrado com sucesso!" });
            } else if (selectedChargeback) {
                const chargebackRef = doc(db, "chargebacks", selectedChargeback.id);
                await setDoc(chargebackRef, dataToSave, { merge: true });
                fullDataToSave.id = selectedChargeback.id;
                setChargebacks(prev => prev.map(p => p.id === selectedChargeback.id ? fullDataToSave : p).sort((a,b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)));
                toast({ title: "Estorno atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
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
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Estornos</h1>
                    <Button onClick={handleOpenAddDialog}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Registrar Estorno
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <FileMinus /> Registros de Estorno
                        </CardTitle>
                        <CardDescription>Adicione e gerencie os estornos que serão deduzidos do faturamento dos técnicos.</CardDescription>
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
            </div>

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
