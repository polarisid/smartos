"use client";

import { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { type ChecklistTemplate, type ChecklistField, type RouteStop } from '@/lib/data';
import { ArrowLeft, PlusCircle, Trash2, Save, Move, TestTube2, Link as LinkIcon, ScanLine } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import dynamic from 'next/dynamic';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);


type FieldWithPosition = ChecklistField & { x: number; y: number };

const availableVariables: { key: keyof RouteStop | 'currentDate' | 'serial', label: string }[] = [
    { key: 'serviceOrder', label: 'Número da OS' },
    { key: 'consumerName', label: 'Nome do Cliente' },
    { key: 'model', label: 'Modelo do Produto' },
    { key: 'serial', label: 'Número de Série' },
    { key: 'city', label: 'Cidade' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'requestDate', label: 'Data de Solicitação' },
    { key: 'warrantyType', label: 'Tipo de Garantia' },
    { key: 'replacedPart', label: 'Peças Trocadas'},
    { key: 'observations', label: 'Observações'},
    { key: 'technicianName', label: 'Nome do Técnico'},
    { key: 'currentDate', label: 'Data Atual (DD/MM/AAAA)'},
];

function TestChecklistDialog({ template, fields, isOpen, onOpenChange }: { 
    template: ChecklistTemplate | null, 
    fields: FieldWithPosition[], 
    isOpen: boolean, 
    onOpenChange: (isOpen: boolean) => void 
}) {
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [formData, setFormData] = useState<Record<string, string | boolean>>({});
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanTargetField, setScanTargetField] = useState<string | null>(null);
    
    // Mock data for testing variable fields
    const mockRouteStop: Partial<RouteStop> & { currentDate?: string, serial?: string } = {
        serviceOrder: "OS-TESTE-123",
        consumerName: "João da Silva Teste",
        model: "QN55Q80AAGXZD",
        serial: "Y4HY3298Y293492I",
        city: "São Paulo",
        neighborhood: "Centro",
        requestDate: new Date().toLocaleDateString('pt-BR'),
        warrantyType: "LP",
        replacedPart: "BN94-12345A, BN98-54321B",
        observations: "Cliente relatou que o problema é intermitente. Realizar todos os testes possíveis.",
        technicianName: "Carlos Pereira",
        currentDate: new Date().toLocaleDateString('pt-BR'),
    };
    
    const handleInputChange = (fieldId: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    const handleOpenScanner = (fieldId: string) => {
        setScanTargetField(fieldId);
        setIsScannerOpen(true);
    };

    const handleScanSuccess = (decodedText: string) => {
        if (scanTargetField) {
            handleInputChange(scanTargetField, decodedText);
        }
        setIsScannerOpen(false);
        setScanTargetField(null);
        toast({ title: "Código lido com sucesso!" });
    };

    const handleGeneratePdf = async () => {
        if (!template) return;
        setIsGenerating(true);
        try {
            const pdfUrl = `${window.location.origin}${template.pdfUrl}`;
            const existingPdfBytes = await fetch(pdfUrl).then(res => res.arrayBuffer());
            const pdfDoc = await PDFDocument.load(existingPdfBytes);
            const pages = pdfDoc.getPages();
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            
            fields.forEach(field => {
                let value: string | boolean | undefined | null = formData[field.id];
                
                // If a variable is linked, use mock data. Otherwise, use form data.
                if (field.variableKey) {
                    value = mockRouteStop[field.variableKey as keyof typeof mockRouteStop] || `[${'field.variableKey'}]`;
                }

                if (value !== undefined && value !== null) {
                    const pageToDraw = pages[field.page - 1] || pages[0];
                    const pageHeight = pageToDraw.getHeight();

                    if (field.type === 'text' && typeof value === 'string') {
                         pageToDraw.drawText(value, {
                            x: field.x,
                            y: pageHeight - field.y - 10, // Adjust for PDF origin
                            font,
                            size: 12,
                            color: rgb(0, 0, 0),
                        });
                    } else if (field.type === 'checkbox' && value === true) {
                         pageToDraw.drawText('X', {
                            x: field.x + 2,
                            y: pageHeight - field.y - 12, // Adjust for PDF origin
                            font,
                            size: 14,
                            color: rgb(0, 0, 0),
                        });
                    }
                }
            });

            const pdfBytes = await pdfDoc.save();

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `teste_${template.name.replace(/\s+/g, '_')}.pdf`;
            link.click();
            URL.revokeObjectURL(link.href);

        } catch (error) {
            console.error("Error generating PDF:", error);
            toast({ variant: "destructive", title: "Erro ao Gerar PDF" });
        } finally {
            setIsGenerating(false);
            onOpenChange(false);
        }
    };

    if (!template) return null;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Testar Preenchimento: {template.name}</DialogTitle>
                        <DialogDescription>
                            Preencha os campos manuais para gerar um PDF de teste. Campos vinculados a variáveis usarão dados de exemplo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        {fields.length === 0 ? <p>Nenhum campo configurado.</p> : fields.map(field => {
                            const isSerialField = field.name.toLowerCase().includes('serial');
                            
                            if (field.variableKey) {
                                return (
                                    <div key={field.id} className="space-y-2 p-3 rounded-lg bg-muted/50">
                                        <Label className="flex items-center gap-2"><LinkIcon className="h-4 w-4 text-muted-foreground" /> {field.name}</Label>
                                        <p className="text-sm text-muted-foreground">Vinculado à variável: <span className="font-semibold">{availableVariables.find(v => v.key === field.variableKey)?.label}</span></p>
                                    </div>
                                )
                            }
                            return (
                                <div key={field.id} className="space-y-2">
                                    <Label htmlFor={`test-${field.id}`}>{field.name} (Pág. {field.page})</Label>
                                    {field.type === 'text' ? (
                                        <div className="flex items-center gap-2">
                                            <Input 
                                                id={`test-${field.id}`}
                                                onChange={(e) => handleInputChange(field.id, e.target.value)}
                                            />
                                            {isSerialField && (
                                                <Button type="button" size="icon" variant="outline" onClick={() => handleOpenScanner(field.id)}>
                                                    <ScanLine className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-2">
                                            <input 
                                                type="checkbox"
                                                id={`test-${field.id}`}
                                                className="h-4 w-4"
                                                onChange={(e) => handleInputChange(field.id, e.target.checked)}
                                            />
                                            <label htmlFor={`test-${field.id}`} className="text-sm">Marcar</label>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleGeneratePdf} disabled={isGenerating}>
                            {isGenerating ? 'Gerando...' : 'Gerar PDF de Teste'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ScannerDialog
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScanSuccess={handleScanSuccess}
            />
        </>
    );
}

export default function EditChecklistPage({ params }: { params: { id: string } }) {
    const { id } = params;
    const { toast } = useToast();
    const router = useRouter();
    const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
    const [fields, setFields] = useState<FieldWithPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [numPages, setNumPages] = useState<number | null>(null);
    const pdfContainerRef = useRef<HTMLDivElement>(null);
    const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);

    const [draggingField, setDraggingField] = useState<string | null>(null);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (!id) return;
        const fetchTemplate = async () => {
            setIsLoading(true);
            try {
                const docRef = doc(db, 'checklistTemplates', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = { id: docSnap.id, ...docSnap.data() } as ChecklistTemplate;
                    setTemplate(data);
                    const initialFields = (data.fields || []).map(f => ({
                        ...f,
                        x: f.x || 50,
                        y: f.y || 50 + (parseInt(f.id.split('-')[1]) * 40)
                    }));
                    setFields(initialFields as FieldWithPosition[]);
                } else {
                    toast({ variant: 'destructive', title: 'Erro', description: 'Modelo de checklist não encontrado.' });
                    router.push('/admin/checklists');
                }
            } catch (error) {
                console.error("Error fetching template:", error);
                toast({ variant: 'destructive', title: 'Erro ao carregar', description: 'Não foi possível buscar os dados do modelo.' });
            } finally {
                setIsLoading(false);
            }
        };
        fetchTemplate();
    }, [id, router, toast]);

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    const addNewField = () => {
        const newField: FieldWithPosition = {
            id: `field-${Date.now()}`,
            name: `Novo Campo ${fields.length + 1}`,
            type: 'text',
            page: 1,
            x: 50,
            y: 50 + (fields.length * 40),
            variableKey: undefined,
        };
        setFields([...fields, newField]);
    };

    const updateField = (id: string, newValues: Partial<ChecklistField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...newValues } : f));
    };


    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
    };

    const handleSaveFields = async () => {
        if (!template) return;
        setIsSubmitting(true);
        try {
            const templateRef = doc(db, 'checklistTemplates', template.id);
            // Sanitize fields before saving to avoid Firestore errors with 'undefined'
            const fieldsToSave = fields.map(f => {
                const fieldCopy: Partial<FieldWithPosition> = {...f};
                if (fieldCopy.variableKey === undefined || fieldCopy.variableKey === 'none') {
                    delete fieldCopy.variableKey;
                }
                return fieldCopy;
            });
            await updateDoc(templateRef, { fields: fieldsToSave });
            toast({ title: 'Campos salvos!', description: 'As posições e dados dos campos foram atualizados.' });
        } catch (error) {
            console.error('Error saving fields:', error);
            toast({ variant: 'destructive', title: 'Erro ao Salvar' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, fieldId: string) => {
        const field = fields.find(f => f.id === fieldId);
        if (!field || !pdfContainerRef.current) return;
        
        setDraggingField(fieldId);
        setOffset({
            x: e.clientX - field.x,
            y: e.clientY - field.y
        });
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!draggingField || !pdfContainerRef.current) return;

        const containerRect = pdfContainerRef.current.getBoundingClientRect();
        
        let newX = e.clientX - offset.x;
        let newY = e.clientY - offset.y;

        newX = Math.max(0, Math.min(newX, containerRect.width - 50));
        newY = Math.max(0, Math.min(newY, containerRect.height - 30));

        setFields(prevFields => 
            prevFields.map(f => 
                f.id === draggingField ? { ...f, x: newX, y: newY } : f
            )
        );
    };

    const handleMouseUp = () => {
        setDraggingField(null);
    };


    if (isLoading) return <div className="p-6 text-center">Carregando editor...</div>;
    if (!template) return null;
    
    const pdfUrl = template.pdfUrl.startsWith('http') ? template.pdfUrl : `${window.location.origin}${template.pdfUrl}`;

    return (
        <>
            <div className="flex h-screen flex-col bg-muted/40">
                <header className="bg-card border-b p-4 flex justify-between items-center sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="sm" onClick={() => router.push('/admin/checklists')}>
                            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold">Editando: {template.name}</h1>
                            <p className="text-sm text-muted-foreground">Arraste os campos para posicioná-los sobre o PDF.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => setIsTestDialogOpen(true)} disabled={isSubmitting}>
                            <TestTube2 className="mr-2 h-4 w-4" /> Testar Preenchimento
                        </Button>
                        <Button onClick={handleSaveFields} disabled={isSubmitting}>
                            <Save className="mr-2 h-4 w-4" /> {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </div>
                </header>

                <div className="flex-grow grid md:grid-cols-3 gap-4 p-4 overflow-hidden">
                    <aside className="md:col-span-1 bg-card rounded-lg border p-4 flex flex-col">
                        <CardHeader className="p-2">
                            <CardTitle>Campos do Checklist</CardTitle>
                            <CardDescription>Adicione, edite e remova os campos do formulário.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 overflow-y-auto pr-2">
                            {fields.map(field => (
                                <div key={field.id} className="space-y-3 border p-3 rounded-lg bg-background">
                                    <Input
                                        value={field.name}
                                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                                        placeholder="Nome do Campo"
                                    />
                                    <div className="flex gap-2">
                                        <Select value={field.type} onValueChange={(v) => updateField(field.id, { type: v as 'text' | 'checkbox' })}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="text">Texto</SelectItem>
                                                <SelectItem value="checkbox">Caixa de Seleção</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            min="1"
                                            max={numPages || 1}
                                            value={field.page}
                                            onChange={(e) => updateField(field.id, { page: parseInt(e.target.value, 10) || 1 })}
                                            placeholder="Pág."
                                            className="w-20"
                                        />
                                        <Button variant="destructive" size="icon" onClick={() => removeField(field.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Vincular à Variável (Opcional)</Label>
                                        <Select
                                            value={field.variableKey || ''}
                                            onValueChange={(v) => updateField(field.id, { variableKey: v === 'none' ? undefined : v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Nenhuma variável selecionada" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Nenhuma</SelectItem>
                                                {availableVariables.map(v => (
                                                    <SelectItem key={v.key} value={v.key}>{v.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                        <CardFooter className="p-2 pt-4">
                            <Button onClick={addNewField} className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Campo
                            </Button>
                        </CardFooter>
                    </aside>

                    <main 
                        className="md:col-span-2 bg-card rounded-lg border p-4 overflow-auto relative"
                        ref={pdfContainerRef}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        {template.pdfUrl ? (
                            <Document
                                file={pdfUrl}
                                onLoadSuccess={onDocumentLoadSuccess}
                                onLoadError={(error) => toast({ variant: 'destructive', title: 'Erro ao carregar PDF', description: error.message })}
                                className="flex justify-center"
                                loading="Carregando PDF..."
                            >
                                {Array.from(new Array(numPages), (el, index) => (
                                    <Page key={`page_${index + 1}`} pageNumber={index + 1} renderTextLayer={false} />
                                ))}
                            </Document>
                        ) : (
                             <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>Nenhum PDF associado a este modelo.</p>
                            </div>
                        )}
                        
                        {fields.map(field => (
                            <div
                                key={field.id}
                                className="absolute flex items-center gap-1 p-1 rounded-sm bg-blue-500/30 border border-blue-600 cursor-move"
                                style={{ left: `${field.x}px`, top: `${field.y}px` }}
                                onMouseDown={(e) => handleMouseDown(e, field.id)}
                            >
                                <Move className="h-3 w-3 text-blue-800" />
                                {field.type === 'text' ? (
                                    <span className="text-xs text-blue-800 bg-white/50 px-2 py-0.5 rounded-sm flex items-center gap-1">
                                        {field.variableKey && <LinkIcon className="h-3 w-3" />}
                                        {field.name}
                                    </span>
                                ) : (
                                    <div className="w-4 h-4 border border-blue-800 bg-white/50" />
                                )}
                            </div>
                        ))}
                    </main>
                </div>
            </div>
            <TestChecklistDialog 
                template={template} 
                fields={fields} 
                isOpen={isTestDialogOpen}
                onOpenChange={setIsTestDialogOpen}
            />
        </>
    );
}
