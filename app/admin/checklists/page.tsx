
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
import { ClipboardList, PlusCircle, Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type ChecklistTemplate } from "@/lib/data";
import { db, storage } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, deleteDoc, setDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import path from "path";


export default function ChecklistsPage() {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    
    const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
    const [formData, setFormData] = useState<{ name: string; file: File | null }>({ name: '', file: null });

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
        setFormData({ name: '', file: null });
        setIsFormOpen(true);
    };

    const handleOpenDeleteDialog = (template: ChecklistTemplate) => {
        setSelectedTemplate(template);
        setIsDeleteOpen(true);
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFormData(prev => ({ ...prev, file: e.target.files![0] }));
        }
    };

    const handleSave = async () => {
        if (!formData.name) {
            toast({ variant: "destructive", title: "Campo obrigatório", description: "O nome do modelo é obrigatório." });
            return;
        }
        if (formMode === 'add' && !formData.file) {
            toast({ variant: "destructive", title: "Arquivo obrigatório", description: "Selecione um arquivo PDF para o modelo." });
            return;
        }

        setIsSubmitting(true);
        try {
            if (formMode === 'add') {
                if (!formData.file) {
                    setIsSubmitting(false);
                    return;
                }
                
                // 1. Create doc in Firestore to get an ID
                const newDocRef = doc(collection(db, "checklistTemplates"));
                
                // 2. Create storage ref with the new doc ID
                const fileExtension = path.extname(formData.file.name);
                const storagePath = `checklistTemplates/${newDocRef.id}${fileExtension}`;
                const storageRef = ref(storage, storagePath);

                // 3. Upload file
                await uploadBytes(storageRef, formData.file);

                // 4. Get download URL
                const pdfUrl = await getDownloadURL(storageRef);

                // 5. Save doc data to Firestore
                const docData = { 
                    name: formData.name, 
                    pdfUrl: pdfUrl,
                    fields: [] 
                };
                await setDoc(newDocRef, docData);

                setTemplates(prev => [...prev, { id: newDocRef.id, ...docData }]);
                toast({ title: "Modelo salvo com sucesso!", description: "O novo modelo de checklist foi adicionado."});

            } else {
                 toast({ title: "Funcionalidade em desenvolvimento", description: "A edição do modelo será implementada." });
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
            // Delete Firestore document
            await deleteDoc(doc(db, "checklistTemplates", selectedTemplate.id));
            
            // Delete file from storage
            if (selectedTemplate.pdfUrl) {
                const fileRef = ref(storage, selectedTemplate.pdfUrl);
                await deleteObject(fileRef);
            }
            
            setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
            toast({ title: "Modelo excluído", description: `O modelo "${selectedTemplate.name}" foi excluído com sucesso.` });
            setIsDeleteOpen(false);
            setSelectedTemplate(null);
        } catch (error: any) {
            console.error("Error deleting template:", error);
            if (error.code === 'storage/object-not-found') {
                toast({ variant: "destructive", title: "Arquivo não encontrado", description: "O documento foi excluído, mas o arquivo PDF não foi encontrado no armazenamento." });
                setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
                setIsDeleteOpen(false);
            } else {
                toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível excluir o modelo." });
            }
        } finally {
            setIsSubmitting(false);
        }
    }

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
                                            <Button variant="outline" size="sm" disabled>
                                                <Edit className="mr-2 h-4 w-4" /> Editar
                                            </Button>
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
                        Dê um nome ao modelo e faça o upload do arquivo PDF correspondente.
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
                        <Label htmlFor="pdfFile">Arquivo PDF</Label>
                        <Input 
                            id="pdfFile" 
                            type="file" 
                            accept="application/pdf"
                            onChange={handleFileChange}
                        />
                        {formMode === 'edit' && <p className="text-xs text-muted-foreground">Deixe em branco para manter o PDF atual.</p>}
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
                      <span className="font-bold mx-1">{selectedTemplate?.name}</span> e o arquivo PDF associado.
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
