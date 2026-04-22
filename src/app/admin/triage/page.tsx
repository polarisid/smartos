"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, Timestamp, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { type TriageSession, type KnowledgeDocument } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Bot, Plus, Link as LinkIcon, MessageSquareShare, FileText, CheckCircle2, Clock, Eye, AlertTriangle, PenTool, User as UserIcon, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

export default function TriageAdminPage() {
    const { toast } = useToast();
    const [sessions, setSessions] = useState<TriageSession[]>([]);
    const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
    const [selectedSession, setSelectedSession] = useState<TriageSession | null>(null);
    
    // API Quota Tracker
    const [apiStats, setApiStats] = useState({ requests: 0, limit: 20 });
    
    // Correction Tool State
    const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
    const [correctionDefect, setCorrectionDefect] = useState("");
    const [correctionParts, setCorrectionParts] = useState("");

    // New Triage State
    const [isNewTriageOpen, setIsNewTriageOpen] = useState(false);
    const [newOs, setNewOs] = useState("");
    const [newModel, setNewModel] = useState("");
    const [newLine, setNewLine] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    // New Knowledge Doc State
    const [isNewDocOpen, setIsNewDocOpen] = useState(false);
    const [docTitle, setDocTitle] = useState("");
    const [docModel, setDocModel] = useState("");
    const [docLine, setDocLine] = useState("Geral");
    const [docContent, setDocContent] = useState("");
    const [editingDocId, setEditingDocId] = useState<string | null>(null);

    useEffect(() => {
        const qSessions = query(collection(db, "triages"), orderBy("createdAt", "desc"));
        const unsubSessions = onSnapshot(qSessions, (snap) => {
            setSessions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TriageSession)));
        });

        const qDocs = query(collection(db, "knowledgeBase_rules"), orderBy("createdAt", "desc"));
        const unsubDocs = onSnapshot(qDocs, (snap) => {
            setKnowledgeDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnowledgeDocument)));
        });

        const unsubStats = onSnapshot(doc(db, "system_stats", "gemini_api"), (snap) => {
            if (snap.exists()) {
               const data = snap.data();
               const todayStr = new Date().toISOString().split('T')[0];
               if (data.date === todayStr) {
                   setApiStats({ requests: data.dailyRequests || 0, limit: 20 });
               } else {
                   setApiStats({ requests: 0, limit: 20 });
               }
            }
        });

        return () => { unsubSessions(); unsubDocs(); unsubStats(); };
    }, []);

    const handleCreateTriage = async () => {
        if (!newOs || !newModel) return toast({ variant: "destructive", title: "Preencha OS e Modelo." });
        setIsCreating(true);
        try {
            const triageData: Omit<TriageSession, 'id'> = {
                serviceOrderNumber: newOs,
                productModel: newModel,
                productLine: newLine,
                status: 'em_andamento',
                messages: [{
                    id: `msg-${Date.now()}`,
                    role: 'model',
                    content: `Olá! Sou o assistente virtual da assistência técnica. Vi que sua OS ${newOs} relatou um problema com o modelo ${newModel}. Pode me descrever exatamente o que está acontecendo?`,
                    createdAt: new Date()
                }],
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            };
            
            const docRef = await addDoc(collection(db, "triages"), triageData);
            
            toast({ title: "Triagem Criada!", description: "Link gerado para o cliente." });
            setNewOs(""); setNewModel(""); setNewLine(""); setIsNewTriageOpen(false);
            
            // Auto copy link
            const url = `${window.location.origin}/triage/${docRef.id}`;
            navigator.clipboard.writeText(`Olá! Acesse o link para iniciarmos o diagnóstico do seu produto: ${url}`);
            
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao criar triagem." });
        } finally {
            setIsCreating(false);
        }
    };

    const handleCreateDoc = async () => {
        if (!docTitle || !docContent) return toast({ variant: "destructive", title: "Preencha Título e Conteúdo." });
        try {
            if (editingDocId) {
                await updateDoc(doc(db, "knowledgeBase_rules", editingDocId), {
                    title: docTitle,
                    productLine: docLine !== "Geral" ? docLine : "",
                    productFamily: docModel,
                    content: docContent,
                    updatedAt: Timestamp.now()
                });
                toast({ title: "Informativo Atualizado!" });
            } else {
                await addDoc(collection(db, "knowledgeBase_rules"), {
                    title: docTitle,
                    productLine: docLine !== "Geral" ? docLine : "",
                    productFamily: docModel,
                    content: docContent,
                    createdAt: Timestamp.now()
                });
                toast({ title: "Informativo Salvo!" });
            }
            setDocTitle(""); setDocModel(""); setDocLine("Geral"); setDocContent(""); setEditingDocId(null); setIsNewDocOpen(false);
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao salvar informativo." });
        }
    };

    const handleDeleteDoc = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este informativo?")) return;
        try {
            await deleteDoc(doc(db, "knowledgeBase_rules", id));
            toast({ title: "Informativo Excluído!" });
        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao excluir." });
        }
    };

    const handleEditDoc = (docToEdit: KnowledgeDocument) => {
        setEditingDocId(docToEdit.id);
        setDocTitle(docToEdit.title);
        setDocLine(docToEdit.productLine || "Geral");
        setDocModel(docToEdit.productFamily || "");
        setDocContent(docToEdit.content);
        setIsNewDocOpen(true);
    };

    const copyLink = (id: string) => {
        const url = `${window.location.origin}/triage/${id}`;
        navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: url });
    };

    const handleCorrectionSubmit = async () => {
        if (!selectedSession || !correctionDefect) return toast({ variant: "destructive", title: "Informe o defeito correto." });
        try {
            // Update Triage Session
            const sessionRef = doc(db, "triages", selectedSession.id);
            await updateDoc(sessionRef, {
                isCorrected: true,
                correctedDiagnosis: correctionDefect,
                correctedParts: correctionParts ? correctionParts.split(',').map(p => p.trim()) : [],
                updatedAt: Timestamp.now()
            });

            // Feed the AI (Create KnowledgeBase Doc)
            const symptomsText = selectedSession.symptomsReported && selectedSession.symptomsReported.length > 0 
                ? selectedSession.symptomsReported.join(", ") 
                : "Vide transcrição da OS";
            const kbContent = `SINTOMAS RECLAMADOS: ${symptomsText}\nDIAGNÓSTICO CORRETO (APRENDIZAGEM): ${correctionDefect}\nPEÇAS: ${correctionParts || 'Nenhuma'}`;
            
            await addDoc(collection(db, "knowledgeBase_rules"), {
                title: `Correção Pós-Triagem (OS: ${selectedSession.serviceOrderNumber})`,
                productLine: selectedSession.productLine || "Geral",
                productFamily: selectedSession.productModel,
                content: kbContent,
                createdAt: Timestamp.now()
            });

            toast({ title: "IA Treinada no Defeito!", description: "Diagnóstico corrigido e inserido na Base de Conhecimento." });
            setIsCorrectionOpen(false);
            setCorrectionDefect("");
            setCorrectionParts("");
            setSelectedSession(prev => prev ? { ...prev, isCorrected: true, correctedDiagnosis: correctionDefect } : null);

        } catch (error) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro ao salvar correção." });
        }
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Triagem Assistida por IA</h2>
                <div className="flex items-center space-x-2">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border ${apiStats.requests >= apiStats.limit ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700'}`}>
                        <div className={`h-2 w-2 rounded-full ${apiStats.requests >= apiStats.limit ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                        Gemini AI ({apiStats.requests}/{apiStats.limit} hoje)
                    </div>
                    <Dialog open={isNewTriageOpen} onOpenChange={setIsNewTriageOpen}>
                        <DialogTrigger asChild>
                            <Button><Plus className="mr-2 h-4 w-4" /> Nova Triagem</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Iniciar Triagem Inteligente</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="space-y-2">
                                    <Label>Número da OS</Label>
                                    <Input value={newOs} onChange={e => setNewOs(e.target.value)} placeholder="Ex: 412200..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>Modelo do Produto</Label>
                                    <Input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="Ex: QN55Q80AA" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Linha do Produto (Segmento)</Label>
                                    <Select value={newLine} onValueChange={setNewLine}>
                                        <SelectTrigger><SelectValue placeholder="Selecione a Linha (Opcional)" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="REF">REF (Refrigeradores)</SelectItem>
                                            <SelectItem value="RAC">RAC (Ar Condicionado / Climatização)</SelectItem>
                                            <SelectItem value="WSM">WSM (Lavadoras de Roupa)</SelectItem>
                                            <SelectItem value="DTV">DTV (Televisores / Displays)</SelectItem>
                                            <SelectItem value="AUD">AUD (Áudio / Soundbar)</SelectItem>
                                            <SelectItem value="HKE">HKE (Eletroportáteis / Cozinha)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsNewTriageOpen(false)}>Cancelar</Button>
                                <Button onClick={handleCreateTriage} disabled={isCreating}>
                                    {isCreating ? 'Criando...' : 'Criar e Copiar Link'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Tabs defaultValue="sessions" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="sessions" className="flex items-center gap-2">
                        <Bot className="h-4 w-4" /> Sessões Ativas
                    </TabsTrigger>
                    <TabsTrigger value="knowledge" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Base de Conhecimento (IA)
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="sessions">
                    <Card>
                        <CardHeader>
                            <CardTitle>Últimas Triagens</CardTitle>
                            <CardDescription>Acompanhe os diagnósticos da IA em tempo real.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Modelo</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Diagnóstico (IA)</TableHead>
                                        <TableHead>Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sessions.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center">Nenhuma triagem encontrada.</TableCell></TableRow>
                                    ) : sessions.map(session => (
                                        <TableRow key={session.id}>
                                            <TableCell className="font-medium">{session.serviceOrderNumber}</TableCell>
                                            <TableCell>{session.productModel}</TableCell>
                                            <TableCell>
                                                {session.status === 'concluido' 
                                                    ? <span className="flex items-center text-green-600 gap-1 text-sm"><CheckCircle2 className="h-4 w-4"/> Concluído</span>
                                                    : <span className="flex items-center text-amber-600 gap-1 text-sm"><Clock className="h-4 w-4"/> Aguardando</span>
                                                }
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate text-sm">
                                                {session.finalDiagnosis || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => copyLink(session.id)} title="Copiar Link Cliente">
                                                    <LinkIcon className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => setSelectedSession(session)} title="Ver Diagnóstico e Chat">
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" asChild title="Abrir Chat como Admin">
                                                    <a href={`/triage/${session.id}`} target="_blank" rel="noreferrer">
                                                        <MessageSquareShare className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="knowledge">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Informativos Técnicos</CardTitle>
                                <CardDescription>Cole textos de manuais e boletins para treinar as respostas do Bot.</CardDescription>
                            </div>
                            <Dialog open={isNewDocOpen} onOpenChange={(open) => {
                                setIsNewDocOpen(open);
                                if (!open) { setEditingDocId(null); setDocTitle(""); setDocModel(""); setDocLine("Geral"); setDocContent(""); }
                            }}>
                                <DialogTrigger asChild>
                                    <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Adicionar Info</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                    <DialogHeader><DialogTitle>{editingDocId ? 'Editar Informativo' : 'Cadastrar Informativo DIT / GSPN'}</DialogTitle></DialogHeader>
                                    <div className="grid gap-4 py-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Título (Para sua organização)</Label>
                                                <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="Ex: Defeito Crônico Display QN85" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Família/Modelo Alvo</Label>
                                                <Input value={docModel} onChange={e => setDocModel(e.target.value)} placeholder="Ex: QN85A, QN90A" />
                                            </div>
                                            <div className="space-y-2 col-span-2">
                                                <Label>Linha do Produto Alvo</Label>
                                                <Select value={docLine} onValueChange={setDocLine}>
                                                    <SelectTrigger><SelectValue placeholder="Selecione a Linha (Opcional)" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Geral">Geral (Todas as Linhas)</SelectItem>
                                                        <SelectItem value="REF">REF (Refrigeradores)</SelectItem>
                                                        <SelectItem value="RAC">RAC (Ar Condicionado / Climatização)</SelectItem>
                                                        <SelectItem value="WSM">WSM (Lavadoras de Roupa)</SelectItem>
                                                        <SelectItem value="DTV">DTV (Televisores / Displays)</SelectItem>
                                                        <SelectItem value="AUD">AUD (Áudio / Soundbar)</SelectItem>
                                                        <SelectItem value="HKE">HKE (Cozinha / Outros)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Conteúdo do Boletim Técnico (Texto puro)</Label>
                                            <Textarea 
                                                rows={10} 
                                                value={docContent} 
                                                onChange={e => setDocContent(e.target.value)} 
                                                placeholder="Cole aqui o texto do manual. A IA lerá isso quando estiver conversando com um cliente de um produto correspondente..." 
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsNewDocOpen(false)}>Cancelar</Button>
                                        <Button onClick={handleCreateDoc}>{editingDocId ? 'Atualizar Base' : 'Salvar Base'}</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </CardHeader>
                        <CardContent>
                             <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Título</TableHead>
                                        <TableHead>Linha Alvo</TableHead>
                                        <TableHead>Modelos Alvo</TableHead>
                                        <TableHead className="w-[100px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {knowledgeDocs.length === 0 ? (
                                        <TableRow><TableCell colSpan={2} className="text-center">Nenhum informativo cadastrado.</TableCell></TableRow>
                                    ) : knowledgeDocs.map(doc => (
                                        <TableRow key={doc.id}>
                                            <TableCell className="font-medium">{doc.title}</TableCell>
                                            <TableCell>{doc.productLine || "Geral"}</TableCell>
                                            <TableCell>{doc.productFamily || "N/A"}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap">
                                                <Button variant="ghost" size="icon" onClick={() => handleEditDoc(doc)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteDoc(doc.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Triage Details Dialog */}
            <Dialog open={!!selectedSession} onOpenChange={(open) => !open && setSelectedSession(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Triagem (OS: {selectedSession?.serviceOrderNumber})</DialogTitle>
                        <DialogDescription>
                            Linha: {selectedSession?.productLine || "N/A"} | Modelo: {selectedSession?.productModel} | Status: {selectedSession?.status === 'concluido' ? 'Concluído' : 'Em Andamento'}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedSession && (
                        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                            {selectedSession.status === 'concluido' && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="border rounded-lg p-4 bg-muted/30">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4 text-primary" /> Defeito Diagnosticado
                                            </h4>
                                            {!selectedSession.isCorrected ? (
                                                <Button size="sm" variant="outline" className="h-7 text-xs bg-background" onClick={() => setIsCorrectionOpen(true)}>
                                                    <Pencil className="h-3 w-3 mr-1" /> Corrigir para IA
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-amber-700 font-semibold flex items-center bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                    Supervisionado
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-sm ${selectedSession.isCorrected ? 'font-medium text-amber-900' : ''}`}>
                                            {selectedSession.isCorrected ? selectedSession.correctedDiagnosis : (selectedSession.finalDiagnosis || "Não especificado")}
                                        </p>
                                    </div>
                                    <div className="border rounded-lg p-4 bg-muted/30">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-semibold flex items-center gap-2">
                                                <PenTool className="h-4 w-4 text-primary" /> Peças Sugeridas
                                            </h4>
                                            {selectedSession.isCorrected && (
                                                <span className="text-xs text-amber-700 font-semibold flex items-center bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                    Corrigidas
                                                </span>
                                            )}
                                        </div>
                                        {(() => {
                                            const parts = selectedSession.isCorrected
                                                ? selectedSession.correctedParts
                                                : selectedSession.suggestedParts;
                                            return parts && parts.length > 0 ? (
                                                <ul className="list-disc pl-5 text-sm space-y-1">
                                                    {parts.map((p, i) => <li key={i} className={selectedSession.isCorrected ? 'text-amber-900 font-medium' : ''}>{p}</li>)}
                                                </ul>
                                            ) : <p className="text-sm">Nenhuma peça sugerida.</p>;
                                        })()}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <h4 className="font-semibold border-b pb-2">Transcrição do Chat</h4>
                                <div className="space-y-4 rounded-xl border p-4 bg-card h-[400px] overflow-y-auto w-full">
                                    {selectedSession.messages.map((msg, index) => (
                                        <div key={msg.id || index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                                <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                                    {msg.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                                </div>
                                                <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none'} flex flex-col gap-2`}>
                                                    {msg.imageUrl && (
                                                        <a href={msg.imageUrl} target="_blank" rel="noreferrer" title="Abrir imagem original">
                                                            <img src={msg.imageUrl} alt="Anexo Cliente" className="max-w-[200px] max-h-[200px] rounded-md object-contain border border-foreground/10 cursor-pointer hover:opacity-80 transition-opacity" />
                                                        </a>
                                                    )}
                                                    <p className="text-sm">{msg.content}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Correction Form Dialog */}
            <Dialog open={isCorrectionOpen} onOpenChange={setIsCorrectionOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Corrigir Diagnóstico da IA</DialogTitle>
                        <DialogDescription>
                            Isso alterará o defeito desta OS e criará uma Regra Permanente na Base de Conhecimento para que a IA aprenda a resposta correta e não erre novamente em sintomas similares.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Defeito Correto / Solução Final</Label>
                            <Input 
                                value={correctionDefect} 
                                onChange={e => setCorrectionDefect(e.target.value)} 
                                placeholder="Ex: Placa Fonte (Sem saída de 12v)" 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Peças Corretas a Sugerir (Separadas por vírgula)</Label>
                            <Input 
                                value={correctionParts} 
                                onChange={e => setCorrectionParts(e.target.value)} 
                                placeholder="Ex: Placa Fonte BN44-12345A, Cabo Força" 
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCorrectionOpen(false)}>Cancelar</Button>
                        <Button onClick={handleCorrectionSubmit} className="bg-amber-600 hover:bg-amber-700 text-white">Salvar Correção e Treinar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
