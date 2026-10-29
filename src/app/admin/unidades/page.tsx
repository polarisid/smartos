"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Building2, Edit, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { unidadeService, UNIDADES_CHANGED_EVENT } from "@/services/supabase/unidadeService";
import { type Unidade } from "@/lib/data";

export default function UnidadesPage() {
    const { appUser } = useAuth();
    const { toast } = useToast();
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Unidade | null>(null);
    const [nome, setNome] = useState("");
    const [saving, setSaving] = useState(false);

    const load = () => unidadeService.getAll().then(setUnidades).catch(e => toast({ variant: "destructive", title: "Não foi possível carregar as unidades", description: e?.message })).finally(() => setLoading(false));
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (appUser && appUser.role !== "master") {
        return <p className="text-sm text-muted-foreground">Somente o usuário master cadastra unidades.</p>;
    }

    const openNew = () => { setEditing(null); setNome(""); setDialogOpen(true); };
    const openEdit = (u: Unidade) => { setEditing(u); setNome(u.nome); setDialogOpen(true); };

    const save = async () => {
        const clean = nome.trim();
        if (!clean) return;
        if (unidades.some(u => u.id !== editing?.id && u.nome.trim().toLowerCase() === clean.toLowerCase())) {
            toast({ variant: "destructive", title: "Já existe uma unidade com esse nome" });
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await unidadeService.update(editing.id, clean);
                toast({ title: "Unidade renomeada" });
            } else {
                await unidadeService.create(clean);
                toast({ title: "Unidade criada", description: `${clean} já aparece no seletor de unidades e no cadastro de usuários.` });
            }
            setDialogOpen(false);
            await load();
            window.dispatchEvent(new Event(UNIDADES_CHANGED_EVENT));
        } catch (e: any) {
            toast({ variant: "destructive", title: "Não foi possível salvar", description: e?.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="font-headline text-2xl font-semibold flex items-center gap-2"><Building2 className="h-6 w-6" /> Unidades</h1>
                    <p className="text-sm text-muted-foreground">Cada unidade tem seus próprios técnicos, rotas, OS e configurações, isolados das demais.</p>
                </div>
                <Button onClick={openNew}><PlusCircle className="h-4 w-4 mr-2" /> Nova unidade</Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unidade</TableHead>
                                <TableHead>Criada em</TableHead>
                                <TableHead className="w-24 text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>
                            ) : unidades.length === 0 ? (
                                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma unidade cadastrada.</TableCell></TableRow>
                            ) : unidades.map(u => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.nome}</TableCell>
                                    <TableCell className="text-muted-foreground tabular-nums">{format(u.createdAt, "dd/MM/yyyy")}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)} title="Renomear"><Edit className="h-4 w-4" /></Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Depois de criar uma unidade</CardTitle>
                    <CardDescription>A unidade nasce vazia. Para ela começar a operar:</CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-1.5 text-muted-foreground">
                    <p><strong className="text-foreground">1.</strong> Escolha a unidade no seletor do topo do menu (você, master, vê todas).</p>
                    <p><strong className="text-foreground">2.</strong> Em <strong>Configurações</strong>, informe o endereço-base: as rotas e o custo de deslocamento partem dele.</p>
                    <p><strong className="text-foreground">3.</strong> Em <strong>Técnicos</strong> (e <strong>Motoristas</strong> e <strong>Veículos</strong>), cadastre a equipe da unidade.</p>
                    <p><strong className="text-foreground">4.</strong> Em <strong>Usuários</strong>, crie o login do admin e de cada técnico escolhendo esta unidade.</p>
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Renomear unidade" : "Nova unidade"}</DialogTitle>
                        <DialogDescription>{editing ? "Só o nome muda; os dados da unidade continuam vinculados a ela." : "Use o nome da cidade-sede, como as demais (Aracaju, Teresina…)."}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="unidade-nome">Nome</Label>
                        <Input id="unidade-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Recife" autoFocus onKeyDown={e => { if (e.key === "Enter") save(); }} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={save} disabled={saving || !nome.trim()}>{saving ? "Salvando…" : "Salvar"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
