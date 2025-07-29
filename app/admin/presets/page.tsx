
"use client";

import { useState, useEffect } from "react";
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
import { PlusCircle, Edit, Trash2, Bookmark, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, setDoc, addDoc, deleteDoc } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Preset } from "@/lib/data";

type CodeItem = { code: string; description: string; };
type CodeCategory = { "TV/AV": CodeItem[]; "DA": CodeItem[]; };

type FormData = Omit<Preset, 'id'>;

const defaultVisitTemplate = `Olá, bom dia! Somos da assistência técnica autorizada Samsung. Referente ao seu atendimento da ordem de serviço {{serviceOrder}}, para o cliente {{consumerName}} na cidade de {{city}}. Poderia me confirmar a sua localização?`;

export default function PresetsPage() {
    const [presets, setPresets] = useState<Preset[]>([]);
    const [symptomCodes, setSymptomCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
    const [repairCodes, setRepairCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
    
    const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [formData, setFormData] = useState<FormData>({
        name: '',
        equipmentType: 'TV/AV',
        symptomCode: '',
        repairCode: '',
        replacedPart: '',
        observations: ''
    });

    const [visitTemplate, setVisitTemplate] = useState(defaultVisitTemplate);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [presetsSnapshot, symptomsDoc, repairsDoc, templateDoc] = await Promise.all([
                    getDocs(collection(db, "presets")),
                    getDoc(doc(db, "codes", "symptoms")),
                    getDoc(doc(db, "codes", "repairs")),
                    getDoc(doc(db, "textTemplates", "visitAnnouncement"))
                ]);

                const presetsData = presetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Preset));
                setPresets(presetsData);

                if (symptomsDoc.exists()) setSymptomCodes(symptomsDoc.data() as CodeCategory);
                if (repairsDoc.exists()) setRepairCodes(repairsDoc.data() as CodeCategory);

                if (templateDoc.exists()) {
                    setVisitTemplate(templateDoc.data().template);
                }

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
        setSelectedPreset(null);
        setFormData({ name: '', equipmentType: 'TV/AV', symptomCode: '', repairCode: '', replacedPart: '', observations: '' });
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (preset: Preset) => {
        setDialogMode('edit');
        setSelectedPreset(preset);
        setFormData({
            name: preset.name,
            equipmentType: preset.equipmentType,
            symptomCode: preset.symptomCode,
            repairCode: preset.repairCode,
            replacedPart: preset.replacedPart || '',
            observations: preset.observations || ''
        });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (preset: Preset) => {
        setSelectedPreset(preset);
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleFormSelectChange = (id: string, value: string) => {
        const changes: Partial<FormData> = { [id]: value };
        // Reset codes when equipment type changes
        if (id === 'equipmentType') {
            changes.symptomCode = '';
            changes.repairCode = '';
        }
        setFormData(prev => ({ ...prev, ...changes }));
    };

    const handleSave = async () => {
        if (!formData.name || !formData.symptomCode || !formData.repairCode) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "Nome, sintoma e reparo são obrigatórios." });
            return;
        }
        setIsSubmitting(true);
        try {
            if (dialogMode === 'add') {
                const docRef = await addDoc(collection(db, "presets"), formData);
                setPresets(prev => [...prev, { id: docRef.id, ...formData }]);
                toast({ title: "Preset criado com sucesso!" });
            } else if (selectedPreset) {
                const presetRef = doc(db, "presets", selectedPreset.id);
                await setDoc(presetRef, formData, { merge: true });
                setPresets(prev => prev.map(p => p.id === selectedPreset.id ? { id: selectedPreset.id, ...formData } : p));
                toast({ title: "Preset atualizado com sucesso!" });
            }
            setIsFormDialogOpen(false);
        } catch (error) {
            console.error("Error saving preset:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o preset." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedPreset) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "presets", selectedPreset.id));
            setPresets(prev => prev.filter(p => p.id !== selectedPreset.id));
            toast({ title: "Preset excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedPreset(null);
        } catch (error) {
            console.error("Error deleting preset:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o preset." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleSaveTemplate = async () => {
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, "textTemplates", "visitAnnouncement"), { template: visitTemplate });
            toast({ title: "Modelo de texto salvo com sucesso!" });
        } catch (error) {
            console.error("Error saving text template:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o modelo de texto." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentSymptomOptions = symptomCodes[formData.equipmentType] || [];
    const currentRepairOptions = repairCodes[formData.equipmentType] || [];
    
    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Presets e Modelos</h1>
                    <Button onClick={handleOpenAddDialog}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Criar Preset de Códigos
                    </Button>
                </div>
                
                 <Card>
                    <CardHeader>
                        <CardTitle>Modelos de Texto</CardTitle>
                        <CardDescription>
                            Edite o modelo de texto para o anúncio de visita. Use as variáveis
                            <code className="mx-1 font-mono bg-muted p-1 rounded-sm text-xs">{`{{consumerName}}`}</code>,
                            <code className="mx-1 font-mono bg-muted p-1 rounded-sm text-xs">{`{{serviceOrder}}`}</code> e
                            <code className="mx-1 font-mono bg-muted p-1 rounded-sm text-xs">{`{{city}}`}</code>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Textarea 
                            value={visitTemplate}
                            onChange={(e) => setVisitTemplate(e.target.value)}
                            rows={5}
                            disabled={isLoading}
                        />
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveTemplate} disabled={isSubmitting}>
                            <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Modelo"}
                        </Button>
                    </CardFooter>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Bookmark /> Presets de Códigos
                        </CardTitle>
                        <CardDescription>Crie, edite e gerencie presets de sintoma/reparo para agilizar o lançamento de OS.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center p-4">Carregando presets...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome do Preset</TableHead>
                                        <TableHead>Tipo de Equipamento</TableHead>
                                        <TableHead className="text-right w-[220px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {presets.map((preset) => (
                                        <TableRow key={preset.id}>
                                            <TableCell className="font-medium">{preset.name}</TableCell>
                                            <TableCell>{preset.equipmentType}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenEditDialog(preset)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Editar
                                                </Button>
                                                <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(preset)}>
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
                        <DialogTitle>{dialogMode === 'add' ? 'Criar Novo Preset' : 'Editar Preset'}</DialogTitle>
                        <DialogDescription>
                            Preencha os detalhes do preset para reutilização rápida.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome do Preset</Label>
                            <Input id="name" value={formData.name} onChange={handleFormInputChange} placeholder="Ex: TV não liga" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="equipmentType">Tipo de Equipamento</Label>
                            <Select value={formData.equipmentType} onValueChange={(v) => handleFormSelectChange('equipmentType', v as 'TV/AV' | 'DA')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="TV/AV">TV/AV</SelectItem>
                                    <SelectItem value="DA">DA (Linha Branca)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="symptomCode">Código de Sintoma</Label>
                            <Select value={formData.symptomCode} onValueChange={(v) => handleFormSelectChange('symptomCode', v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione um sintoma" /></SelectTrigger>
                                <SelectContent>
                                    {currentSymptomOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.description}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="repairCode">Código de Reparo</Label>
                            <Select value={formData.repairCode} onValueChange={(v) => handleFormSelectChange('repairCode', v)}>
                                <SelectTrigger><SelectValue placeholder="Selecione um reparo" /></SelectTrigger>
                                <SelectContent>
                                    {currentRepairOptions.map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.description}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="replacedPart">Peça Trocada (Opcional)</Label>
                            <Input id="replacedPart" value={formData.replacedPart || ''} onChange={handleFormInputChange} placeholder="Peça que geralmente é trocada" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="observations">Observações (Opcional)</Label>
                            <Textarea id="observations" value={formData.observations || ''} onChange={handleFormInputChange} placeholder="Observação padrão para este preset" />
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
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente o preset
                            <span className="font-bold mx-1">{selectedPreset?.name}</span>.
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
