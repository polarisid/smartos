
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
import { PlusCircle, Edit, Trash2, Truck } from "lucide-react";
import { type Driver } from "@/lib/data";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";

type FormData = Omit<Driver, 'id'>;

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);

  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');

  const [formData, setFormData] = useState<FormData>({ name: '', phone: '' });

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const driversSnapshot = await getDocs(collection(db, "drivers"));
      const data = driversSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Driver));
      setDrivers(data);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      toast({ variant: "destructive", title: "Erro ao carregar dados", description: "Não foi possível buscar os motoristas." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [toast]);

  const handleOpenFormDialog = (mode: 'add' | 'edit', driver: Driver | null = null) => {
    setFormMode(mode);
    setSelectedDriver(driver);
    setFormData(driver ? { name: driver.name, phone: driver.phone } : { name: '', phone: '' });
    setIsFormDialogOpen(true);
  };
  
  const handleOpenDeleteDialog = (driver: Driver) => {
    setSelectedDriver(driver);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.phone?.trim()) {
      toast({ variant: "destructive", title: "Campos Obrigatórios", description: "Nome e telefone são obrigatórios." });
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (formMode === 'add') {
        await addDoc(collection(db, "drivers"), formData);
        toast({ title: "Motorista Cadastrado!" });
      } else if (selectedDriver) {
        await updateDoc(doc(db, "drivers", selectedDriver.id), formData);
        toast({ title: "Motorista Atualizado!" });
      }
      
      await fetchData();
      setIsFormDialogOpen(false);
    } catch (error) {
      console.error("Error saving driver:", error);
      toast({ variant: "destructive", title: "Erro ao Salvar" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDriver) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "drivers", selectedDriver.id));
      setDrivers(prev => prev.filter(d => d.id !== selectedDriver.id));
      toast({ title: "Motorista Excluído!" });
      setIsDeleteDialogOpen(false);
      setSelectedDriver(null);
    } catch (error) {
      console.error("Error deleting driver:", error);
      toast({ variant: "destructive", title: "Erro ao excluir" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Gerenciar Motoristas</h1>
          <Button onClick={() => handleOpenFormDialog('add')}>
            <PlusCircle className="mr-2 h-4 w-4" /> Cadastrar Motorista
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Motoristas</CardTitle>
            <CardDescription>Visualize, adicione e gerencie os motoristas.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center p-4">Carregando motoristas...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead className="text-right w-[220px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drivers.map((driver) => (
                    <TableRow key={driver.id}>
                      <TableCell className="font-medium">{driver.name}</TableCell>
                      <TableCell>{driver.phone}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => handleOpenFormDialog('edit', driver)}>
                          <Edit className="mr-2 h-4 w-4" /> Editar
                        </Button>
                        <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(driver)}>
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

      {/* Add/Edit Dialog */}
      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? 'Cadastrar Novo Motorista' : 'Editar Motorista'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="driver-name">Nome</Label>
              <Input
                id="driver-name"
                placeholder="Nome do motorista"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="driver-phone">Telefone</Label>
              <Input
                id="driver-phone"
                placeholder="(99) 99999-9999"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsFormDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={isSubmitting}>
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
              Esta ação excluirá permanentemente o motorista <span className="font-bold mx-1">{selectedDriver?.name}</span>.
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
