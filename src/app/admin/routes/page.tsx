
"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
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
import { PlusCircle, Save, Trash2, Eye, CheckCircle, ChevronDown, Calendar as CalendarIcon, Edit, Users, Truck, Package, PackageOpen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, deleteDoc, Timestamp, setDoc, writeBatch, getDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { type Route, type RouteStop, type ServiceOrder, type Technician, type RoutePart } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import React from "react";
import { Progress } from "@/components/ui/progress";
import { triggerWebhook } from "@/app/admin/returns/page";


function parseRouteText(text: string): RouteStop[] {
    if (!text.trim()) return [];

    // Normalize line endings and split into lines
    const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
    const headerLine = lines.shift()?.trim();
    if (!headerLine) return [];
    
    // Replace multiple spaces/tabs with a single tab for consistent splitting
    const normalizeSpaces = (line: string) => line.replace(/[\s\t]{2,}/g, '\t');

    const headers = normalizeSpaces(headerLine).split('\t').map(h => h.trim().toLowerCase());
    
    // Dynamically find indices of headers
    const getIndex = (name: string | string[]) => {
        const names = Array.isArray(name) ? name : [name];
        for (const n of names) {
            const index = headers.indexOf(n.toLowerCase());
            if (index !== -1) return index;
        }
        return -1;
    };

    const headerIndices = {
        soNro: getIndex('so nro.'),
        ascJobNo: getIndex('asc job no.'),
        consumerName: getIndex('nome consumidor'),
        city: getIndex('cidade'),
        neighborhood: getIndex('bairro'),
        state: getIndex('uf'),
        model: getIndex('modelo'),
        turn: getIndex('turno'),
        tat: getIndex('tat'),
        requestDate: getIndex('data de solicitação'),
        firstVisitDate: getIndex('1st visit date'),
        ts: getIndex('ts'),
        warrantyType: getIndex('ow/lp'),
        productType: getIndex('spd'),
        statusComment: getIndex('status comment'),
    };
    
    // Find all indices for parts
    const partColumns: { codeIndex: number; qtyIndex: number; descIndex?: number }[] = [];
    headers.forEach((header, index) => {
        if (header === 'cod') {
            const codeIndex = index;
            let qtyIndex = -1;
            let descIndex = -1;
            
            // Look for QTD and DESCRICAO in the next columns
            if (headers[index + 1]?.toLowerCase() === 'qtd') {
                qtyIndex = index + 1;
            } else if (headers[index + 1]?.toLowerCase() === 'descricao' && headers[index + 2]?.toLowerCase() === 'qtd') {
                descIndex = index + 1;
                qtyIndex = index + 2;
            } else if (headers[index + 1]?.toLowerCase() === 'descrição' && headers[index + 2]?.toLowerCase() === 'qtd') {
                descIndex = index + 1;
                qtyIndex = index + 2;
            }
            
            if (qtyIndex !== -1) {
                partColumns.push({ codeIndex, qtyIndex, descIndex: descIndex !== -1 ? descIndex : undefined });
            }
        }
    });

    return lines.map(line => {
        const columns = normalizeSpaces(line).split('\t');

        // Basic validation: ensure the line has enough columns to be a valid entry
        const serviceOrder = columns[headerIndices.soNro]?.trim();
        if (!serviceOrder) {
            return null;
        }

        const parts: RoutePart[] = [];
        partColumns.forEach(pc => {
            const code = columns[pc.codeIndex]?.trim();
            const quantityStr = columns[pc.qtyIndex]?.trim();
            if (code && quantityStr) {
                const quantity = parseInt(quantityStr, 10);
                if (!isNaN(quantity) && quantity > 0) {
                    parts.push({
                        code: code,
                        description: pc.descIndex ? (columns[pc.descIndex]?.trim() || '') : '',
                        quantity: quantity,
                        trackingCode: ''
                    });
                }
            }
        });
        
        return {
            serviceOrder: serviceOrder,
            ascJobNumber: columns[headerIndices.ascJobNo]?.trim() || '',
            consumerName: columns[headerIndices.consumerName]?.trim() || '',
            city: columns[headerIndices.city]?.trim() || '',
            neighborhood: columns[headerIndices.neighborhood]?.trim() || '',
            state: columns[headerIndices.state]?.trim() || '',
            model: columns[headerIndices.model]?.trim() || '',
            turn: columns[headerIndices.turn]?.trim() || '',
            tat: columns[headerIndices.tat]?.trim() || '',
            requestDate: columns[headerIndices.requestDate]?.trim() || '',
            firstVisitDate: columns[headerIndices.firstVisitDate]?.trim() || '',
            ts: columns[headerIndices.ts]?.trim() || '',
            warrantyType: columns[headerIndices.warrantyType]?.trim() || '',
            productType: columns[headerIndices.productType]?.trim() || '',
            statusComment: columns[headerIndices.statusComment]?.trim() || '',
            parts: parts,
            stopType: 'padrao', // Default value
        };
    }).filter((stop): stop is RouteStop => stop !== null);
}


function reconstructRouteText(stops: RouteStop[]): string {
    if (!stops || stops.length === 0) return "";
    const header = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD";
    const lines = stops.map(stop => {
        const baseColumns = [
            stop.serviceOrder || '',
            stop.ascJobNumber || '',
            stop.consumerName || '',
            stop.city || '',
            stop.neighborhood || '',
            stop.state || '',
            stop.model || '',
            stop.turn || '',
            stop.tat || '',
            stop.requestDate || '',
            stop.firstVisitDate || '',
            stop.ts || '',
            stop.warrantyType || '',
            stop.productType || '',
            stop.statusComment || '',
        ];
        const partColumns = (stop.parts || []).flatMap(p => [p.code, p.description, p.quantity.toString()]);
        return [...baseColumns, ...partColumns].join('\t');
    });
    return [header, ...lines].join('\n');
}


function RouteFormDialog({ 
    mode, 
    isOpen, 
    onOpenChange, 
    onRouteSaved, 
    initialData,
    technicians
}: { 
    mode: 'add' | 'edit',
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onRouteSaved: () => void,
    initialData?: Route | null,
    technicians: Technician[]
}) {
    const { toast } = useToast();
    const [routeName, setRouteName] = useState("");
    const [routeText, setRouteText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [departureDate, setDepartureDate] = useState<Date | undefined>();
    const [arrivalDate, setArrivalDate] = useState<Date | undefined>();
    const [routeType, setRouteType] = useState<'capital' | 'interior' | undefined>();
    const [licensePlate, setLicensePlate] = useState("");
    const [technicianId, setTechnicianId] = useState<string | undefined>();
    const [parsedStops, setParsedStops] = useState<RouteStop[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (mode === 'edit' && initialData) {
                setRouteName(initialData.name);
                setDepartureDate(initialData.departureDate instanceof Timestamp ? initialData.departureDate.toDate() : initialData.departureDate);
                setArrivalDate(initialData.arrivalDate instanceof Timestamp ? initialData.arrivalDate.toDate() : initialData.arrivalDate);
                setRouteType(initialData.routeType);
                setLicensePlate(initialData.licensePlate || "");
                setTechnicianId(initialData.technicianId || "");
                setParsedStops(initialData.stops.map(s => ({ ...s, stopType: s.stopType || 'padrao' })));
                const initialText = reconstructRouteText(initialData.stops);
                setRouteText(initialText);
            } else {
                setRouteName("");
                setRouteText("");
                setDepartureDate(undefined);
                setArrivalDate(undefined);
                setRouteType(undefined);
                setLicensePlate("");
                setTechnicianId(undefined);
                setParsedStops([]);
            }
        }
    }, [initialData, mode, isOpen]);
    
    const handleRouteTextChange = (text: string) => {
        setRouteText(text);
        const stopsFromText = parseRouteText(text);
        const newStops = stopsFromText.map(newStop => {
            const existingStop = parsedStops.find(cs => cs.serviceOrder === newStop.serviceOrder);
            return { ...newStop, stopType: existingStop?.stopType || 'padrao' };
        });
        setParsedStops(newStops);
    };


    const handleStopTypeChange = (index: number, type: 'padrao' | 'coleta' | 'entrega') => {
        setParsedStops(currentStops => {
            const newStops = [...currentStops];
            newStops[index].stopType = type;
            return newStops;
        });
    };

    const handleSave = async () => {
        if (!routeName || parsedStops.length === 0 || !departureDate || !arrivalDate || !routeType || !technicianId) {
            toast({
                variant: "destructive",
                title: "Dados Incompletos",
                description: "Todos os campos da rota (nome, técnico, datas, tipo e dados) são obrigatórios."
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const technician = technicians.find(t => t.id === technicianId);
            
            let stopsToSave: RouteStop[] = parsedStops;

            if (mode === 'edit' && initialData) {
                 stopsToSave = parsedStops.map(newStop => {
                    const existingStop = initialData.stops.find(s => s.serviceOrder === newStop.serviceOrder);
                    if (existingStop && existingStop.parts) {
                        const newParts = (newStop.parts || []).map(newPart => {
                             const existingPart = (existingStop.parts || []).find(p => p.code === newPart.code);
                             if (existingPart) {
                                 return { ...newPart, trackingCode: existingPart.trackingCode || '' };
                             }
                             return newPart;
                        });
                        return { ...newStop, parts: newParts };
                    }
                    return newStop;
                 });
            }


            const dataToSave = {
                name: routeName,
                stops: stopsToSave,
                departureDate: Timestamp.fromDate(departureDate),
                arrivalDate: Timestamp.fromDate(arrivalDate),
                routeType: routeType,
                licensePlate: licensePlate,
                technicianId: technicianId,
                technicianName: technician?.name || '',
            };

            if (mode === 'add') {
                await addDoc(collection(db, "routes"), {
                    ...dataToSave,
                    createdAt: Timestamp.now(),
                    isActive: true,
                });
                toast({ title: "Rota salva com sucesso!" });

                // Trigger webhook for new route with detailed payload
                await triggerWebhook({
                    event: 'new_route',
                    technicianName: technician?.name,
                    technicianPhone: technician?.phone,
                    routeName: routeName,
                    licensePlate: licensePlate,
                    departureDate: format(departureDate, 'dd/MM/yyyy'),
                    arrivalDate: format(arrivalDate, 'dd/MM/yyyy'),
                    stops: stopsToSave.map(stop => ({
                        so_nro: stop.serviceOrder,
                        cidade: stop.city,
                        spd: stop.productType
                    }))
                });

            } else if (initialData) {
                await setDoc(doc(db, "routes", initialData.id), dataToSave, { merge: true });
                toast({ title: "Rota atualizada com sucesso!" });
            }
            
            onOpenChange(false);
            onRouteSaved();
        } catch (error) {
            console.error("Error saving route: ", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: `Não foi possível ${mode === 'add' ? 'salvar' : 'atualizar'} a rota.` });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>{mode === 'add' ? 'Adicionar Nova Rota' : 'Editar Rota'}</DialogTitle>
                    <DialogDescription>
                        Preencha o nome da rota, atribua a um técnico e cole os dados da sua planilha.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="route-name">Nome da Rota</Label>
                            <Input
                                id="route-name"
                                value={routeName}
                                onChange={(e) => setRouteName(e.target.value)}
                                placeholder="Ex: Rota de Segunda-feira"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="technicianId">Técnico Responsável</Label>
                            <Select value={technicianId} onValueChange={setTechnicianId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um técnico" />
                                </SelectTrigger>
                                <SelectContent>
                                    {technicians.map(tech => (
                                        <SelectItem key={tech.id} value={tech.id}>{tech.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label>Data de Saída</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !departureDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {departureDate ? format(departureDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={departureDate} onSelect={setDepartureDate} initialFocus /></PopoverContent>
                                </Popover>
                            </div>
                            <div className="space-y-2">
                                <Label>Previsão de Chegada</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal", !arrivalDate && "text-muted-foreground")}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {arrivalDate ? format(arrivalDate, "PPP", { locale: ptBR }) : <span>Selecione a data</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={arrivalDate} onSelect={setArrivalDate} initialFocus /></PopoverContent>
                                </Popover>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo de Rota</Label>
                                <Select value={routeType} onValueChange={(v) => setRouteType(v as 'capital' | 'interior')}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="capital">Capital</SelectItem>
                                        <SelectItem value="interior">Interior</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="license-plate">Placa do Veículo</Label>
                                <Input
                                    id="license-plate"
                                    value={licensePlate}
                                    onChange={(e) => setLicensePlate(e.target.value)}
                                    placeholder="Ex: ABC-1234"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                             <Label htmlFor="route-text">Colar Dados da Rota</Label>
                             <Textarea 
                                id="route-text"
                                placeholder="Cole aqui os dados da sua planilha..."
                                value={routeText}
                                onChange={(e) => handleRouteTextChange(e.target.value)}
                                rows={10}
                             />
                             <p className="text-xs text-muted-foreground">
                                O cabeçalho da planilha deve ser incluído no texto.
                            </p>
                        </div>
                    </div>
                     <div className="space-y-4">
                        <Label>Pré-visualização da Rota</Label>
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Peças</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedStops.length > 0 ? parsedStops.map((stop, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                                            <TableCell>
                                                <Select value={stop.stopType || 'padrao'} onValueChange={(v) => handleStopTypeChange(index, v as any)}>
                                                    <SelectTrigger className="text-xs h-8">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="padrao">Padrão</SelectItem>
                                                        <SelectItem value="coleta">Coleta</SelectItem>
                                                        <SelectItem value="entrega">Entrega</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell>
                                                {stop.parts && stop.parts.length > 0 ? (
                                                    <ul className="list-disc pl-4 text-xs font-mono">
                                                        {stop.parts.map((part, pIndex) => (
                                                            <li key={`${part.code}-${pIndex}`}>{part.code} (x{part.quantity})</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">Nenhuma</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="h-24 text-center">
                                                A pré-visualização aparecerá aqui.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={isSubmitting}>
                        <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Rota"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RouteDetailsRow({ stop, index, serviceOrders, routeCreatedAt }: { stop: RouteStop, index: number, serviceOrders: ServiceOrder[], routeCreatedAt: Timestamp | Date }) {
    const createdAtDate = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
    const isCompleted = serviceOrders.some(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, createdAtDate)
    );

    const getRowClass = () => {
        if (isCompleted) return "bg-green-100 dark:bg-green-900/50 line-through";
        switch (stop.stopType) {
            case 'coleta': return 'bg-yellow-100 dark:bg-yellow-900/50';
            case 'entrega': return 'bg-blue-100 dark:bg-blue-900/50';
            default: return '';
        }
    };

    return (
        <React.Fragment>
            <CollapsibleTrigger asChild>
                <TableRow className={cn("cursor-pointer", getRowClass())}>
                    <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                    <TableCell className="font-mono">{stop.ascJobNumber}</TableCell>
                    <TableCell>{stop.city}</TableCell>
                    <TableCell>{stop.neighborhood}</TableCell>
                    <TableCell>{stop.model}</TableCell>
                    <TableCell>{stop.ts}</TableCell>
                    <TableCell>{stop.warrantyType}</TableCell>
                    <TableCell>
                            {(stop.parts || []).length > 0 ? (
                            <div>
                                {stop.parts.map((part, pIndex) => (
                                    <div key={pIndex} className="font-mono text-xs">
                                        {part.code} (x{part.quantity})
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                    </TableCell>
                    <TableCell className="text-right">
                        <ChevronDown className="h-4 w-4 transition-transform [&[data-state=open]]:rotate-180" />
                    </TableCell>
                </TableRow>
            </CollapsibleTrigger>
            <CollapsibleContent asChild>
                <tr className="bg-muted/50">
                    <TableCell colSpan={9} className="p-2">
                            <div className="p-2 bg-background/50 rounded space-y-2">
                            <div>
                                <p className="font-semibold text-xs mb-1">Nome Consumidor:</p>
                                <p className="text-sm text-foreground">{stop.consumerName || "N/A"}</p>
                            </div>
                            <div>
                                <p className="font-semibold text-xs mb-1">Status Comment:</p>
                                <p className="text-sm text-foreground">{stop.statusComment || "N/A"}</p>
                            </div>
                        </div>
                    </TableCell>
                </tr>
            </CollapsibleContent>
        </React.Fragment>
    )
}

export default function RoutesPage() {
    const { toast } = useToast();
    const [allRoutes, setAllRoutes] = useState<Route[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true);

    const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
    const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
    const [selectedRouteForEdit, setSelectedRouteForEdit] = useState<Route | null>(null);


    const fetchRoutes = async () => {
        setIsLoading(true);
        try {
            const [routesSnapshot, ordersSnapshot, techsSnapshot] = await Promise.all([
                getDocs(collection(db, "routes")),
                getDocs(collection(db, "serviceOrders")),
                getDocs(collection(db, "technicians"))
            ]);

            const routesData = routesSnapshot.docs
                .map(doc => {
                    const data = doc.data();
                    const createdAtDate = (data.createdAt as Timestamp)?.toDate();
                    return {
                         ...data, 
                         id: doc.id,
                         departureDate: (data.departureDate as Timestamp)?.toDate(),
                         arrivalDate: (data.arrivalDate as Timestamp)?.toDate(),
                         createdAt: createdAtDate
                    } as Route
                })
                .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
            setAllRoutes(routesData);

            const ordersData = ordersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, date: (doc.data().date as Timestamp).toDate() } as ServiceOrder));
            setServiceOrders(ordersData);
            
            const techsData = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
            setTechnicians(techsData);

        } catch (error) {
            console.error("Error fetching routes: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as rotas." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRoutes();
    }, [toast]);

    useEffect(() => {
        const routesToFilter = [...allRoutes];
        if (showOnlyActive) {
            setFilteredRoutes(routesToFilter.filter(route => route.isActive === true));
        } else {
            setFilteredRoutes(routesToFilter);
        }
    }, [allRoutes, showOnlyActive]);


    const handleDelete = async () => {
        if (!selectedRoute) return;
        try {
            await deleteDoc(doc(db, "routes", selectedRoute.id));
            toast({ title: "Rota excluída com sucesso!" });
            setIsDeleteDialogOpen(false);
            setSelectedRoute(null);
            fetchRoutes();
        } catch (error) {
            console.error("Error deleting route: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível excluir a rota." });
        }
    };
    
    const handleFinalizeRoute = async (routeId: string) => {
        try {
            await setDoc(doc(db, "routes", routeId), { isActive: false }, { merge: true });
            toast({ title: "Rota finalizada com sucesso!" });
            fetchRoutes(); // refetch to update the list
        } catch (error) {
            console.error("Error finalizing route: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível finalizar a rota." });
        }
    };


    const handleOpenViewDialog = (route: Route) => {
        setSelectedRoute(route);
        setIsViewDialogOpen(true);
    };

    const handleOpenDeleteDialog = (route: Route) => {
        setSelectedRoute(route);
        setIsDeleteDialogOpen(true);
    };

    const handleOpenFormDialog = (mode: 'add' | 'edit', route?: Route) => {
        setDialogMode(mode);
        setSelectedRouteForEdit(route || null);
        setIsFormDialogOpen(true);
    };

    const renderRouteActions = (route: Route) => (
        <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => handleOpenViewDialog(route)}>
                <Eye className="mr-2 h-4 w-4" /> Visualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleOpenFormDialog('edit', route)}>
                <Edit className="mr-2 h-4 w-4" /> Editar
            </Button>
            {route.isActive && (
                <Button size="sm" onClick={() => handleFinalizeRoute(route.id)}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Finalizar
                </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => handleOpenDeleteDialog(route)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </Button>
        </div>
    );

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold">Gerenciar Rotas</h1>
                    <Button onClick={() => handleOpenFormDialog('add')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Rota
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Rotas Cadastradas</CardTitle>
                        <CardDescription>
                            Visualize e gerencie as rotas importadas para os técnicos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <div className="flex items-center space-x-2 mb-4">
                            <Switch
                                id="active-routes-filter"
                                checked={showOnlyActive}
                                onCheckedChange={setShowOnlyActive}
                            />
                            <Label htmlFor="active-routes-filter">Mostrar apenas rotas ativas</Label>
                        </div>
                       {isLoading ? (
                           <p className="text-center text-muted-foreground py-10">Carregando rotas...</p>
                       ) : filteredRoutes.length === 0 ? (
                           <div className="text-center text-muted-foreground py-10">
                                <p>Nenhuma rota encontrada.</p>
                                <p className="text-sm">Clique em "Adicionar Rota" para importar uma nova ou altere o filtro.</p>
                            </div>
                       ) : (
                        <>
                           {/* Desktop Table */}
                           <div className="hidden md:block">
                                <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nome da Rota</TableHead>
                                        <TableHead>Técnico</TableHead>
                                        <TableHead>Paradas</TableHead>
                                        <TableHead>Progresso</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRoutes.map(route => {
                                            const totalStops = route.stops.length;
                                            const completedStopsCount = route.stops.filter(stop => 
                                                serviceOrders.some(os => 
                                                    os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt)
                                                )
                                            ).length;
                                            const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;

                                        return (
                                            <TableRow key={route.id} className={!route.isActive ? "text-muted-foreground" : ""}>
                                            <TableCell className="font-medium">{route.name}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-muted-foreground" />
                                                    <span>{route.technicianName || 'N/A'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{route.stops.length}</TableCell>
                                            <TableCell className="w-[200px]">
                                                    <div className="flex flex-col gap-1">
                                                        <Progress value={progress} />
                                                        <span className="text-xs text-muted-foreground">{completedStopsCount} de {totalStops} concluídas</span>
                                                    </div>
                                            </TableCell>
                                            <TableCell>
                                                    <Badge variant={route.isActive ? "default" : "secondary"}>
                                                        {route.isActive ? "Ativa" : "Finalizada"}
                                                    </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                {renderRouteActions(route)}
                                            </TableCell>
                                        </TableRow>
                                    )})}
                                </TableBody>
                                </Table>
                           </div>

                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {filteredRoutes.map(route => {
                                        const totalStops = route.stops.length;
                                        const completedStopsCount = route.stops.filter(stop => 
                                            serviceOrders.some(os => 
                                                os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt)
                                            )
                                        ).length;
                                        const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;

                                    return (
                                        <Card key={route.id} className={cn(!route.isActive && "bg-muted/50")}>
                                            <CardHeader>
                                                <div className="flex justify-between items-start">
                                                    <CardTitle>{route.name}</CardTitle>
                                                    <Badge variant={route.isActive ? "default" : "secondary"}>
                                                        {route.isActive ? "Ativa" : "Finalizada"}
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                 <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Técnico:</span>
                                                    <span className="font-medium">{route.technicianName || 'N/A'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Paradas:</span>
                                                    <span className="font-medium">{totalStops}</span>
                                                </div>
                                                <div className="space-y-2">
                                                     <Progress value={progress} />
                                                    <span className="text-xs text-muted-foreground">{completedStopsCount} de {totalStops} concluídas</span>
                                                </div>
                                            </CardContent>
                                            <CardFooter>
                                                {renderRouteActions(route)}
                                            </CardFooter>
                                        </Card>
                                    )
                                })}
                            </div>
                        </>
                       )}
                    </CardContent>
                </Card>
            </div>
            
            <RouteFormDialog 
                mode={dialogMode}
                isOpen={isFormDialogOpen}
                onOpenChange={setIsFormDialogOpen}
                onRouteSaved={fetchRoutes}
                initialData={selectedRouteForEdit}
                technicians={technicians}
            />

            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent className="max-w-6xl">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Rota: {selectedRoute?.name}</DialogTitle>
                         <DialogDescription>
                            Use a legenda de cores para identificar os tipos de parada.
                        </DialogDescription>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-2">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></div><span>Coleta</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300"></div><span>Entrega</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-100 border border-green-300"></div><span>Finalizada</span></div>
                        </div>
                    </DialogHeader>
                    <div className="max-h-[70vh] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>OS</TableHead>
                                    <TableHead>ASC Job No.</TableHead>
                                    <TableHead>Cidade</TableHead>
                                    <TableHead>Bairro</TableHead>
                                    <TableHead>Modelo</TableHead>
                                    <TableHead>TS</TableHead>
                                    <TableHead>OW/LP</TableHead>
                                    <TableHead>Peças</TableHead>
                                    <TableHead className="w-[50px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedRoute?.stops.map((stop, index) => (
                                     <Collapsible asChild key={index}>
                                        <RouteDetailsRow stop={stop} index={index} serviceOrders={serviceOrders} routeCreatedAt={selectedRoute.createdAt!} />
                                     </Collapsible>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente a rota
                            <span className="font-bold mx-1">{selectedRoute?.name}</span>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                           Sim, excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

