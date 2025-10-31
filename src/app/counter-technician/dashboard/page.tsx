

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, DollarSign, FileMinus, Target, CheckCircle, XCircle, TrendingUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, addDoc, deleteDoc, Timestamp, query, where, getDoc, orderBy, limit, startAfter, DocumentSnapshot, endBefore } from "firebase/firestore";
import { type Chargeback, type CounterBudget, type AppUser, type RefusedBudget } from "@/lib/data";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, isWithinInterval, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from 'date-fns';
import { useAuth } from "@/context/AuthContext";
import { Progress } from "@/components/ui/progress";

function BudgetsTab({ appUser }: { appUser: AppUser | null }) {
    const { toast } = useToast();
    const [budgets, setBudgets] = useState<CounterBudget[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ serviceOrderNumber: '', observations: '', value: 0 });

    const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const fetchBudgets = async (loadMore = false) => {
        if (!appUser) return;

        if (loadMore) {
            setIsLoadingMore(true);
        } else {
            setIsLoading(true);
            setBudgets([]);
        }

        try {
            let q;
            if (loadMore && lastVisible) {
                q = query(collection(db, "counterBudgets"), where("technicianId", "==", appUser.uid), orderBy("date", "desc"), startAfter(lastVisible), limit(10));
            } else {
                q = query(collection(db, "counterBudgets"), where("technicianId", "==", appUser.uid), orderBy("date", "desc"), limit(10));
            }
            
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: (doc.data().date as Timestamp).toDate(),
            } as CounterBudget));

            if (loadMore) {
                setBudgets(prev => [...prev, ...data]);
            } else {
                setBudgets(data);
            }

            if (snapshot.docs.length < 10) {
                setHasMore(false);
            } else {
                setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
                setHasMore(true);
            }

        } catch (error) {
            console.error("Error fetching budgets:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível buscar os orçamentos." });
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    };
    
    useEffect(() => {
        if(appUser) {
            fetchBudgets();
        }
    }, [appUser, toast]);

    const handleLoadMore = () => {
        if (hasMore) {
            fetchBudgets(true);
        }
    };

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
                        {isLoading ? <p className="text-center py-10">Carregando...</p> : (
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
                    {hasMore && !isLoading && (
                        <CardFooter className="pt-6 justify-center">
                            <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline">
                                {isLoadingMore ? 'Carregando...' : 'Carregar mais orçamentos'}
                            </Button>
                        </CardFooter>
                    )}
                </Card>
            </div>
        </div>
    );
}

function RefusedBudgetsTab({ appUser }: { appUser: AppUser | null }) {
    const { toast } = useToast();
    const [refusedBudgets, setRefusedBudgets] = useState<RefusedBudget[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ serviceOrderNumber: '', reason: '' });

    const fetchRefusedBudgets = async () => {
        if (!appUser) return;
        setIsLoading(true);
        try {
            const q = query(collection(db, "refusedBudgets"), where("technicianId", "==", appUser.uid), orderBy("date", "desc"), limit(20));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: (doc.data().date as Timestamp).toDate(),
            } as RefusedBudget));
            setRefusedBudgets(data);
        } catch (error) {
            console.error("Error fetching refused budgets:", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível buscar as recusas." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (appUser) {
            fetchRefusedBudgets();
        }
    }, [appUser, toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async () => {
        if (!appUser) {
            toast({ variant: "destructive", title: "Erro", description: "Usuário não encontrado." });
            return;
        }
        if (!formData.serviceOrderNumber || !formData.reason) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "OS e Motivo são obrigatórios." });
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
            await addDoc(collection(db, "refusedBudgets"), dataToSave);
            toast({ title: "Recusa de orçamento salva com sucesso!" });
            setFormData({ serviceOrderNumber: '', reason: '' });
            await fetchRefusedBudgets(); // Refresh list
        } catch (error) {
            console.error("Error saving refused budget:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar a recusa." });
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
                        <CardTitle>Registrar Recusa de Orçamento</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="serviceOrderNumber">Nº da OS</Label>
                            <Input id="serviceOrderNumber" value={formData.serviceOrderNumber} onChange={handleInputChange} placeholder="Número da OS" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason">Motivo da Recusa</Label>
                            <Textarea id="reason" value={formData.reason} onChange={handleInputChange} placeholder="Ex: Cliente achou caro" />
                        </div>
                        <Button onClick={handleSave} disabled={isSubmitting} className="w-full">
                            <PlusCircle className="mr-2 h-4 w-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Recusa'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ThumbsDown /> Recusas Registradas
                        </CardTitle>
                        <CardDescription>Visualize as recusas de orçamento que você registrou.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <p className="text-center py-10">Carregando...</p> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Data</TableHead>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Motivo</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {refusedBudgets.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                            <TableCell className="font-mono">{item.serviceOrderNumber}</TableCell>
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
                    setGoal(0);
                }

                const now = new Date();
                const currentMonthInterval = {
                    start: startOfMonth(now),
                    end: endOfMonth(now),
                };

                // Fetch all for user, then filter by date in JS
                const budgetsQuery = query(collection(db, "counterBudgets"), where("technicianId", "==", appUser.uid));
                const chargebacksQuery = query(collection(db, "chargebacks"), where("technicianId", "==", appUser.uid));

                const [budgetsSnapshot, chargebacksSnapshot] = await Promise.all([
                    getDocs(budgetsQuery),
                    getDocs(chargebacksQuery),
                ]);

                const budgetsThisMonth = budgetsSnapshot.docs
                    .map(doc => ({ ...doc.data(), date: (doc.data().date as Timestamp).toDate() }))
                    .filter(b => isWithinInterval(b.date, currentMonthInterval));

                const chargebacksThisMonth = chargebacksSnapshot.docs
                    .map(doc => ({ ...doc.data(), date: (doc.data().date as Timestamp).toDate() }))
                    .filter(c => isWithinInterval(c.date, currentMonthInterval));

                const grossRevenue = budgetsThisMonth.reduce((sum, doc) => sum + doc.value, 0);
                const totalChargebacks = chargebacksThisMonth.reduce((sum, doc) => sum + doc.value, 0);
                
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

    const calculateDailyAverage = (goal: number, currentRevenue: number) => {
        const remainingGoal = Math.max(0, goal - currentRevenue);
        const today = new Date();
        let dailyAverage = 0;
        
        if (remainingGoal > 0) {
            const endOfCurrentMonth = endOfMonth(today);
            const remainingDaysInterval = eachDayOfInterval({ start: today, end: endOfCurrentMonth });
            const remainingBusinessDays = remainingDaysInterval.filter(day => !isWeekend(day)).length;

            if (remainingBusinessDays > 0) {
                dailyAverage = remainingGoal / remainingBusinessDays;
            } else {
                dailyAverage = remainingGoal;
            }
        }
        return dailyAverage;
    }

    if (isLoading) {
        return <p>Carregando desempenho...</p>;
    }
    
    if (!appUser) {
        return <Card><CardContent className="p-6 text-center text-destructive">Usuário não autenticado.</CardContent></Card>
    }

    const progress = goal > 0 ? Math.min((performance.net / goal) * 100, 100) : 0;
    const isGoalMet = performance.net >= goal;
    const dailyAverage = calculateDailyAverage(goal, performance.net);

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
                    {dailyAverage > 0 && (
                        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                            <TrendingUp className="h-4 w-4" />
                            <span>Média diária restante: <span className="font-bold text-foreground">{dailyAverage.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></span>
                        </div>
                    )}
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
                        {isGoalMet && goal > 0 ? (
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
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="budgets">Orçamentos</TabsTrigger>
                    <TabsTrigger value="refused">Recusas</TabsTrigger>
                    <TabsTrigger value="chargebacks">Estornos</TabsTrigger>
                    <TabsTrigger value="goal">Minha Meta</TabsTrigger>
                </TabsList>
                <TabsContent value="budgets" className="mt-6">
                    <BudgetsTab appUser={appUser} />
                </TabsContent>
                <TabsContent value="refused" className="mt-6">
                    <RefusedBudgetsTab appUser={appUser} />
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
