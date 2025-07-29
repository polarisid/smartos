
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
import { PlusCircle, Edit, Trash2, History, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Return, type Technician, type ServiceOrder } from "@/lib/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type FormData = Omit<Return, 'id' | 'technicianName'>;

export default function ReturnsPage() {
    const [returns, setReturns] = useState<Return[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);

    const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<Partial<FormData>>({
        technicianId: '',
        originalServiceOrder: '',
        originalReplacedPart: '',
        returnServiceOrder: '',
        returnReplacedPart: '',
        productModel: '',
        daysToReturn: 0,
        returnDate: new Date(),
    });

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [returnsSnapshot, techsSnapshot, ordersSnapshot] = await Promise.all([
                    getDocs(collection(db, "returns")),
                    getDocs(collection(db, "technicians")),
                    getDocs(collection(db, "serviceOrders")),
                ]);
                
                const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
                setTechnicians(techs);

                const orders = ordersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, date: (doc.data().date as Timestamp).toDate() } as ServiceOrder));
                setServiceOrders(orders);
                
                const returnsData = returnsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data,
                        returnDate: (data.returnDate as Timestamp)?.toDate(),
                        technicianName: techs.find(t => t.id === data.technicianId)?.name || 'N/A',
                    } as Return;
                }).sort((a, b) => (b.returnDate?.getTime() || 0) - (a.returnDate?.getTime() || 0));
                setReturns(returnsData);

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
        setSelectedReturn(null);
        setFormData({ technicianId: '', originalServiceOrder: '', originalReplacedPart: '', returnServiceOrder: '', returnReplacedPart: '', productModel: '', daysToReturn: 0, returnDate: new Date() });
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (item: Return) => {
        setDialogMode('edit');
        setSelectedReturn(item);
        setFormData({
            ...item
        });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (item: Return) => {
        setSelectedReturn(item);
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseInt(value) || 0 : value }));
    };

    const handleFormSelectChange = (id: string, value: any) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        if (!formData.technicianId || !formData.originalServiceOrder || !formData.returnServiceOrder || !formData.productModel || !formData.returnDate) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "Todos os campos, exceto peças trocadas, são obrigatórios." });
            return;
        }

        setIsSubmitting(true);
        const dataToSave = { ...formData };

        try {
            const technicianName = technicians.find(t => t.id === dataToSave.technicianId)?.name;
            const fullDataToSave: Return = { id: '', technicianName, ...dataToSave } as Return;

            if (dialogMode === 'add') {
                const docRef = await addDoc(collection(db, "returns"), dataToSave);
                fullDataToSave.id = docRef.id;
                setReturns(prev => [...prev, fullDataToSave].sort((a,b) => (b.returnDate?.getTime() || 0) - (a.returnDate?.getTime() || 0)));
                toast({ title: "Retorno registrado com sucesso!" });
            } else if (selectedReturn) {
                const returnRef = doc(db, "returns", selectedReturn.id);
                await setDoc(returnRef, dataToSave, { merge: true });
                fullDataToSave.id = selectedReturn.id;
                setReturns(prev => prev.map(p => p.id === selectedReturn.id ? fullDataToSave : p).sort((a,b) => (b.returnDate?.getTime() || 0) - (a.returnDate?.getTime() || 0)));
                toast({ title: "Retorno atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
        } catch (error) {
            console.error("Error saving return:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o registro de retorno." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedReturn) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "returns", selectedReturn.id));
            setReturns(prev => prev.filter(p => p.id !== selectedReturn.id));
            toast({ title: "Retorno excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedReturn(null);
        } catch (error) {
            console.error("Error deleting return:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o registro." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Retornos</h1>
                    <Button onClick={handleOpenAddDialog}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Registrar Retorno
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <History /> Registros de Retorno
                        </CardTitle>
                        <CardDescription>Adicione e gerencie os retornos de serviço dos técnicos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center p-4">Carregando retornos...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data Retorno</TableHead>
                                        <TableHead>Técnico</TableHead>
                                        <TableHead>OS Original</TableHead>
                                        <TableHead>OS Retorno</TableHead>
                                        <TableHead>Modelo</TableHead>
                                        <TableHead>Dias</TableHead>
                                        <TableHead className="text-right w-[220px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {returns.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.returnDate ? format(item.returnDate, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                            <TableCell className="font-medium">{item.technicianName}</TableCell>
                                            <TableCell className="font-mono">{item.originalServiceOrder}</TableCell>
                                            <TableCell className="font-mono">{item.returnServiceOrder}</TableCell>
                                            <TableCell>{item.productModel}</TableCell>
                                            <TableCell>{item.daysToReturn}</TableCell>
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
                        <DialogTitle>{dialogMode === 'add' ? 'Registrar Novo Retorno' : 'Editar Retorno'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do retorno de serviço.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                         <div className="space-y-2">
                            <Label htmlFor="returnDate">Data do Retorno</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !formData.returnDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {formData.returnDate ? (
                                        format(formData.returnDate, "PPP", { locale: ptBR })
                                        ) : (
                                        <span>Selecione uma data</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    locale={ptBR}
                                    mode="single"
                                    selected={formData.returnDate}
                                    onSelect={(date) => handleFormSelectChange('returnDate', date)}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="technicianId">Técnico Responsável</Label>
                            <Select value={formData.technicianId} onValueChange={(v) => handleFormSelectChange('technicianId', v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione um técnico" /></SelectTrigger>
                                <SelectContent>
                                    {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="productModel">Modelo do Produto</Label>
                            <Input id="productModel" value={formData.productModel || ''} onChange={handleFormInputChange} placeholder="Ex: QN55Q80AAGXZD" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="daysToReturn">Dias para Retorno</Label>
                            <Input id="daysToReturn" type="number" value={formData.daysToReturn || 0} onChange={handleFormInputChange} placeholder="Nº de dias" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="originalServiceOrder">OS Original</Label>
                            <Input id="originalServiceOrder" value={formData.originalServiceOrder || ''} onChange={handleFormInputChange} placeholder="Número da primeira OS" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="originalReplacedPart">Peça Trocada (Original - Opcional)</Label>
                            <Input id="originalReplacedPart" value={formData.originalReplacedPart || ''} onChange={handleFormInputChange} placeholder="Peça trocada no primeiro atendimento" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="returnServiceOrder">OS de Retorno</Label>
                            <Input id="returnServiceOrder" value={formData.returnServiceOrder || ''} onChange={handleFormInputChange} placeholder="Número da OS de retorno" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="returnReplacedPart">Peça Trocada (Retorno - Opcional)</Label>
                            <Input id="returnReplacedPart" value={formData.returnReplacedPart || ''} onChange={handleFormInputChange} placeholder="Peça trocada no retorno" />
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
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o registro de retorno da OS
                            <span className="font-bold mx-1">{selectedReturn?.returnServiceOrder}</span>.
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
