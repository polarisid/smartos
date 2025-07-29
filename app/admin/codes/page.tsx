
"use client";

import { useState, useEffect } from "react";
import * as XLSX from 'xlsx';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogTrigger 
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, FileText, Wifi, WifiOff, Edit, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";

type CodeItem = { code: string; description: string; };
type CodeCategory = { "TV/AV": CodeItem[]; "DA": CodeItem[]; };

function CodesTable({ data, onEdit, onDelete, isLoading }: { data: { code: string; description: string }[], onEdit: (item: any) => void, onDelete: (item: any) => void, isLoading: boolean }) {
    if (isLoading) {
      return <div className="text-center p-4">Carregando códigos...</div>
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-[100px]">Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right w-[220px]">Ações</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {data.map(item => (
                    <TableRow key={item.code}>
                        <TableCell className="font-mono">{item.code}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
                            <Edit className="mr-2 h-4 w-4" /> Editar
                          </Button>
                          <Button variant="destructive" size="sm" className="ml-2" onClick={() => onDelete(item)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Excluir
                          </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function ImportDialog({ onImport, isSubmitting }: { onImport: (file: File) => void, isSubmitting: boolean }) {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            setFile(event.target.files[0]);
        }
    };

    const handleImportClick = () => {
        if (file) {
            onImport(file);
            setIsOpen(false);
            setFile(null);
        } else {
            toast({
                variant: "destructive",
                title: "Nenhum arquivo selecionado",
                description: "Por favor, selecione uma planilha para importar.",
            });
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">
                    <FileText className="mr-2 h-4 w-4" /> Importar de Planilha
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Importar Códigos da Planilha</DialogTitle>
                    <DialogDescription>
                        Selecione um arquivo .xlsx ou .csv. A planilha deve ter as colunas: 'tipo' (sintoma/reparo), 'categoria' (TV/AV ou DA), 'codigo' e 'descricao'.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="spreadsheet">Planilha</Label>
                        <Input id="spreadsheet" type="file" onChange={handleFileChange} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={handleImportClick} disabled={isSubmitting}>
                      {isSubmitting ? 'Importando...' : 'Importar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function FirestoreConnectionTest() {
    const [status, setStatus] = useState<"pending" | "success" | "error">("pending");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const testConnection = async () => {
            try {
                // Use a non-essential collection for testing to avoid costs/errors on non-existing collections.
                await getDocs(collection(db, "test-connection"));
                setStatus("success");
            } catch (error: any) {
                console.error("Firestore connection failed:", error);
                setStatus("error");
                setErrorMsg(error.message);
            }
        };

        testConnection();
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Teste de Conexão com Firestore</CardTitle>
                <CardDescription>Verificando o status da conexão com o banco de dados.</CardDescription>
            </CardHeader>
            <CardContent>
                {status === "pending" && <p className="flex items-center text-muted-foreground">Testando conexão...</p>}
                {status === "success" && (
                    <div className="flex items-center gap-2 text-green-600">
                        <Wifi className="h-5 w-5" />
                        <p className="font-semibold">Conexão com Firestore estabelecida com sucesso!</p>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex flex-col gap-2 text-destructive">
                         <div className="flex items-center gap-2">
                             <WifiOff className="h-5 w-5" />
                             <p className="font-semibold">Falha na conexão com o Firestore.</p>
                        </div>
                        <p className="text-xs font-mono bg-muted p-2 rounded">{errorMsg}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function CodesPage() {
    const { toast } = useToast();
    const [symptoms, setSymptoms] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
    const [repairs, setRepairs] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [currentItem, setCurrentItem] = useState<{data: any, type: string, category: string} | null>(null);
    const [formData, setFormData] = useState({ code: '', description: '', type: 'symptom', category: 'TV/AV' });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const symptomsDoc = await getDoc(doc(db, "codes", "symptoms"));
                if (symptomsDoc.exists()) {
                    setSymptoms(symptomsDoc.data() as CodeCategory);
                }
                const repairsDoc = await getDoc(doc(db, "codes", "repairs"));
                if (repairsDoc.exists()) {
                    setRepairs(repairsDoc.data() as CodeCategory);
                }
            } catch (error) {
                console.error("Error fetching codes:", error);
                toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os códigos do banco de dados." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    const handleOpenAddDialog = () => {
        setDialogMode('add');
        setFormData({ code: '', description: '', type: 'symptom', category: 'TV/AV' });
        setCurrentItem(null);
        setIsFormDialogOpen(true);
    };

    const handleOpenEditDialog = (item: any, type: 'symptom' | 'repair', category: 'TV/AV' | 'DA') => {
        setDialogMode('edit');
        setCurrentItem({ data: item, type, category });
        setFormData({ code: item.code, description: item.description, type, category });
        setIsFormDialogOpen(true);
    };

    const handleOpenDeleteDialog = (item: any, type: 'symptom' | 'repair', category: 'TV/AV' | 'DA') => {
        setCurrentItem({ data: item, type, category });
        setIsDeleteDialogOpen(true);
    };

    const handleFormInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleFormSelectChange = (id: string, value: string) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    }

    const handleSave = async () => {
        const { code, description, type, category } = formData;
        if (!code || !description) {
            toast({ variant: "destructive", title: "Erro", description: "Código e Descrição são obrigatórios." });
            return;
        }

        setIsSubmitting(true);
        const stateUpdater = type === 'symptom' ? setSymptoms : setRepairs;
        const currentState = type === 'symptom' ? symptoms : repairs;
        let updatedState: CodeCategory;

        if (dialogMode === 'add') {
             const categoryExists = currentState[category as keyof typeof currentState].some(i => i.code === code);
             if (categoryExists) {
                toast({ variant: "destructive", title: "Erro", description: "Este código já existe para esta categoria." });
                setIsSubmitting(false);
                return;
             }
             const newCategoryData = [...currentState[category as keyof typeof currentState], { code, description }];
             updatedState = { ...currentState, [category as keyof typeof currentState]: newCategoryData };
        } else if (currentItem) {
             const originalCode = currentItem.data.code;
             const updatedCategoryData = currentState[category as keyof typeof currentState].map(i => 
                i.code === originalCode ? { code, description } : i
            );
            updatedState = { ...currentState, [category as keyof typeof currentState]: updatedCategoryData };
        } else {
            setIsSubmitting(false);
            return;
        }

        try {
            await setDoc(doc(db, "codes", type), updatedState);
            stateUpdater(updatedState);
            toast({ title: `Código ${dialogMode === 'add' ? 'cadastrado' : 'atualizado'} com sucesso!` });
            setIsFormDialogOpen(false);
        } catch (error) {
            console.error("Error saving code:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar os dados." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!currentItem) return;
        
        setIsSubmitting(true);
        const { data, type, category } = currentItem;
        const stateUpdater = type === 'symptom' ? setSymptoms : setRepairs;
        const currentState = type === 'symptom' ? symptoms : repairs;

        const updatedCategoryData = currentState[category as keyof typeof currentState].filter(i => i.code !== data.code);
        const updatedState = { ...currentState, [category as keyof typeof currentState]: updatedCategoryData };

        try {
            await setDoc(doc(db, "codes", type), updatedState);
            stateUpdater(updatedState);
            toast({ title: "Código excluído com sucesso!" });
            setIsDeleteDialogOpen(false);
            setCurrentItem(null);
        } catch(error) {
            console.error("Error deleting code:", error);
            toast({ variant: "destructive", title: "Erro ao Excluir", description: "Não foi possível excluir o código." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleFileImport = (file: File) => {
      setIsSubmitting(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const data = e.target?.result;
              if (!data) throw new Error("Não foi possível ler o arquivo.");

              const workbook = XLSX.read(data, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const json = XLSX.utils.sheet_to_json<{ tipo: string, categoria: string, codigo: any, descricao: string }>(worksheet);

              const newSymptoms = { ...symptoms };
              const newRepairs = { ...repairs };
              let importedCount = 0;
              let skippedCount = 0;

              json.forEach(row => {
                  const { tipo, categoria, codigo, descricao } = row;
                  if (!tipo || !categoria || !codigo || !descricao) return;

                  const code = String(codigo);
                  const item = { code, description: descricao };
                  const targetCategory = categoria.toUpperCase() as keyof CodeCategory;

                  if (['TV/AV', 'DA'].includes(targetCategory)) {
                      if (tipo.toLowerCase() === 'sintoma') {
                          if (!newSymptoms[targetCategory].some(c => c.code === code)) {
                             newSymptoms[targetCategory].push(item);
                             importedCount++;
                          } else {
                            skippedCount++;
                          }
                      } else if (tipo.toLowerCase() === 'reparo') {
                          if (!newRepairs[targetCategory].some(c => c.code === code)) {
                              newRepairs[targetCategory].push(item);
                              importedCount++;
                          } else {
                            skippedCount++;
                          }
                      }
                  }
              });
              
              await setDoc(doc(db, "codes", "symptoms"), newSymptoms);
              await setDoc(doc(db, "codes", "repairs"), newRepairs);

              setSymptoms(newSymptoms);
              setRepairs(newRepairs);

              toast({
                  title: "Importação Concluída",
                  description: `${importedCount} novos códigos importados. ${skippedCount} duplicados foram ignorados.`,
              });

          } catch (error) {
              console.error("Error importing file:", error);
              toast({
                  variant: "destructive",
                  title: "Erro na Importação",
                  description: "Verifique o formato do arquivo e se as colunas 'tipo', 'categoria', 'codigo', 'descricao' estão corretas.",
              });
          } finally {
            setIsSubmitting(false);
          }
      };
      reader.onerror = () => {
        toast({ variant: "destructive", title: "Erro de Leitura", description: "Não foi possível ler o arquivo selecionado." });
        setIsSubmitting(false);
      }
      reader.readAsArrayBuffer(file);
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Códigos</h1>
          <div className="flex items-center gap-2">
              <ImportDialog onImport={handleFileImport} isSubmitting={isSubmitting} />
              <Button onClick={handleOpenAddDialog}>
                <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Código
              </Button>
          </div>
        </div>
        
        <FirestoreConnectionTest />

        <Tabs defaultValue="symptoms">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="symptoms">Códigos de Sintoma</TabsTrigger>
            <TabsTrigger value="repairs">Códigos de Reparo</TabsTrigger>
          </TabsList>
          <TabsContent value="symptoms">
            <Card>
              <CardHeader>
                <CardTitle>Sintomas</CardTitle>
                <CardDescription>Códigos de sintomas para TV/AV e Linha Branca (DA).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div>
                      <h3 className="font-semibold mb-2">TV/AV</h3>
                      <CodesTable 
                        data={symptoms["TV/AV"]} 
                        onEdit={(item) => handleOpenEditDialog(item, 'symptom', 'TV/AV')}
                        onDelete={(item) => handleOpenDeleteDialog(item, 'symptom', 'TV/AV')}
                        isLoading={isLoading}
                      />
                  </div>
                  <div>
                      <h3 className="font-semibold mb-2">Linha Branca (DA)</h3>
                      <CodesTable 
                        data={symptoms["DA"]} 
                        onEdit={(item) => handleOpenEditDialog(item, 'symptom', 'DA')}
                        onDelete={(item) => handleOpenDeleteDialog(item, 'symptom', 'DA')}
                        isLoading={isLoading}
                      />
                  </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="repairs">
            <Card>
              <CardHeader>
                <CardTitle>Reparos</CardTitle>
                <CardDescription>Códigos de reparos para TV/AV e Linha Branca (DA).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div>
                      <h3 className="font-semibold mb-2">TV/AV</h3>
                      <CodesTable 
                        data={repairs["TV/AV"]} 
                        onEdit={(item) => handleOpenEditDialog(item, 'repair', 'TV/AV')}
                        onDelete={(item) => handleOpenDeleteDialog(item, 'repair', 'TV/AV')}
                        isLoading={isLoading}
                      />
                  </div>
                  <div>
                      <h3 className="font-semibold mb-2">Linha Branca (DA)</h3>
                      <CodesTable 
                        data={repairs["DA"]}
                        onEdit={(item) => handleOpenEditDialog(item, 'repair', 'DA')}
                        onDelete={(item) => handleOpenDeleteDialog(item, 'repair', 'DA')}
                        isLoading={isLoading}
                      />
                  </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Form Dialog for Add/Edit */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'add' ? 'Cadastrar Novo Código' : 'Editar Código'}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'add' ? 'Preencha os detalhes do novo código.' : `Editando o código ${currentItem?.data.code}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">Tipo</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => handleFormSelectChange('type', value)}
                disabled={dialogMode === 'edit'}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="symptom">Sintoma</SelectItem>
                  <SelectItem value="repair">Reparo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">Categoria</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => handleFormSelectChange('category', value)}
                disabled={dialogMode === 'edit'}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TV/AV">TV/AV</SelectItem>
                  <SelectItem value="DA">Linha Branca (DA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right">Código</Label>
              <Input id="code" value={formData.code} onChange={handleFormInputChange} className="col-span-3" disabled={dialogMode === 'edit'}/>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">Descrição</Label>
              <Input id="description" value={formData.description} onChange={handleFormInputChange} className="col-span-3" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o código
              <span className="font-bold font-mono mx-1">{currentItem?.data.code}</span>
              do sistema.
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
