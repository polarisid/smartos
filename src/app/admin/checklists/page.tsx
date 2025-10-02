
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, PlusCircle, Edit, Trash2, TestTube2, FileDown, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type ChecklistTemplate, type ChecklistField } from "@/lib/data";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, deleteDoc, setDoc, getDoc } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;


type FieldWithPosition = ChecklistField & { x: number; y: number };

function TestChecklistDialog({ template }: { template: ChecklistTemplate | null }) {
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [formData, setFormData] = useState<Record<string, string | boolean>>({});
    const [fields, setFields] = useState<FieldWithPosition[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    useEffect(() => {
        if (isDialogOpen && template) {
            // Fetch fields when dialog opens
            const fetchFields = async () => {
                const docRef = doc(db, 'checklistTemplates', template.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as ChecklistTemplate;
                    const initialFields = (data.fields || []).map(f => ({
                        ...f,
                        x: f.x || 50,
                        y: f.y || 50
                    }));
                    setFields(initialFields as FieldWithPosition[]);
                }
            };
            fetchFields();
        }
    }, [isDialogOpen, template]);


    const handleInputChange = (fieldId: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleGeneratePdf = async () => {
        if (!template) return;
        setIsGenerating(true);
        try {
            const pdfUrl = `${window.location.origin}${template.pdfUrl}`;
            const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();
            
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            fields.forEach(field => {
                const value = formData[field.id];
                if (value !== undefined) {
                    const pageToDraw = pages[field.page - 1] || pages[0];
                    const { height: pageHeight } = pageToDraw.getSize();

                    if (field.type === 'text' && typeof value === 'string') {
                        pageToDraw.drawText(value, {
                            x: field.x,
                            y: pageHeight - field.y - 10,
                            font,
                            size: 12,
                            color: rgb(0, 0, 0),
                        });
                    } else if (field.type === 'checkbox' && value === true) {
                         pageToDraw.drawText('X', {
                            x: field.x + 2,
                            y: pageHeight - field.y - 12,
                            font,
                            size: 14,
                            color: rgb(0, 0, 0),
                        });
                    }
                }
            });

            const pdfBytes = await pdfDoc.save();

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `teste_${template.name.replace(/\s+/g, '_')}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Erro ao Gerar PDF", description: "Não foi possível gerar o PDF de teste." });
        } finally {
            setIsGenerating(false);
        }
    };

    if (!template) return null;

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2">
                    <TestTube2 className="mr-2 h-4 w-4" /> Testar
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Testar: {template.name}</DialogTitle>
                    <DialogDescription>
                        Preencha os campos para gerar um PDF de teste e verificar o posicionamento.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    {fields.length === 0 ? <p className="text-muted-foreground text-center">Nenhum campo configurado para este checklist.</p> : fields.map(field => (
                        <div key={field.id} className="space-y-2">
                             <Label htmlFor={`test-${field.id}`}>{field.name} (Pág. {field.page})</Label>
                            {field.type === 'text' ? (
                                <Input 
                                    id={`test-${field.id}`}
                                    placeholder={`Valor para ${field.name}`}
                                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                                />
                            ) : (
                                <div className="flex items-center space-x-2">
                                    <input 
                                        type="checkbox"
                                        id={`test-${field.id}`}
                                        className="h-4 w-4"
                                        onChange={(e) => handleInputChange(field.id, e.target.checked)}
                                    />
                                    <label htmlFor={`test-${field.id}`} className="text-sm">Marcar</label>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button onClick={handleGeneratePdf} disabled={isGenerating || fields.length === 0}>
                        {isGenerating ? 'Gerando...' : 'Gerar PDF de Teste'} <FileDown className="ml-2 h-4 w-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function ChecklistsPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    
    const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
    const [formData, setFormData] = useState<{ name: string; pdfUrl: string }>({ name: '', pdfUrl: '' });
    
    const availablePdfs = [
        { name: "Checklist TV/AV - INHOME", path: "/checklists/checklist-tv-av-inhome.pdf" },
        { name: "Checklist Linha Branca (DA)", path: "/checklists/da.pdf" },
        { name: "Checklist TV Reparo", path: "/checklists/checklist_tv_reparo.pdf" },
        { name: "Checklist TV - NDF (Sem Defeito)", path: "/checklists/checklist_tv_NDF.pdf" },
        { name: "Checklist DTV IH - VOID", path: "/checklists/dtv-ih-void.pdf" },
        { name: "Checklist TV - VOID", path: "/checklists/checklists_tv_void.pdf" },
    ];

    useEffect(() => {
        const fetchTemplates = async () => {
            setIsLoading(true);
            try {
                const snapshot = await getDocs(collection(db, "checklistTemplates"));
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistTemplate));
                setTemplates(data);
            } catch (error) {
                console.error("Error fetching checklist templates:", error);
                toast({ variant: "destructive", title: "Erro ao buscar dados", description: "Não foi possível carregar os modelos de checklist." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchTemplates();
    }, [toast]);

    const handleOpenAddDialog = () => {
        setFormMode('add');
        setSelectedTemplate(null);
        setFormData({ name: '', pdfUrl: '' });
        setIsFormOpen(true);
    };

    const handleOpenEditDialog = (template: ChecklistTemplate) => {
        setFormMode('edit');
        setSelectedTemplate(template);
        setFormData({ name: template.name, pdfUrl: template.pdfUrl });
        setIsFormOpen(true);
    };

    const handleOpenFieldsDialog = (template: ChecklistTemplate) => {
        router.push(`/admin/checklists/${template.id}`);
    };

    const handleOpenDeleteDialog = (template: ChecklistTemplate) => {
        setSelectedTemplate(template);
        setIsDeleteOpen(true);
    }
    
    const handleSave = async () => {
        if (!formData.name || !formData.pdfUrl) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "O nome do modelo e a seleção do PDF são obrigatórios." });
            return;
        }

        setIsSubmitting(true);
        try {
            if (formMode === 'add') {
                const docData = { 
                    name: formData.name, 
                    pdfUrl: formData.pdfUrl,
                    fields: [] 
                };
                const newDocRef = await addDoc(collection(db, "checklistTemplates"), docData);

                setTemplates(prev => [...prev, { id: newDocRef.id, ...docData }]);
                toast({ title: "Modelo salvo com sucesso!", description: "O novo modelo de checklist foi adicionado."});

            } else if (selectedTemplate) {
                 const docRef = doc(db, "checklistTemplates", selectedTemplate.id);
                 const updatedData = { ...selectedTemplate, name: formData.name, pdfUrl: formData.pdfUrl };
                 await setDoc(docRef, { name: formData.name, pdfUrl: formData.pdfUrl }, { merge: true });
                 setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? updatedData : t));
                 toast({ title: "Modelo atualizado!", description: "Os dados do modelo foram alterados." });
            }
            setIsFormOpen(false);
        } catch (error) {
            console.error("Error saving template:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar o modelo." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedTemplate) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "checklistTemplates", selectedTemplate.id));
            
            setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
            toast({ title: "Modelo excluído", description: `O modelo "${selectedTemplate.name}" foi excluído com sucesso.` });
            setIsDeleteOpen(false);
            setSelectedTemplate(null);
        } catch (error: any) {
            console.error("Error deleting template:", error);
            toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o modelo." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDuplicate = async (template: ChecklistTemplate) => {
        setIsSubmitting(true);
        try {
            const docData = {
                name: `Cópia de ${template.name}`,
                pdfUrl: template.pdfUrl,
                fields: template.fields || [],
            };
            const newDocRef = await addDoc(collection(db, "checklistTemplates"), docData);
            setTemplates(prev => [...prev, { id: newDocRef.id, ...docData }]);
            toast({ title: "Modelo duplicado com sucesso!" });
        } catch (error) {
            console.error("Error duplicating template:", error);
            toast({ variant: "destructive", title: "Erro ao duplicar", description: "Não foi possível duplicar o modelo." });
        } finally {
            setIsSubmitting(false);
        }
    };

  return (
    <>
        <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Gerenciar Checklists</h1>
                <Button onClick={handleOpenAddDialog}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Criar Modelo de Checklist
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardList />
                        Modelos de Checklist
                    </CardTitle>
                    <CardDescription>
                        Crie e gerencie os modelos de checklist que serão preenchidos pelos técnicos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-center text-muted-foreground py-10">Carregando modelos...</p>
                    ) : templates.length === 0 ? (
                        <div className="text-center text-muted-foreground py-10">
                            <p>Nenhum modelo de checklist encontrado.</p>
                            <p className="text-sm">Clique em "Criar Modelo de Checklist" para adicionar o primeiro.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome do Modelo</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {templates.map(template => (
                                    <TableRow key={template.id}>
                                        <TableCell className="font-medium">{template.name}</TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="outline" size="sm" onClick={() => handleOpenFieldsDialog(template)}>
                                                <Edit className="mr-2 h-4 w-4" /> Editar Campos
                                            </Button>
                                            <Button variant="outline" size="sm" className="ml-2" onClick={() => handleOpenEditDialog(template)}>
                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                            </Button>
                                             <Button variant="outline" size="sm" className="ml-2" onClick={() => handleDuplicate(template)} disabled={isSubmitting}>
                                                <Copy className="mr-2 h-4 w-4" /> Duplicar
                                            </Button>
                                            <TestChecklistDialog template={template} />
                                            <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(template)}>
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

        {/* Form Dialog */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{formMode === 'add' ? 'Criar Novo Modelo' : 'Editar Modelo'}</DialogTitle>
                    <DialogDescription>
                        {formMode === 'add' 
                            ? 'Dê um nome ao modelo e selecione o arquivo PDF correspondente.'
                            : 'Edite os dados do modelo de checklist.'
                        }
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome do Modelo</Label>
                        <Input 
                            id="name" 
                            placeholder="Ex: Checklist de Instalação de TV" 
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                        />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="pdfUrl">Arquivo PDF</Label>
                        <Select 
                            value={formData.pdfUrl} 
                            onValueChange={(value) => setFormData(prev => ({...prev, pdfUrl: value}))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um PDF interno" />
                            </SelectTrigger>
                            <SelectContent>
                                {availablePdfs.map(pdf => (
                                    <SelectItem key={pdf.path} value={pdf.path}>{pdf.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : 'Salvar Modelo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        
        {/* Delete Dialog */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Isso excluirá permanentemente o modelo 
                      <span className="font-bold mx-1">{selectedTemplate?.name ?? ''}</span>. O arquivo PDF interno não será afetado.
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

    

    
