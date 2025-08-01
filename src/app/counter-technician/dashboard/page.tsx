
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, DollarSign, FileMinus, Target, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, Timestamp, query, where, getDoc } from "firebase/firestore";
import { type Chargeback, type CounterBudget, type AppUser } from "@/lib/data";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isAfter, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from "@/context/AuthContext";
import { Progress } from "@/components/ui/progress";

function BudgetsTab({ appUser }: { appUser: AppUser | null }) {
    const { toast } = useToast();
    const [budgets, setBudgets] = useState<CounterBudget[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ serviceOrderNumber: '', observations: '', value: 0 });

    const fetchBudgets = async () => {
        if (!appUser) return;
        setIsLoading(true);
        try {
            const q = query(collection(db, "counterBudgets"), where("technicianId", "==", appUser.uid));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: (doc.data().date as Timestamp).toDate(),
            } as CounterBudget)).sort((a, b) => b.date.getTime() - a.date.getTime());
            setBudgets(data);
        } catch (error) {
            console.error("Error fetching budgets:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível buscar os orçamentos." });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if(appUser) {
            fetchBudgets();
        }
    }, [appUser, toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleSave = async () => {
        if (!appUser) {
            toast({ variant: "destructive", title: "Erro", description: "Usuário não encontrado." });
            return;
        }
        if (!formData.serviceOrderNumber || !formData.value) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "OS e Valor são obrigatórios." });
            return;
        }
        setIsSubmitting(true);
        try {
            const dataToSave = {
                ...formData,
                technicianId: appUser.uid,
                technicianName: appUser.name,
                date: new Date()
            };
            await addDoc(collection(db, "counterBudgets"), dataToSave);
            toast({ title: "Orçamento salvo com sucesso!" });
            setFormData({ serviceOrderNumber: '', observations: '', value: 0 });
            await fetchBudgets(); // Refresh list
        } catch (error) {
            console.error("Error saving budget:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o orçamento." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!appUser) {
        return <Card><CardContent className="p-6 text-center text-destructive">Usuário não autenticado.</CardContent></Card>
    }

    return (
         <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Registrar Novo Orçamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="serviceOrderNumber">Nº da OS</Label>
                            <Input id="serviceOrderNumber" value={formData.serviceOrderNumber} onChange={handleInputChange} placeholder="Número da OS" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="value">Valor Aprovado (R$)</Label>
                            <Input id="value" type="number" value={formData.value || ''} onChange={handleInputChange} placeholder="Ex: 350.50" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="observations">Observações</Label>
                            <Textarea id="observations" value={formData.observations} onChange={handleInputChange} placeholder="Detalhes do orçamento" />
                        </div>
                        <Button onClick={handleSave} disabled={isSubmitting} className="w-full">
                            <PlusCircle className="mr-2 h-4 w-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Orçamento'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <DollarSign /> Orçamentos Registrados
                        </CardTitle>
                        <CardDescription>Visualize os orçamentos que você registrou.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <p>Carregando...</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Valor (R$)</TableHead>
                                        <TableHead>Observações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {budgets.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="font-mono">{item.serviceOrderNumber}</TableCell>
                                            <TableCell className="font-mono text-green-600">{item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                            <TableCell>{item.observations}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function ChargebacksTab({ appUser }: { appUser: AppUser | null }) {
    const { toast } = useToast();
    const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ serviceOrderNumber: '', reason: '', value: 0 });

     const fetchChargebacks = async () => {
        if (!appUser) return;
        setIsLoading(true);
        try {
            const q = query(collection(db, "chargebacks"), where("technicianId", "==", appUser.uid));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: (doc.data().date as Timestamp).toDate(),
            } as Chargeback)).sort((a, b) => b.date.getTime() - a.date.getTime());
            setChargebacks(data);
        } catch (error) {
            console.error("Error fetching chargebacks:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível buscar os estornos." });
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        if(appUser){
            fetchChargebacks();
        }
    }, [appUser, toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value, type } = e.target;
        setFormData(prev => ({ ...prev, [id]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleSave = async () => {
        if (!appUser) {
            toast({ variant: "destructive", title: "Erro", description: "Usuário não autenticado." });
            return;
        }
        if (!formData.serviceOrderNumber || !formData.value || !formData.reason) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "Todos os campos são obrigatórios." });
            return;
        }
        setIsSubmitting(true);
        try {
            const dataToSave = {
                ...formData,
                technicianId: appUser.uid,
                technicianName: appUser.name,
                date: new Date()
            };
            await addDoc(collection(db, "chargebacks"), dataToSave);
            toast({ title: "Estorno salvo com sucesso!" });
            setFormData({ serviceOrderNumber: '', reason: '', value: 0 });
            await fetchChargebacks();
        } catch (error) {
            console.error("Error saving chargeback:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar o estorno." });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!appUser) {
        return <Card><CardContent className="p-6 text-center text-destructive">Usuário não autenticado.</CardContent></Card>
    }

    return (
         <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Registrar Novo Estorno</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="serviceOrderNumber">Nº da OS</Label>
                            <Input id="serviceOrderNumber" value={formData.serviceOrderNumber} onChange={handleInputChange} placeholder="Número da OS relacionada" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="value">Valor do Estorno (R$)</Label>
                            <Input id="value" type="number" value={formData.value || ''} onChange={handleInputChange} placeholder="Ex: 50.00" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason">Motivo do Estorno</Label>
                            <Textarea id="reason" value={formData.reason} onChange={handleInputChange} placeholder="Descreva o motivo do estorno" />
                        </div>
                        <Button onClick={handleSave} disabled={isSubmitting} className="w-full">
                            <PlusCircle className="mr-2 h-4 w-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Estorno'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2">
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                           <FileMinus /> Estornos Registrados
                        </CardTitle>
                        <CardDescription>Visualize os estornos que você registrou.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <p>Carregando...</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Valor (R$)</TableHead>
                                        <TableHead>Motivo</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {chargebacks.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="font-mono">{item.serviceOrderNumber}</TableCell>
                                            <TableCell className="font-mono text-red-600">-{item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                            <TableCell>{item.reason}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function GoalTab({ appUser }: { appUser: AppUser | null }) {
    const { toast } = useToast();
    const [goal, setGoal] = useState(0);
    const [performance, setPerformance] = useState({ gross: 0, chargebacks: 0, net: 0 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPerformanceData = async () => {
            if (!appUser) return;
            setIsLoading(true);

            try {
                // Fetch goal from the technician's specific document
                const techDocRef = doc(db, "technicians", appUser.uid);
                const techDoc = await getDoc(techDocRef);
                if (techDoc.exists()) {
                    setGoal(techDoc.data().goal || 0);
                } else {
                    // This can happen if a user is created but not yet a technician
                    // For now, we'll assume a goal of 0
                    setGoal(0);
                }

                // Fetch financial data for the current month
                const now = new Date();
                const firstDay = startOfMonth(now);
                const lastDay = endOfMonth(now);

                const budgetsQuery = query(
                    collection(db, "counterBudgets"),
                    where("technicianId", "==", appUser.uid),
                    where("date", ">=", firstDay),
                    where("date", "<=", lastDay)
                );
                const chargebacksQuery = query(
                    collection(db, "chargebacks"),
                    where("technicianId", "==", appUser.uid),
                    where("date", ">=", firstDay),
                    where("date", "<=", lastDay)
                );

                const [budgetsSnapshot, chargebacksSnapshot] = await Promise.all([
                    getDocs(budgetsQuery),
                    getDocs(chargebacksQuery),
                ]);

                const grossRevenue = budgetsSnapshot.docs.reduce((sum, doc) => sum + doc.data().value, 0);
                const totalChargebacks = chargebacksSnapshot.docs.reduce((sum, doc) => sum + doc.data().value, 0);
                
                setPerformance({
                    gross: grossRevenue,
                    chargebacks: totalChargebacks,
                    net: grossRevenue - totalChargebacks,
                });
            } catch (error) {
                console.error("Error fetching performance data:", error);
                toast({ variant: "destructive", title: "Erro", description: "Não foi possível buscar os dados de desempenho." });
            } finally {
                setIsLoading(false);
            }
        };

        if (appUser) {
            fetchPerformanceData();
        }
    }, [appUser, toast]);

    if (isLoading) {
        return <p>Carregando desempenho...</p>;
    }
    
    if (!appUser) {
        return <Card><CardContent className="p-6 text-center text-destructive">Usuário não autenticado.</CardContent></Card>
    }

    const progress = goal > 0 ? Math.min((performance.net / goal) * 100, 100) : 0;
    const isGoalMet = performance.net >= goal;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Target /> Minha Meta do Mês
                </CardTitle>
                <CardDescription>Acompanhe seu progresso em relação à meta de faturamento definida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <p className="text-2xl font-bold">{performance.net.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                        <p className="text-muted-foreground">
                            Meta: {goal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                    </div>
                    <Progress value={progress} />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-6">
                    <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Faturamento Bruto</p>
                        <p className="text-lg font-semibold">{performance.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Estornos</p>
                        <p className="text-lg font-semibold text-red-600">-{performance.chargebacks.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>
                     <div className="p-4 bg-muted/50 rounded-lg flex flex-col items-center justify-center">
                        {isGoalMet ? (
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle className="h-6 w-6" />
                                <p className="text-lg font-semibold">Meta Atingida!</p>
                            </div>
                        ) : (
                             <div className="flex items-center gap-2 text-destructive">
                                <XCircle className="h-6 w-6" />
                                <p className="text-lg font-semibold">Meta não atingida</p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function CounterTechnicianDashboardPage() {
    const { appUser, loading } = useAuth();
    
    if (loading) {
        return <div className="text-center p-6">Verificando configuração do técnico...</div>
    }

    return (
        <div className="flex flex-col gap-6">
            <Tabs defaultValue="budgets" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="budgets">Orçamentos</TabsTrigger>
                    <TabsTrigger value="chargebacks">Estornos</TabsTrigger>
                    <TabsTrigger value="goal">Minha Meta</TabsTrigger>
                </TabsList>
                <TabsContent value="budgets" className="mt-6">
                    <BudgetsTab appUser={appUser} />
                </TabsContent>
                <TabsContent value="chargebacks" className="mt-6">
                    <ChargebacksTab appUser={appUser} />
                </TabsContent>
                <TabsContent value="goal" className="mt-6">
                    <GoalTab appUser={appUser} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
