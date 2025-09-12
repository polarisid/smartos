
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
import { PlusCircle, Edit, Divide, Trash2, User, UserCog } from "lucide-react";
import { type Technician, type AppUser } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, writeBatch, query, where, updateDoc } from "firebase/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EnrichedTechnician = Technician & { role?: AppUser['role'] };
type FormDataType = Partial<Omit<Technician, 'id' | 'goal'>> & { userId?: string };


export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<EnrichedTechnician[]>([]);
  const [selectedTech, setSelectedTech] = useState<EnrichedTechnician | null>(null);

  // States for dialogs
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');

  // Form states
  const [goalValue, setGoalValue] = useState<string>("");
  const [globalGoal, setGlobalGoal] = useState<string>("");
  const [formData, setFormData] = useState<FormDataType>({ name: '', phone: '', userId: '' });

  const [availableUsers, setAvailableUsers] = useState<AppUser[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
      setIsLoading(true);
      try {
          const [techsSnapshot, usersSnapshot] = await Promise.all([
            getDocs(collection(db, "technicians")),
            getDocs(collection(db, "users"))
          ]);
          
          const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
          const usersMap = new Map(users.map(u => [u.uid, u]));

          const techs = techsSnapshot.docs.map(doc => {
            const techData = { id: doc.id, ...doc.data() } as Technician;
            const user = usersMap.get(techData.id);
            return {
              ...techData,
              role: user?.role
            } as EnrichedTechnician;
          });
          setTechnicians(techs);

          // Filter out users who are already technicians
          const existingTechIds = new Set(techs.map(t => t.id));
          const usersNotTechnicians = users.filter(u => 
            !existingTechIds.has(u.uid) && (u.role === 'technician' || u.role === 'counter_technician' || u.role === 'admin')
          );
          setAvailableUsers(usersNotTechnicians);

      } catch (error) {
          console.error("Error fetching data:", error);
          toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os dados do banco de dados." });
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    fetchData();
  }, [toast]);

  const handleOpenGoalDialog = (tech: EnrichedTechnician) => {
    setSelectedTech(tech);
    setGoalValue(tech.goal?.toString() || "");
    setIsGoalDialogOpen(true);
  };
  
  const handleOpenDeleteDialog = (tech: EnrichedTechnician) => {
    setSelectedTech(tech);
    setIsDeleteDialogOpen(true);
  };

  const handleOpenFormDialog = (mode: 'add' | 'edit', tech: EnrichedTechnician | null = null) => {
    setFormMode(mode);
    setSelectedTech(tech);
    if (mode === 'add') {
      setFormData({ name: '', phone: '', userId: '' });
    } else if (tech) {
      setFormData({ name: tech.name, phone: tech.phone || '', userId: tech.id });
    }
    setIsFormDialogOpen(true);
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

  const handleSaveTech = async () => {
    if (!formData.name?.trim()) {
      toast({
        variant: "destructive",
        title: "Nome Obrigatório",
        description: "Por favor, insira o nome do técnico.",
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (formMode === 'add') {
        const newTechData: Partial<Technician> = {
          name: formData.name.trim(),
          phone: formData.phone || '',
          goal: 0,
        };

        if (formData.userId && formData.userId !== 'none') {
          await setDoc(doc(db, "technicians", formData.userId), newTechData);
        } else {
          await addDoc(collection(db, "technicians"), newTechData);
        }
        toast({ title: "Técnico Cadastrado!", description: `O técnico ${newTechData.name} foi adicionado com sucesso.` });

      } else if (formMode === 'edit' && selectedTech) {
        const updatedData: Partial<Technician> = {
            name: formData.name.trim(),
            phone: formData.phone || '',
        };
        const techRef = doc(db, "technicians", selectedTech.id);
        await updateDoc(techRef, updatedData);
        toast({ title: "Técnico Atualizado!", description: "Os dados do técnico foram atualizados."});
      }
      
      await fetchData(); // Refetch data to update the UI
      setIsFormDialogOpen(false);
    } catch (error) {
      console.error("Error saving technician: ", error);
      toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar os dados do técnico." });
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
      const batch = writeBatch(db);
      technicians.forEach(tech => {
        const techRef = doc(db, "technicians", tech.id);
        batch.update(techRef, { goal: goalPerTechnician });
      });
      await batch.commit();
      
      const updatedTechs = technicians.map(t => ({ ...t, goal: goalPerTechnician }));
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
      await fetchData(); // Refetch to update available users

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

  const getRoleInfo = (role?: AppUser['role']) => {
    switch (role) {
      case 'admin':
        return { icon: UserCog, text: 'Admin', color: 'text-purple-600' };
      case 'technician':
        return { icon: User, text: 'Técnico de Campo', color: 'text-sky-600' };
      case 'counter_technician':
        return { icon: UserCog, text: 'Técnico de Balcão', color: 'text-emerald-600' };
      default:
        return { icon: User, text: 'Avulso (Sem Login)', color: 'text-muted-foreground' };
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Técnicos</h1>
          <div className="flex items-center gap-2">
            <Button onClick={() => handleOpenFormDialog('add')}>
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Meta (R$)</TableHead>
                    <TableHead className="text-right w-[320px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((tech) => {
                    const RoleIcon = getRoleInfo(tech.role).icon;
                    const roleText = getRoleInfo(tech.role).text;
                    const roleColor = getRoleInfo(tech.role).color;

                    return (
                        <TableRow key={tech.id}>
                          <TableCell className="font-medium">
                            <div>{tech.name}</div>
                            <div className={`flex items-center gap-1.5 text-xs ${roleColor}`}>
                                <RoleIcon className="h-3 w-3" />
                                <span>{roleText}</span>
                            </div>
                          </TableCell>
                          <TableCell>{tech.phone || 'N/A'}</TableCell>
                          <TableCell>
                            {tech.goal ? `R$ ${tech.goal.toFixed(2).replace('.', ',')}` : 'Não definida'}
                          </TableCell>
                          <TableCell className="text-right">
                             <Button variant="outline" size="sm" onClick={() => handleOpenFormDialog('edit', tech)}>
                              <Edit className="mr-2 h-4 w-4" /> Editar
                            </Button>
                            <Button variant="outline" size="sm" className="ml-2" onClick={() => handleOpenGoalDialog(tech)}>
                              <Edit className="mr-2 h-4 w-4" /> Definir Meta
                            </Button>
                            <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(tech)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </Button>
                          </TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Tech Dialog */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                  <DialogTitle>{formMode === 'add' ? 'Cadastrar Novo Técnico' : `Editar Técnico: ${selectedTech?.name}`}</DialogTitle>
                  <DialogDescription>
                      Preencha os dados do técnico.
                  </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                      <Label htmlFor="tech-name">Nome do Técnico</Label>
                      <Input 
                        id="tech-name"
                        placeholder="Ex: João da Silva"
                        value={formData.name || ''}
                        onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                        disabled={formMode === 'edit' && !!formData.userId}
                      />
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="tech-phone">Telefone</Label>
                      <Input 
                        id="tech-phone"
                        placeholder="(99) 99999-9999"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData(prev => ({...prev, phone: e.target.value}))}
                      />
                  </div>
                  {formMode === 'add' && (
                    <div className="space-y-2">
                        <Label htmlFor="user-select">Vincular a um Usuário (Opcional)</Label>
                        <Select 
                            onValueChange={(value) => {
                                const selectedUser = availableUsers.find(u => u.uid === value);
                                setFormData(prev => ({
                                    ...prev,
                                    userId: value,
                                    name: selectedUser ? selectedUser.name : (value === 'none' ? prev.name : '')
                                }));
                            }} 
                            value={formData.userId}
                            >
                            <SelectTrigger>
                            <SelectValue placeholder="Selecione um usuário para vincular" />
                            </SelectTrigger>
                            <SelectContent>
                            <SelectItem value="none">Nenhum (Técnico Avulso)</SelectItem>
                            {availableUsers.map(user => (
                                <SelectItem key={user.uid} value={user.uid}>{user.name} ({user.email})</SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-2">
                            Vincular a um usuário permite que ele acesse o painel (Ex: Técnico de Balcão).
                        </p>
                    </div>
                  )}
              </div>
              <DialogFooter>
                  <Button type="button" onClick={() => setIsFormDialogOpen(false)} variant="outline">Cancelar</Button>
                  <Button type="button" onClick={handleSaveTech} disabled={isSubmitting || !formData.name}>{isSubmitting ? 'Salvando...' : 'Salvar'}</Button>
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
              do sistema. O registro de usuário, se houver, permanecerá.
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
