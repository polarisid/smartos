
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, DollarSign, FileDown, UserPlus, PackagePlus, Trash2, Printer, ClipboardList, Download, TrendingUp, Target, FileMinus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, Timestamp, getDocs, query, where, getDoc, doc, orderBy, limit } from "firebase/firestore";
import { type CounterBudget, type BudgetItem, type RefusedBudget, type ChecklistTemplate, type ChecklistField, type Technician, type Chargeback } from "@/lib/data";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAfter, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend } from "date-fns";
import { Progress } from "@/components/ui/progress";


type FieldWithPosition = ChecklistField & { x: number; y: number };

function RefusedBudgetsTab({ technicianId }: { technicianId: string }) {
    const { toast } = useToast();
    const [reason, setReason] = useState("");
    const [serviceOrderNumber, setServiceOrderNumber] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [refusedBudgets, setRefusedBudgets] = useState<RefusedBudget[]>([]);

    useEffect(() => {
        const fetchRefusedBudgets = async () => {
            if (!technicianId) return;
            const q = query(collection(db, "refusedBudgets"), where("technicianId", "==", technicianId));
            const snapshot = await getDocs(q);
            const budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RefusedBudget));
            setRefusedBudgets(budgets.sort((a,b) => (b.date instanceof Date ? b.date.getTime() : (b.date as unknown as Timestamp).toDate().getTime()) - (a.date instanceof Date ? a.date.getTime() : (a.date as unknown as Timestamp).toDate().getTime())));
        };
        fetchRefusedBudgets();
    }, [technicianId]);

    const handleSave = async () => {
        if (!serviceOrderNumber || !reason) {
            toast({ variant: "destructive", title: "Campos obrigatórios" });
            return;
        }
        setIsSubmitting(true);
        try {
            const newRefusedBudget: Omit<RefusedBudget, 'id' | 'date'> & {date: Date} = {
                technicianId,
                serviceOrderNumber,
                reason,
                date: new Date(),
            };
            const docRef = await addDoc(collection(db, "refusedBudgets"), newRefusedBudget);
            setRefusedBudgets(prev => [{...newRefusedBudget, id: docRef.id}, ...prev]);
            setReason("");
            setServiceOrderNumber("");
            toast({ title: "Recusa de orçamento registrada." });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao salvar" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Registrar Recusa de Orçamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="space-y-2">
                        <Label htmlFor="refused-os">Nº da Ordem de Serviço</Label>
                        <Input id="refused-os" value={serviceOrderNumber} onChange={e => setServiceOrderNumber(e.target.value)} placeholder="OS que foi recusada" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reason">Motivo da Recusa</Label>
                        <Textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Descreva o motivo pelo qual o cliente recusou o orçamento" />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        {isSubmitting ? 'Salvando...' : 'Salvar Recusa'}
                    </Button>
                </CardFooter>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle>Histórico de Recusas</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>OS</TableHead>
                                <TableHead>Motivo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {refusedBudgets.map(b => (
                                <TableRow key={b.id}>
                                    <TableCell>{b.date instanceof Date ? b.date.toLocaleDateString('pt-BR') : (b.date as unknown as Timestamp).toDate().toLocaleDateString('pt-BR')}</TableCell>
                                    <TableCell className="font-mono">{b.serviceOrderNumber}</TableCell>
                                    <TableCell>{b.reason}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

function DashboardTab({ technicianId, technicianName }: { technicianId: string, technicianName?: string }) {
    const [revenueThisMonth, setRevenueThisMonth] = useState(0);
    const [technicianGoal, setTechnicianGoal] = useState(0);
    const [counterGoal, setCounterGoal] = useState(0);
    const [totalCounterRevenue, setTotalCounterRevenue] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    
    // New state for additional dashboard data
    const [lastBudgets, setLastBudgets] = useState<CounterBudget[]>([]);
    const [monthlyChargebacks, setMonthlyChargebacks] = useState(0);


    const techProgress = technicianGoal > 0 ? (revenueThisMonth / technicianGoal) * 100 : 0;
    const counterProgress = counterGoal > 0 ? (totalCounterRevenue / counterGoal) * 100 : 0;

    const dailyAverage = useMemo(() => {
        const remainingGoal = Math.max(0, technicianGoal - revenueThisMonth);
        if (remainingGoal <= 0) return 0;

        const today = new Date();
        const endOfCurrentMonth = endOfMonth(today);
        const remainingDaysInterval = eachDayOfInterval({ start: today, end: endOfCurrentMonth });
        const remainingBusinessDays = remainingDaysInterval.filter(day => !isWeekend(day)).length;

        if (remainingBusinessDays > 0) {
            return remainingGoal / remainingBusinessDays;
        }
        return remainingGoal;
    }, [revenueThisMonth, technicianGoal]);


    useEffect(() => {
        const fetchData = async () => {
            if (!technicianId) return;
            setIsLoading(true);

            const now = new Date();
            const startOfCurrentMonth = startOfMonth(now);

            // Fetch technician's specific goal
            const techDocRef = doc(db, "technicians", technicianId);
            const techDocSnap = await getDoc(techDocRef);
            if (techDocSnap.exists()) {
                const techData = techDocSnap.data() as Technician;
                setTechnicianGoal(techData.goal || 0);
            }

            // Fetch technician's budgets for this month and last 5 budgets
            const budgetsQuery = query(
                collection(db, "counterBudgets"),
                where("technicianId", "==", technicianId),
                orderBy("date", "desc")
            );
            const budgetsSnapshot = await getDocs(budgetsQuery);
            
            const allTechBudgets = budgetsSnapshot.docs.map(doc => ({...doc.data(), id: doc.id } as CounterBudget));
            setLastBudgets(allTechBudgets.slice(0, 5));
            
            const monthlyRevenue = allTechBudgets
                .filter(budget => isAfter((budget.date as Timestamp).toDate(), startOfCurrentMonth))
                .reduce((sum, budget) => sum + (budget.totalValue || budget.value || 0), 0);
            setRevenueThisMonth(monthlyRevenue);
            
            // Fetch technician's chargebacks for this month
            const chargebacksQuery = query(
                collection(db, "chargebacks"),
                where("technicianId", "==", technicianId)
            );
            const chargebacksSnapshot = await getDocs(chargebacksQuery);
            const totalChargebacks = chargebacksSnapshot.docs
                .map(doc => doc.data() as Chargeback)
                .filter(chargeback => isAfter((chargeback.date as Timestamp).toDate(), startOfCurrentMonth))
                .reduce((sum, chargeback) => sum + chargeback.value, 0);
            setMonthlyChargebacks(totalChargebacks);

            // Fetch general counter goal
            const goalDocRef = doc(db, "configs", "counterGoal");
            const goalDoc = await getDoc(goalDocRef);
            if (goalDoc.exists()) {
                setCounterGoal(goalDoc.data().value || 0);
            }

            // Fetch all counter budgets for this month to calculate total
            const allBudgetsQuery = query(collection(db, "counterBudgets"));
            const allBudgetsSnapshot = await getDocs(allBudgetsQuery);
            const totalRevenue = allBudgetsSnapshot.docs
                .map(doc => doc.data() as CounterBudget)
                .filter(budget => isAfter((budget.date as Timestamp).toDate(), startOfCurrentMonth))
                .reduce((sum, budget) => sum + (budget.totalValue || budget.value || 0), 0);
            setTotalCounterRevenue(totalRevenue);

            setIsLoading(false);
        };

        fetchData();
    }, [technicianId]);

    if (isLoading) {
        return <p>Carregando dashboard...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meu Faturamento (Mês)</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{revenueThisMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                         <p className="text-xs text-muted-foreground">
                            Meta Individual: {technicianGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                        <Progress value={techProgress} className="mt-2" />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meta Geral do Balcão (Mês)</CardTitle>
                        <Target className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalCounterRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                         <p className="text-xs text-muted-foreground">
                            de {counterGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                         <Progress value={counterProgress} className="mt-2" />
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meus Estornos (Mês)</CardTitle>
                        <FileMinus className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">-{monthlyChargebacks.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                         <p className="text-xs text-muted-foreground">Total deduzido da sua meta.</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Meta Diária Restante</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{dailyAverage.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                         <p className="text-xs text-muted-foreground">Valor médio por dia útil para atingir a meta.</p>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Últimos Orçamentos Aprovados</CardTitle>
                    <CardDescription>Seus últimos 5 atendimentos registrados no balcão.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Modelo</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lastBudgets.length > 0 ? (
                                lastBudgets.map(budget => (
                                    <TableRow key={budget.id}>
                                        <TableCell>{(budget.date as Timestamp).toDate().toLocaleDateString('pt-BR')}</TableCell>
                                        <TableCell>{budget.customerName}</TableCell>
                                        <TableCell>{budget.productModel}</TableCell>
                                        <TableCell className="text-right font-mono">{(budget.totalValue || budget.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">Nenhum orçamento aprovado encontrado.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


export default function CounterTechnicianDashboardPage() {
    const { appUser } = useAuth();
    const { toast } = useToast();
    
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [allBudgets, setAllBudgets] = useState<CounterBudget[]>([]);

    // Step 1 State
    const [customerName, setCustomerName] = useState('');
    const [customerCpf, setCustomerCpf] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');

    // Step 2 State
    const [productModel, setProductModel] = useState('');
    const [productSerial, setProductSerial] = useState('');
    const [productDefect, setProductDefect] = useState('');
    const [productObservations, setProductObservations] = useState('');
    const [warrantyStatus, setWarrantyStatus] = useState<'undecided' | 'warranty' | 'no_warranty'>('undecided');
    
    // Checklist State
    const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
    const [checklistFields, setChecklistFields] = useState<FieldWithPosition[]>([]);
    const [checklistData, setChecklistData] = useState<Record<string, string | boolean>>({});
    
    // Budget State
    const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
    const [newBudgetItem, setNewBudgetItem] = useState<BudgetItem>({ code: '', description: '', quantity: 1, value: 0 });
    const [budgetStatus, setBudgetStatus] = useState<'undecided' | 'approved' | 'refused'>('undecided');
    const [refusalReason, setRefusalReason] = useState('');

    useEffect(() => {
      const fetchInitialData = async () => {
        const budgetsSnapshot = await getDocs(collection(db, "counterBudgets"));
        const budgets = budgetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as CounterBudget);
        setAllBudgets(budgets);

        const checklistsSnapshot = await getDocs(query(collection(db, "checklistTemplates"), where("type", "==", "counter")));
        const checklists = checklistsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistTemplate));
        setChecklistTemplates(checklists);
      };
      fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedTemplate) {
            const initialFields = (selectedTemplate.fields || []).map(f => ({ ...f, x: f.x || 50, y: f.y || 50 }));
            setChecklistFields(initialFields as FieldWithPosition[]);
        } else {
            setChecklistFields([]);
        }
    }, [selectedTemplate]);

    useEffect(() => {
        const newChecklistData: Record<string, string | boolean> = {};
        const allData = { 
            consumerName: customerName,
            model: productModel,
            serial: productSerial,
            observations: productObservations,
            technicianName: appUser?.name,
            currentDate: new Date().toLocaleDateString('pt-BR'),
        };

        checklistFields.forEach(field => {
            if (field.variableKey && field.variableKey in allData) {
                const value = allData[field.variableKey as keyof typeof allData];
                if (value) {
                     newChecklistData[field.id] = String(value);
                }
            }
        });
        setChecklistData(prev => ({...prev, ...newChecklistData}));
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [checklistFields, customerName, productModel, productSerial, productObservations, appUser?.name]);


    const handleCpfChange = (cpf: string) => {
        setCustomerCpf(cpf);
        const existingCustomer = allBudgets.find(b => b.customerCpf === cpf && b.customerCpf);
        if (existingCustomer) {
            setCustomerName(existingCustomer.customerName);
            setCustomerPhone(existingCustomer.customerPhone);
            toast({ title: "Cliente encontrado!", description: "Os dados do cliente foram preenchidos automaticamente." });
        }
    };


    const handleNextStep = () => {
        if (!customerName || !customerPhone) {
            toast({ variant: "destructive", title: "Campos obrigatórios", description: "Nome e Telefone do cliente são obrigatórios." });
            return;
        }
        setStep(2);
    };

    const handleAddBudgetItem = () => {
        if (newBudgetItem.description && newBudgetItem.quantity > 0 && newBudgetItem.value > 0) {
            setBudgetItems([...budgetItems, newBudgetItem]);
            setNewBudgetItem({ code: '', description: '', quantity: 1, value: 0 });
        } else {
             toast({ variant: "destructive", title: "Item inválido", description: "Preencha a descrição, quantidade e valor da peça." });
        }
    };
    
    const handleRemoveBudgetItem = (index: number) => {
        setBudgetItems(budgetItems.filter((_, i) => i !== index));
    };

    const handleTemplateChange = (templateId: string) => {
        const template = checklistTemplates.find(t => t.id === templateId);
        setSelectedTemplate(template || null);
        if (!template) {
            setChecklistData({});
        }
    };
    
    const handleChecklistInputChange = (fieldId: string, value: string | boolean) => {
        setChecklistData({ ...checklistData, [fieldId]: value });
    };

    const totalBudgetValue = budgetItems.reduce((total, item) => total + (item.quantity * item.value), 0);

    const resetForm = () => {
        setStep(1);
        setCustomerName('');
        setCustomerCpf('');
        setCustomerPhone('');
        setProductModel('');
        setProductSerial('');
        setProductDefect('');
        setProductObservations('');
        setWarrantyStatus('undecided');
        setBudgetItems([]);
        setNewBudgetItem({ code: '', description: '', quantity: 1, value: 0 });
        setSelectedTemplate(null);
        setChecklistData({});
        setBudgetStatus('undecided');
        setRefusalReason('');
    };

    const handleSaveService = async ({ approved = false, refused = false, refusalReason = '' }) => {
        if (!appUser) {
            toast({ variant: "destructive", title: "Erro de autenticação" });
            return;
        }
        if (!productModel || !productDefect) {
            toast({ variant: "destructive", title: "Dados do Produto", description: "Modelo e defeito do produto são obrigatórios." });
            return;
        }
         if (warrantyStatus === 'undecided') {
            toast({ variant: "destructive", title: "Status da Garantia", description: "Selecione se o produto está ou não em garantia." });
            return;
        }
        
        setIsSubmitting(true);
        try {
            if (approved) {
                 const dataToSave: Partial<CounterBudget> = {
                    technicianId: appUser.uid,
                    technicianName: appUser.name,
                    date: Timestamp.now(),
                    customerName,
                    customerCpf,
                    customerPhone,
                    productModel,
                    productSerial,
                    productDefect,
                    productObservations,
                    isWarranty: warrantyStatus === 'warranty',
                    budgetItems: warrantyStatus === 'warranty' ? [] : budgetItems,
                    totalValue: warrantyStatus === 'warranty' ? 0 : totalBudgetValue,
                };
                await addDoc(collection(db, "counterBudgets"), dataToSave);
                toast({ title: "Atendimento Salvo!", description: "O novo atendimento de balcão foi registrado." });

            } else if (refused) {
                 if (!refusalReason) {
                    toast({ variant: "destructive", title: "Motivo obrigatório", description: "Por favor, insira o motivo da recusa." });
                    setIsSubmitting(false);
                    return;
                }
                const refusedData: Omit<RefusedBudget, 'id'> = {
                    technicianId: appUser.uid,
                    technicianName: appUser.name,
                    serviceOrderNumber: productSerial || `BALCAO-${Date.now()}`,
                    reason: refusalReason,
                    date: new Date(),
                    customerName: customerName,
                    productModel: productModel,
                    totalValue: totalBudgetValue,
                };
                 await addDoc(collection(db, "refusedBudgets"), refusedData);
                 toast({ title: "Recusa de Orçamento Salva!" });
            }
            
            resetForm();

        } catch (error) {
            console.error("Error saving service:", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível registrar o atendimento." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const generateChecklistPdf = async () => {
        if (!selectedTemplate) {
            toast({ variant: "destructive", title: "Modelo não selecionado" });
            return;
        }
        setIsSubmitting(true);
        try {
            const pdfUrl = `${window.location.origin}${selectedTemplate.pdfUrl}`;
            const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            checklistFields.forEach(field => {
                const value = checklistData[field.id];
                
                if (value !== undefined && value !== null) {
                    const pageToDraw = pages[field.page - 1] || pages[0];
                    if (pageToDraw) {
                        const pageHeight = pageToDraw.getHeight();
                        if (field.type === 'text' && typeof value === 'string') {
                            pageToDraw.drawText(value, { x: field.x, y: pageHeight - field.y - 10, font, size: 12, color: rgb(0, 0, 0) });
                        } else if (field.type === 'checkbox' && value === true) {
                            pageToDraw.drawText('X', { x: field.x + 2, y: pageHeight - field.y - 12, font, size: 14, color: rgb(0, 0, 0) });
                        }
                    }
                }
            });

            const pdfBytes = await pdfDoc.save();

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Checklist_Balcao_${customerName.replace(/\s/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            toast({ title: "PDF gerado com sucesso!" });

        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Erro ao Gerar PDF" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const generateBudgetPdf = async () => {
        if (!customerName || !productModel) {
            toast({ variant: "destructive", title: "Dados incompletos", description: "Preencha os dados do cliente e produto." });
            return;
        }
        setIsSubmitting(true);
        try {
            const doc = new jsPDF();
    
            // Carregar a imagem de cabeçalho
            const imgResponse = await fetch('/checklists/oficial.pdf');
            if (imgResponse.ok) {
                // Se o "oficial.pdf" for uma imagem ou um PDF de uma página com um cabeçalho,
                // a lógica para extrair e adicionar a imagem seria mais complexa.
                // Uma abordagem mais simples é ter o cabeçalho como uma imagem JPG/PNG.
                // Supondo que temos uma `header.jpg` em `public/`.
                // const headerImg = await fetch('/header.jpg').then(res => res.blob());
                // const reader = new FileReader();
                // reader.readAsDataURL(headerImg);
                // reader.onloadend = () => {
                //     const base64data = reader.result;
                //     doc.addImage(base64data, 'JPEG', 0, 0, 210, 50); // Ajuste as dimensões
                // }
            }
            
            // Textos - simulando um cabeçalho
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text("Orçamento de Serviço", 105, 20, { align: 'center' });
    
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 190, 30, { align: 'right' });
    
            // Dados do Cliente e Produto
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("Dados do Cliente", 14, 40);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Nome: ${customerName}`, 14, 48);
            doc.text(`Telefone: ${customerPhone}`, 14, 54);
            doc.text(`CPF: ${customerCpf}`, 14, 60);
    
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("Dados do Produto", 14, 75);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Modelo: ${productModel}`, 14, 83);
            doc.text(`Nº de Série: ${productSerial}`, 14, 89);
            doc.text(`Defeito Relatado: ${productDefect}`, 14, 95);
    
            // Tabela de Itens do Orçamento
            const tableBody = budgetItems.map(item => [
                item.code, 
                item.description, 
                item.quantity.toString(),
                item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                (item.quantity * item.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ]);
    
            (doc as any).autoTable({
                 head: [['Cód', 'Descrição', 'Qtd', 'Vlr. Unit.', 'Vlr. Total']],
                 body: tableBody,
                 startY: 110,
                 theme: 'grid',
            });
            
            // Total
            const finalY = (doc as any).lastAutoTable.finalY || 150;
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("Total do Orçamento:", 14, finalY + 15);
            doc.text(totalBudgetValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 196, finalY + 15, { align: 'right' });
    
            doc.save(`orcamento_${customerName.replace(/\s/g, '_')}.pdf`);
            toast({ title: "PDF do orçamento gerado!" });

        } catch (error) {
            console.error("Error generating budget PDF:", error);
            toast({ variant: "destructive", title: "Erro ao gerar PDF do orçamento" });
        } finally {
            setIsSubmitting(false);
        }
    };


    if (!appUser) return <p>Carregando...</p>
    
    const renderActiveTabContent = () => {
        if (step === 1) {
             return (
                <Card className="max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><UserPlus /> Etapa 1: Dados do Cliente</CardTitle>
                        <CardDescription>Preencha as informações do cliente para iniciar o atendimento.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="customerCpf">CPF (Opcional)</Label>
                            <Input 
                                id="customerCpf" 
                                value={customerCpf} 
                                onChange={(e) => handleCpfChange(e.target.value)} 
                                placeholder="Digite o CPF para buscar o cliente" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="customerName">Nome do Cliente</Label>
                            <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome completo do cliente" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="customerPhone">Telefone</Label>
                            <Input id="customerPhone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(99) 99999-9999" />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleNextStep} className="w-full">Avançar para Dados do Produto</Button>
                    </CardFooter>
                </Card>
            );
        }
        if (step === 2) {
             return (
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-start">
                                <div>
                                    <CardTitle className="flex items-center gap-2"><PackagePlus /> Etapa 2: Dados do Produto e Orçamento</CardTitle>
                                    <CardDescription>Para o cliente: <span className="font-semibold text-foreground">{customerName}</span></CardDescription>
                                </div>
                                <Button variant="outline" onClick={() => setStep(1)}>Voltar</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="productModel">Modelo do Produto</Label>
                                    <Input id="productModel" value={productModel} onChange={(e) => setProductModel(e.target.value)} placeholder="Ex: QN55Q80AAGXZD" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="productSerial">Nº de Série (Opcional)</Label>
                                    <Input id="productSerial" value={productSerial} onChange={(e) => setProductSerial(e.target.value)} placeholder="Número de série do produto" />
                                </div>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="productDefect">Defeito Relatado</Label>
                                <Textarea id="productDefect" value={productDefect} onChange={(e) => setProductDefect(e.target.value)} placeholder="Descrição do defeito informado pelo cliente" />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="productObservations">Observações (Opcional)</Label>
                                <Textarea id="productObservations" value={productObservations} onChange={(e) => setProductObservations(e.target.value)} placeholder="Detalhes sobre o estado do produto, acessórios, etc." />
                            </div>
                             <div className="space-y-2 pt-4 border-t">
                                <Label className="font-semibold">O produto está em garantia?</Label>
                                <RadioGroup value={warrantyStatus} onValueChange={(v) => setWarrantyStatus(v as any)} className="flex items-center gap-6">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="warranty" id="r-warranty" />
                                        <Label htmlFor="r-warranty">Sim (em garantia)</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="no_warranty" id="r-no_warranty" />
                                        <Label htmlFor="r-no_warranty">Não (fora de garantia)</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </CardContent>
                    </Card>

                    {warrantyStatus !== 'undecided' && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2"><ClipboardList /> Checklist</CardTitle>
                                <CardDescription>Selecione um checklist para gerar a documentação.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Modelo de Checklist</Label>
                                    <Select onValueChange={handleTemplateChange} value={selectedTemplate?.id || ""}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={"Selecione um modelo..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Nenhum</SelectItem>
                                            {checklistTemplates.map(t => (
                                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {selectedTemplate && (
                                     <div className="space-y-6 pt-4 border-t">
                                        {checklistFields.map(field => {
                                             const value = checklistData[field.id];
                                             return (
                                                <div key={field.id} className="space-y-2">
                                                    <Label htmlFor={`fill-${field.id}`}>{field.name}</Label>
                                                     {field.type === 'text' ? (
                                                        <Input id={`fill-${field.id}`} value={value !== undefined ? String(value) : ''} onChange={(e) => handleChecklistInputChange(field.id, e.target.value)} />
                                                     ) : (
                                                         <div className="flex items-center space-x-2">
                                                            <input type="checkbox" id={`fill-${field.id}`} className="h-4 w-4" checked={!!value} onChange={(e) => handleChecklistInputChange(field.id, e.target.checked)} />
                                                            <label htmlFor={`fill-${field.id}`} className="text-sm">Marcar</label>
                                                        </div>
                                                     )}
                                                </div>
                                             )
                                        })}
                                     </div>
                                )}
                            </CardContent>
                             <CardFooter>
                                <Button onClick={generateChecklistPdf} disabled={isSubmitting || !selectedTemplate} className="w-full">
                                    <Download className="mr-2 h-4 w-4" />
                                    {isSubmitting ? 'Gerando...' : 'Gerar e Baixar PDF do Checklist'}
                                </Button>
                            </CardFooter>
                        </Card>
                    )}

                    {warrantyStatus === 'no_warranty' && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2"><DollarSign />Orçamento</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-12 gap-2 items-end p-4 border rounded-lg bg-muted/50">
                                    <div className="col-span-12 sm:col-span-3 space-y-1">
                                        <Label htmlFor="itemCode" className="text-xs">Cód. Peça</Label>
                                        <Input id="itemCode" value={newBudgetItem.code} onChange={(e) => setNewBudgetItem(s => ({...s, code: e.target.value}))} placeholder="BN94..." />
                                    </div>
                                    <div className="col-span-12 sm:col-span-4 space-y-1">
                                        <Label htmlFor="itemDesc" className="text-xs">Descrição</Label>
                                        <Input id="itemDesc" value={newBudgetItem.description} onChange={(e) => setNewBudgetItem(s => ({...s, description: e.target.value}))} placeholder="Placa Principal" />
                                    </div>
                                    <div className="col-span-4 sm:col-span-2 space-y-1">
                                        <Label htmlFor="itemQty" className="text-xs">Qtd.</Label>
                                        <Input id="itemQty" type="number" min="1" value={newBudgetItem.quantity} onChange={(e) => setNewBudgetItem(s => ({...s, quantity: parseInt(e.target.value) || 1}))} />
                                    </div>
                                    <div className="col-span-8 sm:col-span-2 space-y-1">
                                        <Label htmlFor="itemValue" className="text-xs">Valor (R$)</Label>
                                        <Input id="itemValue" type="number" value={newBudgetItem.value || ''} onChange={(e) => setNewBudgetItem(s => ({...s, value: parseFloat(e.target.value) || 0}))} placeholder="150.00" />
                                    </div>
                                    <div className="col-span-12 sm:col-span-1">
                                            <Button onClick={handleAddBudgetItem} className="w-full"><PlusCircle className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Peça</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead>Qtd.</TableHead>
                                            <TableHead>Valor Unit.</TableHead>
                                            <TableHead>Valor Total</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {budgetItems.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-mono">{item.code}</TableCell>
                                                <TableCell>{item.description}</TableCell>
                                                <TableCell>{item.quantity}</TableCell>
                                                <TableCell>{item.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                <TableCell>{(item.quantity * item.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                                <TableCell>
                                                    <Button variant="destructive" size="icon" onClick={() => handleRemoveBudgetItem(index)}><Trash2 className="h-4 w-4"/></Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="text-right font-bold text-lg">
                                    Total do Orçamento: {totalBudgetValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                                <div className="border-t pt-4">
                                     <Button onClick={generateBudgetPdf} disabled={isSubmitting || budgetItems.length === 0} className="w-full" variant="secondary">
                                        <FileDown className="mr-2 h-4 w-4" />
                                        {isSubmitting ? 'Gerando PDF...' : 'Gerar PDF do Orçamento'}
                                    </Button>
                                </div>
                            </CardContent>
                            <CardFooter>
                                <div className="w-full space-y-4">
                                     <div className="space-y-2 pt-4 border-t">
                                        <Label className="font-semibold">Status do Orçamento</Label>
                                        <RadioGroup value={budgetStatus} onValueChange={(v) => setBudgetStatus(v as any)} className="flex items-center gap-6">
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="approved" id="r-approved" />
                                                <Label htmlFor="r-approved">Aprovado</Label>
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="refused" id="r-refused" />
                                                <Label htmlFor="r-refused">Recusado</Label>
                                            </div>
                                        </RadioGroup>
                                    </div>
                                    {budgetStatus === 'refused' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="refusalReason">Motivo da Recusa</Label>
                                            <Textarea id="refusalReason" value={refusalReason} onChange={(e) => setRefusalReason(e.target.value)} placeholder="Descreva por que o cliente recusou" />
                                        </div>
                                    )}
                                    {budgetStatus === 'approved' && (
                                        <Button onClick={() => handleSaveService({ approved: true })} disabled={isSubmitting} className="w-full">
                                            <PlusCircle className="mr-2 h-4 w-4" /> 
                                            {isSubmitting ? 'Salvando...' : 'Finalizar Atendimento (Aprovado)'}
                                        </Button>
                                    )}
                                     {budgetStatus === 'refused' && (
                                        <Button onClick={() => handleSaveService({ refused: true, refusalReason: refusalReason })} disabled={isSubmitting} className="w-full" variant="destructive">
                                            {isSubmitting ? 'Salvando...' : 'Salvar Recusa'}
                                        </Button>
                                    )}
                                </div>
                            </CardFooter>
                        </Card>
                    )}
                    
                     {warrantyStatus === 'warranty' && (
                        <Card>
                            <CardFooter>
                                <Button onClick={() => handleSaveService({ approved: true })} disabled={isSubmitting} className="w-full">
                                    <PlusCircle className="mr-2 h-4 w-4" /> 
                                    {isSubmitting ? 'Salvando...' : 'Finalizar Atendimento (Garantia)'}
                                </Button>
                            </CardFooter>
                        </Card>
                     )}

                </div>
            );
        }
        return null;
    };

    return (
        <div className="container mx-auto">
             <Tabs defaultValue="service" className="w-full">
                <TabsList className="mb-6 grid w-full grid-cols-3">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="service" onClick={() => setStep(1)}>Novo Atendimento</TabsTrigger>
                    <TabsTrigger value="refused" onClick={() => setStep(3)}>Registrar Recusa</TabsTrigger>
                </TabsList>
                 <TabsContent value="dashboard">
                    <DashboardTab technicianId={appUser?.uid || ''} technicianName={appUser?.name} />
                </TabsContent>
                <TabsContent value="service">
                    {renderActiveTabContent()}
                </TabsContent>
                <TabsContent value="refused">
                    <RefusedBudgetsTab technicianId={appUser?.uid || ''} />
                </TabsContent>
            </Tabs>
        </div>
    );
}

    