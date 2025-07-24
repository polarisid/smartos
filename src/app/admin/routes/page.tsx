

"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
import { PlusCircle, Save, Trash2, Eye, CheckCircle, ChevronDown, Calendar as CalendarIcon, Edit } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, deleteDoc, Timestamp, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { type Route, type RouteStop, type ServiceOrder } from "@/lib/data";
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


function parseRouteText(text: string): RouteStop[] {
    if (!text.trim()) return [];

    const lines = text.trim().split('\n');
    const headerLine = lines.shift()?.trim(); // Remove header
    if (!headerLine) return [];
    
    // Index map based on the header
    const headers = headerLine.split('\t').map(h => h.trim());
    const getIndex = (name: string) => headers.indexOf(name);

    const soNroIdx = getIndex('SO Nro.');
    const ascJobNoIdx = getIndex('ASC Job No.');
    const consumerNameIdx = getIndex('Nome Consumidor');
    const cityIdx = getIndex('Cidade');
    const neighborhoodIdx = getIndex('Bairro');
    const stateIdx = getIndex('UF');
    const modelIdx = getIndex('Modelo');
    const turnIdx = getIndex('TURNO');
    const tatIdx = getIndex('TAT');
    const requestDateIdx = getIndex('Data de Solicitação');
    const firstVisitDateIdx = getIndex('1st Visit Date');
    const tsIdx = getIndex('TS');
    const warrantyTypeIdx = getIndex('OW/LP');
    const productTypeIdx = getIndex('SPD');
    const statusCommentIdx = getIndex('Status comment');
    
    const partStartIndex = statusCommentIdx + 1;

    return lines.map(line => {
        const columns = line.split('\t');
        const parts = [];
        for (let i = partStartIndex; i < columns.length; i += 2) {
            if (columns[i] && columns[i].trim()) {
                parts.push({
                    code: columns[i].trim(),
                    quantity: parseInt(columns[i + 1]?.trim() || '0', 10),
                });
            }
        }
        return {
            serviceOrder: columns[soNroIdx]?.trim() || '',
            ascJobNumber: columns[ascJobNoIdx]?.trim() || '',
            consumerName: columns[consumerNameIdx]?.trim() || '',
            city: columns[cityIdx]?.trim() || '',
            neighborhood: columns[neighborhoodIdx]?.trim() || '',
            state: columns[stateIdx]?.trim() || '',
            model: columns[modelIdx]?.trim() || '',
            turn: columns[turnIdx]?.trim() || '',
            tat: columns[tatIdx]?.trim() || '',
            requestDate: columns[requestDateIdx]?.trim() || '',
            firstVisitDate: columns[firstVisitDateIdx]?.trim() || '',
            ts: columns[tsIdx]?.trim() || '',
            warrantyType: columns[warrantyTypeIdx]?.trim() || '',
            productType: columns[productTypeIdx]?.trim() || '',
            statusComment: columns[statusCommentIdx]?.trim() || '',
            parts: parts,
        };
    }).filter(stop => stop.serviceOrder);
}

function reconstructRouteText(stops: RouteStop[]): string {
    const header = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tQTD\tCOD\tQTD\tCOD\tQTD\tCOD\tQTD\tCOD\tQTD";
    const lines = stops.map(stop => {
        const baseColumns = [
            stop.serviceOrder,
            stop.ascJobNumber,
            stop.consumerName,
            stop.city,
            stop.neighborhood,
            stop.state,
            stop.model,
            stop.turn,
            stop.tat,
            stop.requestDate,
            stop.firstVisitDate,
            stop.ts,
            stop.warrantyType,
            stop.productType,
            stop.statusComment,
        ];
        const partColumns = stop.parts.flatMap(p => [p.code, p.quantity.toString()]);
        return [...baseColumns, ...partColumns].join('\t');
    });
    return [header, ...lines].join('\n');
}

function RouteFormDialog({ 
    mode, 
    isOpen, 
    onOpenChange, 
    onRouteSaved, 
    initialData 
}: { 
    mode: 'add' | 'edit',
    isOpen: boolean,
    onOpenChange: (open: boolean) => void,
    onRouteSaved: () => void,
    initialData?: Route | null 
}) {
    const { toast } = useToast();
    const [routeName, setRouteName] = useState("");
    const [routeText, setRouteText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [departureDate, setDepartureDate] = useState<Date | undefined>();
    const [arrivalDate, setArrivalDate] = useState<Date | undefined>();
    const [routeType, setRouteType] = useState<'capital' | 'interior' | undefined>();
    const [licensePlate, setLicensePlate] = useState("");

    useEffect(() => {
        if (mode === 'edit' && initialData) {
            setRouteName(initialData.name);
            setDepartureDate(initialData.departureDate instanceof Timestamp ? initialData.departureDate.toDate() : initialData.departureDate);
            setArrivalDate(initialData.arrivalDate instanceof Timestamp ? initialData.arrivalDate.toDate() : initialData.arrivalDate);
            setRouteType(initialData.routeType);
            setRouteText(reconstructRouteText(initialData.stops));
            setLicensePlate(initialData.licensePlate || "");
        } else {
            setRouteName("");
            setRouteText("");
            setDepartureDate(undefined);
            setArrivalDate(undefined);
            setRouteType(undefined);
            setLicensePlate("");
        }
    }, [initialData, mode, isOpen]);


    const parsedStops = useMemo(() => parseRouteText(routeText), [routeText]);

    const handleSave = async () => {
        if (!routeName || parsedStops.length === 0 || !departureDate || !arrivalDate || !routeType) {
            toast({
                variant: "destructive",
                title: "Dados Incompletos",
                description: "Todos os campos da rota (nome, datas, tipo e dados) são obrigatórios."
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const dataToSave = {
                name: routeName,
                stops: parsedStops,
                departureDate: Timestamp.fromDate(departureDate),
                arrivalDate: Timestamp.fromDate(arrivalDate),
                routeType: routeType,
                licensePlate: licensePlate,
            };

            if (mode === 'add') {
                await addDoc(collection(db, "routes"), {
                    ...dataToSave,
                    createdAt: Timestamp.now(),
                    isActive: true,
                });
                toast({ title: "Rota salva com sucesso!" });
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
                        Preencha o nome da rota e cole os dados da sua planilha.
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
                                onChange={(e) => setRouteText(e.target.value)}
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
                                        <TableHead>Consumidor</TableHead>
                                        <TableHead>Modelo</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedStops.length > 0 ? parsedStops.map((stop, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                                            <TableCell>{stop.consumerName}</TableCell>
                                            <TableCell>{stop.model}</TableCell>
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
                    <Button onClick={handleSave} disabled={!routeName || parsedStops.length === 0 || isSubmitting}>
                        <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Rota"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RouteDetailsRow({ stop, index, serviceOrders, routeCreatedAt }: { stop: RouteStop, index: number, serviceOrders: ServiceOrder[], routeCreatedAt: Timestamp | Date }) {
    const isCompleted = serviceOrders.some(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, routeCreatedAt)
    );

    return (
        <React.Fragment key={index}>
            <CollapsibleTrigger asChild>
                <TableRow className={cn("cursor-pointer", isCompleted && "bg-green-100 dark:bg-green-900/50 line-through")}>
                    <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                    <TableCell className="font-mono">{stop.ascJobNumber}</TableCell>
                    <TableCell>{stop.city}</TableCell>
                    <TableCell>{stop.neighborhood}</TableCell>
                    <TableCell>{stop.model}</TableCell>
                    <TableCell>{stop.ts}</TableCell>
                    <TableCell>{stop.warrantyType}</TableCell>
                    <TableCell>
                            {stop.parts && stop.parts.length > 0 ? (
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
            const [routesSnapshot, ordersSnapshot] = await Promise.all([
                getDocs(collection(db, "routes")),
                getDocs(collection(db, "serviceOrders"))
            ]);

            const routesData = routesSnapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                         ...data, 
                         id: doc.id,
                         departureDate: (data.departureDate as Timestamp)?.toDate(),
                         arrivalDate: (data.arrivalDate as Timestamp)?.toDate(),
                         createdAt: (data.createdAt as Timestamp)
                    } as Route
                })
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setAllRoutes(routesData);

            const ordersData = ordersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, date: (doc.data().date as Timestamp).toDate() } as ServiceOrder));
            setServiceOrders(ordersData);

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

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
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
                           <Table>
                               <TableHeader>
                                   <TableRow>
                                       <TableHead>Nome da Rota</TableHead>
                                       <TableHead>Data de Criação</TableHead>
                                       <TableHead>Paradas</TableHead>
                                       <TableHead>Status</TableHead>
                                       <TableHead className="text-right">Ações</TableHead>
                                   </TableRow>
                               </TableHeader>
                               <TableBody>
                                   {filteredRoutes.map(route => (
                                       <TableRow key={route.id} className={!route.isActive ? "text-muted-foreground" : ""}>
                                           <TableCell className="font-medium">{route.name}</TableCell>
                                           <TableCell>{route.createdAt ? (route.createdAt as Timestamp).toDate().toLocaleDateString('pt-BR') : 'N/A'}</TableCell>
                                           <TableCell>{route.stops.length}</TableCell>
                                           <TableCell>
                                                <Badge variant={route.isActive ? "default" : "secondary"}>
                                                    {route.isActive ? "Ativa" : "Finalizada"}
                                                </Badge>
                                           </TableCell>
                                           <TableCell className="text-right space-x-2">
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
                                           </TableCell>
                                       </TableRow>
                                   ))}
                               </TableBody>
                           </Table>
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
            />

            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent className="max-w-6xl">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Rota: {selectedRoute?.name}</DialogTitle>
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
                                        <RouteDetailsRow stop={stop} index={index} serviceOrders={serviceOrders} routeCreatedAt={selectedRoute.createdAt} />
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

    
