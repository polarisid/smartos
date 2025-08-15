
"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, getDocs, Timestamp, doc, getDoc, setDoc } from "firebase/firestore";
import { type CounterBudget } from "@/lib/data";
import { DollarSign, Save } from "lucide-react";
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


function GoalManagement() {
    const { toast } = useToast();
    const [goalValue, setGoalValue] = useState<number>(10000); // Default goal
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchGoal = async () => {
            setIsLoading(true);
            try {
                const goalDocRef = doc(db, "configs", "counterGoal");
                const goalDoc = await getDoc(goalDocRef);
                if (goalDoc.exists()) {
                    setGoalValue(goalDoc.data().value || 10000);
                }
            } catch (error) {
                console.error("Error fetching counter goal:", error);
                toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar a meta salva." });
            } finally {
                setIsLoading(false);
            }
        };
        fetchGoal();
    }, [toast]);
    
    const handleSaveGoal = async () => {
        setIsSubmitting(true);
        try {
            const goalDocRef = doc(db, "configs", "counterGoal");
            await setDoc(goalDocRef, { value: goalValue });
            toast({ title: "Meta salva com sucesso!" });
        } catch (error) {
            console.error("Error saving counter goal:", error);
            toast({ variant: "destructive", title: "Erro ao salvar", description: "Não foi possível salvar a meta." });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Gerenciar Meta Balcão</CardTitle>
                <CardDescription>Defina a meta de faturamento geral para os serviços de balcão. Este valor será usado no dashboard.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="counter-goal">Meta de Faturamento (R$)</Label>
                    <Input 
                        id="counter-goal"
                        type="number"
                        value={goalValue}
                        onChange={(e) => setGoalValue(parseFloat(e.target.value) || 0)}
                        placeholder="Ex: 10000"
                        disabled={isLoading || isSubmitting}
                    />
                </div>
            </CardContent>
            <CardFooter>
                 <Button onClick={handleSaveGoal} disabled={isLoading || isSubmitting}>
                    <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Meta"}
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function CounterBudgetsPage() {
    const { toast } = useToast();
    const [budgets, setBudgets] = useState<CounterBudget[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchBudgets = async () => {
            setIsLoading(true);
            try {
                const snapshot = await getDocs(collection(db, "counterBudgets"));
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
        fetchBudgets();
    }, [toast]);
    
    return (
        <div className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Orçamentos do Balcão</h1>
            </div>

            <GoalManagement />

             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign /> Orçamentos Registrados no Balcão
                    </CardTitle>
                    <CardDescription>Visualize todos os orçamentos registrados pelos técnicos de balcão.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? <p className="text-center p-4">Carregando orçamentos...</p> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Técnico Balcão</TableHead>
                                    <TableHead>OS</TableHead>
                                    <TableHead>Valor (R$)</TableHead>
                                    <TableHead>Observações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {budgets.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{format(item.date, 'dd/MM/yyyy')}</TableCell>
                                        <TableCell className="font-medium">{item.technicianName}</TableCell>
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
    );
}
