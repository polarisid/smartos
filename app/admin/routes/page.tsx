
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
import { PlusCircle, Save, Trash2, Eye, CheckCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, doc, deleteDoc, Timestamp, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { type Route, type RouteStop } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

function parseRouteText(text: string): RouteStop[] {
    if (!text.trim()) return [];

    const lines = text.trim().split('\n');
    const headerLine = lines.shift()?.trim();
    if (!headerLine) return [];

    const partStartIndex = 15;

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
            serviceOrder: columns[0]?.trim() || '',
            ascJobNumber: columns[1]?.trim() || '',
            consumerName: columns[2]?.trim() || '',
            city: columns[3]?.trim() || '',
            neighborhood: columns[4]?.trim() || '',
            state: columns[5]?.trim() || '',
            model: columns[6]?.trim() || '',
            turn: columns[7]?.trim() || '',
            tat: columns[8]?.trim() || '',
            requestDate: columns[9]?.trim() || '',
            firstVisitDate: columns[10]?.trim() || '',
            ts: columns[11]?.trim() || '',
            warrantyType: columns[12]?.trim() || '',
            productType: columns[13]?.trim() || '',
            statusComment: columns[14]?.trim() || '',
            parts: parts,
        };
    }).filter(stop => stop.serviceOrder);
}


function AddRouteDialog({ onRouteAdded }: { onRouteAdded: () => void }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [routeName, setRouteName] = useState("");
    const [routeText, setRouteText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const parsedStops = useMemo(() => parseRouteText(routeText), [routeText]);

    const handleSave = async () => {
        if (!routeName || parsedStops.length === 0) {
            toast({
                variant: "destructive",
                title: "Dados Incompletos",
                description: "O nome da rota e os dados da rota são obrigatórios."
            });
            return;
        }
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "routes"), {
                name: routeName,
                stops: parsedStops,
                createdAt: Timestamp.now(),
                isActive: true,
            });
            toast({ title: "Rota salva com sucesso!" });
            setIsOpen(false);
            setRouteName("");
            setRouteText("");
            onRouteAdded();
        } catch (error) {
            console.error("Error saving route: ", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: "Não foi possível salvar a rota." });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Rota
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Adicionar Nova Rota</DialogTitle>
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
                                Cabeçalho esperado: <code className="font-mono text-xs">SO Nro. | ASC Job No. | ...</code>
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
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={!routeName || parsedStops.length === 0 || isSubmitting}>
                        <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Rota"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function RoutesPage() {
    const { toast } = useToast();
    const [allRoutes, setAllRoutes] = useState<Route[]>([]);
    const [filteredRoutes, setFilteredRoutes] = useState<Route[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true);

    const fetchRoutes = async () => {
        setIsLoading(true);
        try {
            const querySnapshot = await getDocs(collection(db, "routes"));
            const routesData = querySnapshot.docs
                .map(doc => ({ ...doc.data(), id: doc.id } as Route))
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
            setAllRoutes(routesData);
        } catch (error) {
            console.error("Error fetching routes: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as rotas." });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRoutes();
    }, []);

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

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Gerenciar Rotas</h1>
                    <AddRouteDialog onRouteAdded={fetchRoutes} />
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
                                           <TableCell>{route.createdAt ? route.createdAt.toDate().toLocaleDateString('pt-BR') : 'N/A'}</TableCell>
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
                                    <TableHead>Consumidor</TableHead>
                                    <TableHead>Cidade</TableHead>
                                    <TableHead>Modelo</TableHead>
                                    <TableHead>TS</TableHead>
                                    <TableHead>OW/LP</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Peças</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {selectedRoute?.stops.map((stop, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-mono">{stop.serviceOrder}</TableCell>
                                        <TableCell className="font-mono">{stop.ascJobNumber}</TableCell>
                                        <TableCell>{stop.consumerName}</TableCell>
                                        <TableCell>{stop.city}</TableCell>
                                        <TableCell>{stop.model}</TableCell>
                                        <TableCell>{stop.ts}</TableCell>
                                        <TableCell>{stop.warrantyType}</TableCell>
                                        <TableCell>{stop.statusComment}</TableCell>
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
                                    </TableRow>
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
