
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { type AppUser } from "@/lib/data";
import { Badge } from "@/components/ui/badge";

export default function UsersPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [newRole, setNewRole] = useState<AppUser['role']>('technician');
    const { toast } = useToast();

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const usersSnapshot = await getDocs(collection(db, "users"));
            const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
            setUsers(usersData);
        } catch (error) {
            console.error("Error fetching users:", error);
            toast({ variant: "destructive", title: "Erro ao carregar usuários", description: "Não foi possível buscar os dados do banco de dados." });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchUsers();
    }, [toast]);

    const handleOpenRoleDialog = (user: AppUser) => {
        setSelectedUser(user);
        setNewRole(user.role);
        setIsRoleDialogOpen(true);
    };

    const handleOpenDeleteDialog = (user: AppUser) => {
        setSelectedUser(user);
        setIsDeleteDialogOpen(true);
    };
    
    const handleSaveRole = async () => {
        if (!selectedUser) return;
        setIsSubmitting(true);
        try {
            const userRef = doc(db, "users", selectedUser.uid);
            await updateDoc(userRef, { role: newRole });
            
            setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { ...u, role: newRole } : u));
            toast({ title: "Função atualizada com sucesso!" });
            setIsRoleDialogOpen(false);
        } catch (error) {
            console.error("Error updating role:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: "Não foi possível atualizar a função do usuário." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        setIsSubmitting(true);
        try {
            await deleteDoc(doc(db, "users", selectedUser.uid));
            
            // Note: This only deletes the Firestore record, not the Firebase Auth user.
            // Deleting the auth user should be done via a backend function for security.
            
            setUsers(prev => prev.filter(u => u.uid !== selectedUser.uid));
            toast({ title: "Usuário removido com sucesso." });
            setIsDeleteDialogOpen(false);
        } catch (error) {
            console.error("Error deleting user:", error);
            toast({ variant: "destructive", title: "Erro ao remover", description: "Não foi possível remover o usuário." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const roleLabels: Record<AppUser['role'], string> = {
        admin: 'Admin',
        technician: 'Técnico',
        counter_technician: 'Técnico de Balcão'
    };

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Users /> Usuários do Sistema
                        </CardTitle>
                        <CardDescription>
                            Gerencie as funções e o acesso dos usuários. Novos usuários podem se cadastrar através da página de registro.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="text-center p-4">Carregando usuários...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Função</TableHead>
                                        <TableHead className="text-right w-[220px]">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.uid}>
                                            <TableCell className="font-medium">{user.name}</TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                                                    {roleLabels[user.role]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenRoleDialog(user)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Alterar Função
                                                </Button>
                                                <Button variant="destructive" size="sm" className="ml-2" onClick={() => handleOpenDeleteDialog(user)}>
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
            
            <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Alterar Função de {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Selecione a nova função para este usuário.
                        </DialogDescription>
                    </DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="role">Função</Label>
                            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppUser['role'])}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma função" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="technician">Técnico</SelectItem>
                                    <SelectItem value="counter_technician">Técnico de Balcão</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveRole} disabled={isSubmitting}>
                            {isSubmitting ? 'Salvando...' : 'Salvar Alteração'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação removerá o registro do usuário <span className="font-bold mx-1">{selectedUser?.name}</span> do sistema.
                            A conta de login (Firebase Auth) não será removida.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteUser}
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
