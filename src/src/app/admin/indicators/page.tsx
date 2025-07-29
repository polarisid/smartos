
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
import { PlusCircle, Edit, Trash2, Target, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";
import { type Indicator } from "@/lib/data";

type FormData = Omit<Indicator, 'id'>;

const initialFormData: FormData = {
    name: '',
    description: '',
    goalType: 'text',
    goalValue: 0,
    goalDescription: '',
    evaluationLogic: 'above_is_better',
    currentValue: 0,
};

function LaunchIndicatorsDialog({ indicators, onSave }: { indicators: Indicator[], onSave: (data: Record<string, number>) => Promise<void> }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [indicatorData, setIndicatorData] = useState<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      const initialData = indicators.reduce((acc, indicator) => {
        acc[indicator.id] = indicator.currentValue || 0;
        return acc;
      }, {} as Record<string, number>);
      setIndicatorData(initialData);
    }
  }, [isOpen, indicators]);

  const handleDataChange = (indicatorId: string, value: string) => {
    setIndicatorData(prev => ({
      ...prev,
      [indicatorId]: parseFloat(value) || 0
    }));
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onSave(indicatorData);
      setIsOpen(false);
      toast({ title: "Resultados dos indicadores salvos com sucesso!" });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar os resultados." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Trophy className="mr-2 h-4 w-4" /> Lançar Resultados do Mês
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lançar Resultados dos Indicadores</DialogTitle>
          <DialogDescription>
            Insira o valor alcançado pela equipe para cada indicador neste mês.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {indicators.map(indicator => (
              <div key={indicator.id} className="grid grid-cols-3 items-center gap-4">
                  <Label htmlFor={`indicator-${indicator.id}`} className="col-span-2">{indicator.name}</Label>
                  <Input
                    id={`indicator-${indicator.id}`}
                    type="number"
                    placeholder="Resultado"
                    value={indicatorData[indicator.id] || ''}
                    onChange={(e) => handleDataChange(indicator.id, e.target.value)}
                  />
              </div>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar Resultados"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


export default function IndicatorsPage() {
    const [indicators, setIndicators] = useState<Indicator[]>([]);
    
    const [selectedIndicator, setSelectedIndicator] = useState<Indicator | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<FormData>(initialFormData);

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const indicatorsSnapshot = await getDocs(collection(db, "indicators"));
            const indicatorsData = indicatorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Indicator));
            setIndicators(indicatorsData);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os indicadores do banco de dados." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [toast]);

    const handleOpenAddDialog = () => {
        setDialogMode('add');
        setSelectedIndicator(null);
        setFormData(initialFormData);
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (indicator: Indicator) => {
        setDialogMode('edit');
        setSelectedIndicator(indicator);
        setFormData({ 
            name: indicator.name, 
            description: indicator.description,
            goalType: indicator.goalType || 'text',
            goalValue: indicator.goalValue || 0,
            goalDescription: indicator.goalDescription || '',
            evaluationLogic: indicator.evaluationLogic || 'above_is_better',
            currentValue: indicator.currentValue || 0,
        });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (indicator: Indicator) => {
        setSelectedIndicator(indicator);
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    };
    
    const handleFormSelectChange = (id: string, value: string) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    }

    const handleSave = async () => {
        if (!formData.name) {
            toast({ variant: "destructive", title: "Campo obrigatório", description: "O nome do indicador é obrigatório." });
            return;
        }
        setIsSubmitting(true);
        try {
            if (dialogMode === 'add') {
                const docRef = await addDoc(collection(db, "indicators"), formData);
                setIndicators(prev => [...prev, { id: docRef.id, ...formData }]);
                toast({ title: "Indicador criado com sucesso!" });
            } else if (selectedIndicator) {
                const indicatorRef = doc(db, "indicators", selectedIndicator.id);
                await setDoc(indicatorRef, formData, { merge: true });
                setIndicators(prev => prev.map(p => p.id === selectedIndicator.id ? { id: selectedIndicator.id, ...formData } : p));
                toast({ title: "Indicador atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
        } catch (error) {
            console.error("Error saving indicator:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o indicador." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedIndicator) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "indicators", selectedIndicator.id));
            setIndicators(prev => prev.filter(p => p.id !== selectedIndicator.id));
            toast({ title: "Indicador excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedIndicator(null);
        } catch (error) {
            console.error("Error deleting indicator:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o indicador." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveIndicatorResults = async (data: Record<string, number>) => {
        const batch = writeBatch(db);

        Object.entries(data).forEach(([indicatorId, value]) => {
            const docRef = doc(db, "indicators", indicatorId);
            batch.update(docRef, { currentValue: value });
        });

        await batch.commit();
        await fetchData(); // Refresh data to show new values
    };

    const getGoalDisplay = (indicator: Indicator) => {
        if (indicator.goalType === 'percentage') {
            const logicText = indicator.evaluationLogic === 'above_is_better' ? 'Acima é melhor' : 'Abaixo é melhor';
            return `${indicator.goalValue}% (${logicText})`
        }
        return indicator.goalDescription || '-';
    }
    
    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Indicadores</h1>
                    <div className="flex items-center gap-2">
                        <LaunchIndicatorsDialog indicators={indicators} onSave={handleSaveIndicatorResults} />
                        <Button onClick={handleOpenAddDialog}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Criar Indicador
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Target /> Indicadores de Desempenho da Equipe
                        </CardTitle>
                        <CardDescription>Crie e gerencie os indicadores e suas respectivas metas que serão usados para avaliar a equipe.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center p-4">Carregando indicadores...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome do Indicador</TableHead>
                                        <TableHead>Meta</TableHead>
                                        <TableHead>Resultado Atual</TableHead>
                                        <TableHead>Descrição</TableHead>
                                        <TableHead className="text-right w-[220px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {indicators.map((indicator) => (
                                        <TableRow key={indicator.id}>
                                            <TableCell className="font-medium">{indicator.name}</TableCell>
                                            <TableCell>{getGoalDisplay(indicator)}</TableCell>
                                            <TableCell className="font-mono font-semibold">
                                                {indicator.currentValue ?? 0}{indicator.goalType === 'percentage' ? '%' : ''}
                                            </TableCell>
                                            <TableCell>{indicator.description}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(indicator)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Editar
                                                </Button>
                                                <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(indicator)}>
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
                        <DialogTitle>{dialogMode === 'add' ? 'Criar Novo Indicador' : 'Editar Indicador'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do indicador de desempenho.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome do Indicador</Label>
                            <Input id="name" value={formData.name} onChange={handleFormInputChange} placeholder="Ex: Organização da Viatura" />
                        </div>

                         <div className="space-y-2">
                            <Label htmlFor="description">Descrição</Label>
                            <Textarea id="description" value={formData.description} onChange={handleFormInputChange} placeholder="Breve descrição do que este indicador avalia" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="goalType">Tipo de Meta</Label>
                                <Select value={formData.goalType} onValueChange={(value) => handleFormSelectChange('goalType', value)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="text">Texto</SelectItem>
                                        <SelectItem value="percentage">Percentual</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {formData.goalType === 'percentage' && (
                                <div className="space-y-2">
                                    <Label htmlFor="evaluationLogic">Lógica de Avaliação</Label>
                                    <Select value={formData.evaluationLogic} onValueChange={(value) => handleFormSelectChange('evaluationLogic', value as 'above_is_better' | 'below_is_better')}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="above_is_better">Acima da meta é melhor</SelectItem>
                                            <SelectItem value="below_is_better">Abaixo da meta é melhor</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {formData.goalType === 'percentage' ? (
                            <div className="space-y-2">
                                <Label htmlFor="goalValue">Valor da Meta (%)</Label>
                                <Input id="goalValue" type="number" value={formData.goalValue} onChange={handleFormInputChange} placeholder="Ex: 95" />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="goalDescription">Descrição da Meta</Label>
                                <Input id="goalDescription" value={formData.goalDescription || ''} onChange={handleFormInputChange} placeholder="Ex: Manter sempre limpa e organizada" />
                            </div>
                        )}

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
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o indicador
                            <span className="font-bold mx-1">{selectedIndicator?.name}</span>.
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
