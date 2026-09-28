
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Trash2, Users, PlusCircle, KeyRound, Copy, Check, Shuffle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type AppUser, type Unidade } from "@/lib/data";
import { userService } from "@/services/supabase/userService";
import { unidadeService } from "@/services/supabase/unidadeService";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


export default function UsersPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
    const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [isResettingPassword, setIsResettingPassword] = useState(false);
    const [passwordCopied, setPasswordCopied] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');

    const [newRole, setNewRole] = useState<AppUser['role']>('technician');
    const [newUnidadeId, setNewUnidadeId] = useState<string>('');

    const [formError, setFormError] = useState('');
    const [formState, setFormState] = useState({
        name: '',
        email: '',
        password: '',
        role: 'technician' as AppUser['role'],
        unidadeId: '',
    });

    useEffect(() => {
        unidadeService.getAll().then(setUnidades).catch(() => {});
    }, []);

    const { toast } = useToast();

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const usersData = await userService.getAll();
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
        setNewUnidadeId(user.unidadeId ?? '');
        setIsRoleDialogOpen(true);
    };

    const handleOpenDeleteDialog = (user: AppUser) => {
        setSelectedUser(user);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenPasswordDialog = (user: AppUser) => {
        setSelectedUser(user);
        setGeneratedPassword(null);
        setPasswordCopied(false);
        setPasswordInput('');
        setIsPasswordDialogOpen(true);
    };

    const handleGenerateSuggestion = () => {
        setPasswordInput(crypto.randomUUID().replace(/-/g, '').slice(0, 14));
    };

    const handleResetPassword = async () => {
        if (!selectedUser) return;
        if (passwordInput && passwordInput.length < 6) {
            toast({ variant: "destructive", title: "Senha muito curta", description: "Use pelo menos 6 caracteres." });
            return;
        }
        setIsResettingPassword(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || ''}`,
                },
                body: JSON.stringify({ userId: selectedUser.uid, ...(passwordInput ? { newPassword: passwordInput } : {}) }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha ao trocar senha.');
            setGeneratedPassword(data.newPassword);
        } catch (error: any) {
            toast({ variant: "destructive", title: "Erro ao trocar senha", description: error.message });
        } finally {
            setIsResettingPassword(false);
        }
    };

    const handleCopyPassword = () => {
        if (!generatedPassword) return;
        navigator.clipboard.writeText(generatedPassword).then(() => {
            setPasswordCopied(true);
            setTimeout(() => setPasswordCopied(false), 2000);
        });
    };

    const handleOpenAddUserDialog = () => {
        setFormState({ name: '', email: '', password: '', role: 'technician', unidadeId: '' });
        setFormError('');
        setIsAddUserDialogOpen(true);
    }
    
    const handleSaveRole = async () => {
        if (!selectedUser) return;
        if (newRole !== 'master' && !newUnidadeId) {
            toast({ variant: "destructive", title: "Selecione a unidade", description: "Todo usuário que não é master precisa estar vinculado a uma unidade." });
            return;
        }
        setIsSubmitting(true);
        try {
            const unidadeId = newRole === 'master' ? null : newUnidadeId;
            await userService.update(selectedUser.uid, { role: newRole, unidadeId });

            setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { ...u, role: newRole, unidadeId } : u));
            toast({ title: "Usuário atualizado com sucesso!" });
            setIsRoleDialogOpen(false);
        } catch (error) {
            console.error("Error updating user:", error);
            toast({ variant: "destructive", title: "Erro ao atualizar", description: "Não foi possível atualizar o usuário." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        setIsSubmitting(true);
        try {
            // This just deletes the Firestore document, not the Auth user.
            // For a full user deletion, you would need a Cloud Function.
            await userService.remove(selectedUser.uid);
            
            setUsers(prev => prev.filter(u => u.uid !== selectedUser.uid));
            toast({ title: "Usuário removido com sucesso.", description: "O acesso do usuário foi removido, mas a conta de login ainda existe." });
            setIsDeleteDialogOpen(false);
        } catch (error) {
            console.error("Error deleting user:", error);
            toast({ variant: "destructive", title: "Erro ao remover", description: "Não foi possível remover o usuário." });
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleCreateUser = async () => {
        if (!formState.name || !formState.email || !formState.password) {
            setFormError('Todos os campos são obrigatórios.');
            return;
        }
        if (formState.role !== 'master' && !formState.unidadeId) {
            setFormError('Selecione a unidade desse usuário.');
            return;
        }
        setFormError('');
        setIsSubmitting(true);
        try {
            // Via API com service role (não o signup público do client) - senão a
            // RLS multi-unidade bloqueia o insert em profiles, e a conta ficaria
            // sem unidade_id (sem acesso a nada até corrigir manualmente).
            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formState.email,
                    password: formState.password,
                    name: formState.name,
                    role: formState.role,
                    unidadeId: formState.role === 'master' ? null : formState.unidadeId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha ao criar conta.');

            toast({ title: "Usuário criado com sucesso!" });
            setIsAddUserDialogOpen(false);
            await fetchUsers();
        } catch (err: any) {
            setFormError(err.message || 'Falha ao criar conta. Por favor, tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    }

    const roleLabels: Record<AppUser['role'], string> = {
        admin: 'Admin',
        technician: 'Técnico',
        counter_technician: 'Técnico de Balcão',
        master: 'Master'
    };

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
                     <Button onClick={handleOpenAddUserDialog}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Criar Usuário
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <Users /> Usuários do Sistema
                        </CardTitle>
                        <CardDescription>
                            Gerencie as funções e o acesso dos usuários.
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
                                        <TableHead>Unidade</TableHead>
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
                                            <TableCell className="text-sm text-muted-foreground">
                                                {user.role === 'master' ? 'Todas' : (unidades.find(u => u.id === user.unidadeId)?.nome || '—')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="outline" size="sm" onClick={() => handleOpenRoleDialog(user)}>
                                                    <Edit className="mr-2 h-4 w-4" /> Alterar Função
                                                </Button>
                                                <Button variant="outline" size="sm" className="ml-2" onClick={() => handleOpenPasswordDialog(user)}>
                                                    <KeyRound className="mr-2 h-4 w-4" /> Trocar Senha
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
            
            {/* Add User Dialog */}
            <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Criar Novo Usuário</DialogTitle>
                        <DialogDescription>
                           Preencha os dados abaixo para criar uma nova conta de acesso.
                        </DialogDescription>
                    </DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome Completo</Label>
                            <Input id="name" value={formState.name} onChange={(e) => setFormState(s => ({...s, name: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={formState.email} onChange={(e) => setFormState(s => ({...s, email: e.target.value}))} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="password">Senha</Label>
                            <Input id="password" type="password" value={formState.password} onChange={(e) => setFormState(s => ({...s, password: e.target.value}))} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role-add">Função</Label>
                            <Select value={formState.role} onValueChange={(v) => setFormState(s => ({...s, role: v as AppUser['role']}))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="technician">Técnico</SelectItem>
                                    <SelectItem value="counter_technician">Técnico de Balcão</SelectItem>
                                    <SelectItem value="master">Master (vê todas as unidades)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {formState.role !== 'master' && (
                            <div className="space-y-2">
                                <Label htmlFor="unidade-add">Unidade</Label>
                                <Select value={formState.unidadeId} onValueChange={(v) => setFormState(s => ({...s, unidadeId: v}))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione a unidade" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unidades.map(u => (
                                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {formError && (
                            <Alert variant="destructive">
                                <AlertDescription>{formError}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCreateUser} disabled={isSubmitting}>
                            {isSubmitting ? 'Criando...' : 'Criar Usuário'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Altere a função e/ou a unidade deste usuário.
                        </DialogDescription>
                    </DialogHeader>
                     <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="role-edit">Função</Label>
                            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppUser['role'])}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma função" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">Admin</SelectItem>
                                    <SelectItem value="technician">Técnico</SelectItem>
                                    <SelectItem value="counter_technician">Técnico de Balcão</SelectItem>
                                    <SelectItem value="master">Master (vê todas as unidades)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {newRole !== 'master' && (
                            <div className="space-y-2">
                                <Label htmlFor="unidade-edit">Unidade</Label>
                                <Select value={newUnidadeId} onValueChange={setNewUnidadeId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione a unidade" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {unidades.map(u => (
                                            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSaveRole} disabled={isSubmitting}>
                            {isSubmitting ? 'Salvando...' : 'Salvar Alteração'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Trocar senha de {selectedUser?.name}</DialogTitle>
                        <DialogDescription>
                            Defina uma senha nova para esse usuário (ou gere uma aleatória). A senha anterior deixa de funcionar imediatamente.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        {generatedPassword ? (
                            <div className="space-y-2">
                                <Label>Nova senha (copie e repasse para o usuário - não será mostrada de novo)</Label>
                                <div className="flex items-center gap-2">
                                    <Input readOnly value={generatedPassword} className="font-mono" />
                                    <Button type="button" variant="outline" size="icon" onClick={handleCopyPassword}>
                                        {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="new-password-input">Nova senha para {selectedUser?.email}</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        id="new-password-input"
                                        value={passwordInput}
                                        onChange={(e) => setPasswordInput(e.target.value)}
                                        placeholder="Digite a nova senha (mín. 6 caracteres)"
                                        className="font-mono"
                                    />
                                    <Button type="button" variant="outline" size="icon" onClick={handleGenerateSuggestion} title="Gerar senha aleatória">
                                        <Shuffle className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">Deixe em branco para gerar uma senha aleatória automaticamente.</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)}>
                            {generatedPassword ? 'Fechar' : 'Cancelar'}
                        </Button>
                        {!generatedPassword && (
                            <Button onClick={handleResetPassword} disabled={isResettingPassword}>
                                {isResettingPassword ? 'Salvando...' : 'Salvar Senha'}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação removerá o registro do usuário <span className="font-bold mx-1">{selectedUser?.name}</span> e suas permissões do sistema. A conta de autenticação (login e senha) não será removida.
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
