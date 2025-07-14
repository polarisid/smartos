
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
import { PlusCircle, Edit, Divide, Trash2 } from "lucide-react";
import { type Technician } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc } from "firebase/firestore";

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);

  // States for dialogs
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAddTechDialogOpen, setIsAddTechDialogOpen] = useState(false);

  // Form states
  const [goalValue, setGoalValue] = useState<string>("");
  const [globalGoal, setGlobalGoal] = useState<string>("");
  const [newTechName, setNewTechName] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const techsSnapshot = await getDocs(collection(db, "technicians"));
            const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
            setTechnicians(techs);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os dados do banco de dados." });
        } finally {
            setIsLoading(false);
        }
    };

    fetchData();
  }, [toast]);

  const handleOpenGoalDialog = (tech: Technician) => {
    setSelectedTech(tech);
    setGoalValue(tech.goal?.toString() || "");
    setIsGoalDialogOpen(true);
  };
  
  const handleOpenDeleteDialog = (tech: Technician) => {
    setSelectedTech(tech);
    setIsDeleteDialogOpen(true);
  };

  const handleOpenAddDialog = () => {
    setNewTechName("");
    setIsAddTechDialogOpen(true);
  };

  const handleSaveGoal = async () => {
    if (!selectedTech) return;
    setIsSubmitting(true);
    const newGoal = parseFloat(goalValue) || 0;
    
    try {
      const techRef = doc(db, "technicians", selectedTech.id);
      await setDoc(techRef, { goal: newGoal }, { merge: true });

      setTechnicians(currentTechs =>
        currentTechs.map(t =>
          t.id === selectedTech.id ? { ...t, goal: newGoal } : t
        )
      );

      toast({
        title: "Meta Atualizada!",
        description: `A nova meta para ${selectedTech.name} é de R$ ${newGoal.toFixed(2)}.`,
      });

      setIsGoalDialogOpen(false);
      setSelectedTech(null);
    } catch (error) {
      console.error("Error saving goal: ", error);
      toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível atualizar a meta." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveNewTech = async () => {
    if (!newTechName.trim()) {
      toast({
        variant: "destructive",
        title: "Nome Inválido",
        description: "O nome do técnico não pode estar em branco.",
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const newTechData = {
        name: newTechName.trim(),
        goal: 0,
      };
      const docRef = await addDoc(collection(db, "technicians"), newTechData);

      setTechnicians(currentTechs => [...currentTechs, { id: docRef.id, ...newTechData }]);

      toast({
        title: "Técnico Cadastrado!",
        description: `O técnico ${newTechData.name} foi adicionado com sucesso.`,
      });

      setIsAddTechDialogOpen(false);
      setNewTechName("");
    } catch (error) {
      console.error("Error adding technician: ", error);
      toast({ variant: "destructive", title: "Erro ao cadastrar", description: "Não foi possível adicionar o novo técnico." });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleDistributeGoal = async () => {
    const totalGoal = parseFloat(globalGoal);
    if (isNaN(totalGoal) || totalGoal <= 0) {
      toast({
        variant: "destructive",
        title: "Valor Inválido",
        description: "Por favor, insira um valor numérico positivo para a meta global.",
      });
      return;
    }

    if (technicians.length === 0) {
        toast({
            variant: "destructive",
            title: "Nenhum Técnico",
            description: "Não há técnicos cadastrados para distribuir a meta.",
        });
        return;
    }
    
    setIsSubmitting(true);
    const goalPerTechnician = totalGoal / technicians.length;
    
    try {
      const updatedTechs = technicians.map(t => ({ ...t, goal: goalPerTechnician }));
      const updatePromises = updatedTechs.map(tech => 
        setDoc(doc(db, "technicians", tech.id), { goal: goalPerTechnician }, { merge: true })
      );
      await Promise.all(updatePromises);
      
      setTechnicians(updatedTechs);

      toast({
        title: "Metas Distribuídas!",
        description: `Cada técnico recebeu uma meta de R$ ${goalPerTechnician.toFixed(2).replace('.', ',')}.`,
      });
      setGlobalGoal("");
    } catch (error) {
      console.error("Error distributing goal: ", error);
      toast({ variant: "destructive", title: "Erro ao distribuir", description: "Não foi possível distribuir as metas." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTech = async () => {
    if (!selectedTech) return;
    setIsSubmitting(true);

    try {
      await deleteDoc(doc(db, "technicians", selectedTech.id));

      setTechnicians(currentTechs => currentTechs.filter(t => t.id !== selectedTech.id));

      toast({
        title: "Técnico Excluído!",
        description: `O técnico ${selectedTech.name} foi removido com sucesso.`,
      });

      setIsDeleteDialogOpen(false);
      setSelectedTech(null);
    } catch (error) {
      console.error("Error deleting technician: ", error);
      toast({ variant: "destructive", title: "Erro ao excluir", description: "Não foi possível remover o técnico." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Técnicos</h1>
          <div className="flex items-center gap-2">
            <Button onClick={handleOpenAddDialog}>
                <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Técnico
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Meta Global do Mês</CardTitle>
            <CardDescription>Defina uma meta de faturamento global para o mês e distribua igualmente entre os técnicos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="global-goal">Meta Global (R$)</Label>
              <Input 
                id="global-goal" 
                type="number" 
                placeholder="Ex: 20000.00"
                value={globalGoal}
                onChange={(e) => setGlobalGoal(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleDistributeGoal} disabled={isSubmitting}>
              <Divide className="mr-2 h-4 w-4" /> {isSubmitting ? 'Distribuindo...' : 'Distribuir Igualmente'}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Técnicos</CardTitle>
            <CardDescription>Visualize, gerencie e defina metas para os técnicos cadastrados.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center p-4">Carregando técnicos...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Meta (R$)</TableHead>
                    <TableHead className="text-right w-[240px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((tech) => (
                    <TableRow key={tech.id}>
                      <TableCell className="font-mono">{tech.id}</TableCell>
                      <TableCell className="font-medium">{tech.name}</TableCell>
                      <TableCell>
                        {tech.goal ? `R$ ${tech.goal.toFixed(2).replace('.', ',')}` : 'Não definida'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleOpenGoalDialog(tech)}>
                          <Edit className="mr-2 h-4 w-4" /> Definir Meta
                        </Button>
                        <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(tech)}>
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

      {/* Add New Tech Dialog */}
      <Dialog open={isAddTechDialogOpen} onOpenChange={setIsAddTechDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                  <DialogTitle>Cadastrar Novo Técnico</DialogTitle>
                  <DialogDescription>
                      Insira o nome do novo técnico. O ID será gerado automaticamente.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="new-tech-name">Nome</Label>
                      <Input 
                          id="new-tech-name"
                          value={newTechName}
                          onChange={(e) => setNewTechName(e.target.value)}
                          placeholder="Ex: Ana Souza"
                      />
                  </div>
              </div>
              <DialogFooter>
                  <Button type="button" onClick={() => setIsAddTechDialogOpen(false)} variant="outline">Cancelar</Button>
                  <Button type="button" onClick={handleSaveNewTech} disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar'}</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Set Goal Dialog */}
      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                  <DialogTitle>Definir Meta para {selectedTech?.name}</DialogTitle>
                  <DialogDescription>
                      Insira o valor da nova meta de faturamento mensal para o técnico.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="grid w-full items-center gap-1.5">
                      <Label htmlFor="goal">Meta (R$)</Label>
                      <Input 
                          id="goal" 
                          type="number" 
                          placeholder="Ex: 5000.00"
                          value={goalValue}
                          onChange={(e) => setGoalValue(e.target.value)}
                      />
                  </div>
              </div>
              <DialogFooter>
                  <Button type="button" onClick={() => setIsGoalDialogOpen(false)} variant="outline">Cancelar</Button>
                  <Button type="button" onClick={handleSaveGoal} disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar Meta'}</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente o técnico
              <span className="font-bold mx-1">{selectedTech?.name}</span>
              do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteTech} 
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
