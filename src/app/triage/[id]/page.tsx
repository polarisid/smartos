"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
import { type TriageSession, type TriageChatMessage } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, User as UserIcon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PublicTriagePage() {
    const { id } = useParams() as { id: string };
    const { toast } = useToast();
    
    const [session, setSession] = useState<TriageSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [userInput, setUserInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch session on load
    useEffect(() => {
        const fetchSession = async () => {
            if (!id) return;
            try {
                const docRef = doc(db, "triages", id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setSession({ id: docSnap.id, ...docSnap.data() } as TriageSession);
                } else {
                    toast({ variant: "destructive", title: "Link inválido ou expirado." });
                }
            } catch (error) {
                console.error("Error fetching triage session:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSession();
    }, [id, toast]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [session?.messages, isTyping]);

    const handleSendMessage = async () => {
        if (!userInput.trim() || !session || session.status === 'concluido' || isTyping) return;

        const messageText = userInput.trim();
        setUserInput(""); // Clear input early
        setIsTyping(true);

        const newUserMessage: TriageChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: messageText,
            createdAt: new Date()
        };

        try {
            const sessionRef = doc(db, "triages", id);
            
            // 1. Optimistic update & Save user message
            setSession(prev => prev ? { ...prev, messages: [...prev.messages, newUserMessage] } : null);
            await updateDoc(sessionRef, {
                messages: arrayUnion({ ...newUserMessage, createdAt: Timestamp.fromDate(newUserMessage.createdAt) })
            });

            // 2. Optional: Load global knowledge base here or on the server.
            // For now, we will pass an empty string until the Admin Knowledge Base is connected.
            const knowledgeBase = ""; 

            // 3. Call AI backend
            const response = await fetch('/api/triage/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productModel: session.productModel,
                    productLine: session.productLine,
                    history: session.messages,
                    userMessage: messageText,
                    knowledgeBase
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || "Servidor indisponível no momento.");
            }
            
            const aiData = await response.json();
            
            const newAiMessage: TriageChatMessage = {
                id: `msg-ai-${Date.now()}`,
                role: 'model',
                content: aiData.reply,
                createdAt: new Date()
            };

            const updatePayload: any = {
                messages: arrayUnion({ ...newAiMessage, createdAt: Timestamp.fromDate(newAiMessage.createdAt) }),
                updatedAt: Timestamp.now()
            };

            if (aiData.diagnosisComplete) {
                updatePayload.status = 'concluido';
                updatePayload.finalDiagnosis = aiData.finalDiagnosis || "Concluído";
                updatePayload.suggestedParts = aiData.suggestedParts || [];
                updatePayload.symptomsReported = aiData.symptomsReported || [];
            }

            await updateDoc(sessionRef, updatePayload);

            // Re-fetch to normalize state
            const updatedSnap = await getDoc(sessionRef);
            if (updatedSnap.exists()) {
                setSession({ id: updatedSnap.id, ...updatedSnap.data() } as TriageSession);
            }

        } catch (error: any) {
            console.error(error);
            toast({ variant: "destructive", title: "Erro na IA", description: error.message || "Tente novamente mais tarde." });
        } finally {
            setIsTyping(false);
        }
    };

    if (loading) {
        return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    if (!session) {
        return <div className="h-screen w-full flex flex-col items-center justify-center p-4 text-center">
            <h1 className="text-2xl font-bold mb-2">Triagem não encontrada</h1>
            <p className="text-muted-foreground">Verifique se o link está correto ou se a OS já foi encerrada.</p>
        </div>;
    }

    const isDone = session.status === 'concluido';

    return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg h-[85vh] flex flex-col shadow-xl">
                <CardHeader className="border-b bg-primary/5 rounded-t-xl pb-4">
                    <CardTitle className="flex items-center gap-2">
                        <Bot className="h-6 w-6 text-primary" />
                        Assistente Técnico Samsung
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">Produto: <span className="font-semibold">{session.productModel}</span> (OS: {session.serviceOrderNumber})</p>
                </CardHeader>
                
                <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                    {session.messages.length === 0 ? (
                        <div className="text-center text-muted-foreground mt-10">
                            Aguardando o início da interação...
                        </div>
                    ) : (
                        session.messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                        {msg.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                    </div>
                                    <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none'}`}>
                                        <p className="text-sm">{msg.content}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="flex gap-2 max-w-[85%] flex-row">
                                <div className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-muted">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="p-3 rounded-2xl bg-muted rounded-tl-none flex items-center gap-1">
                                    <span className="animate-bounce inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 mr-0.5"></span>
                                    <span className="animate-bounce inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 mr-0.5" style={{ animationDelay: '0.2s' }}></span>
                                    <span className="animate-bounce inline-block w-1.5 h-1.5 rounded-full bg-foreground/60" style={{ animationDelay: '0.4s' }}></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </CardContent>

                <CardFooter className="border-t p-4 bg-background rounded-b-xl">
                    {isDone ? (
                        <div className="w-full text-center text-sm font-medium text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                            Diagnóstico Concluído. Nossa equipe técnica já recebeu as informações!
                        </div>
                    ) : (
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} 
                            className="flex w-full items-center space-x-2"
                        >
                            <Input 
                                type="text"
                                placeholder="Digite sua resposta..."
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                disabled={isTyping}
                                className="flex-1"
                            />
                            <Button type="submit" size="icon" disabled={!userInput.trim() || isTyping}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}
