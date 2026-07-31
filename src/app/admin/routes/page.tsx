

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
import { PlusCircle, Save, Trash2, Eye, CheckCircle, ChevronDown, Calendar as CalendarIcon, Edit, Users, Truck, Package, PackageOpen, Copy, ArrowUp, ArrowDown, FileDown, Loader2, ArrowRightLeft, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { routeService } from "@/services/supabase/routeService";
import { driverService } from "@/services/supabase/driverService";
import { useToast } from "@/hooks/use-toast";
import { useTechnicians, useServiceOrders } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { type Route, type RouteStop, type ServiceOrder, type Technician, type RoutePart, type Driver } from "@/lib/data";
import { validateCepWithCityState } from "@/lib/geocode";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, isAfter, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import React from "react";
import { Progress } from "@/components/ui/progress";
import { triggerWebhook } from "@/lib/webhook";
import * as XLSX from 'xlsx';
import dynamic from "next/dynamic";
import { Clock, Map as MapIcon, List, History } from "lucide-react";

const DynamicalRouteMap = dynamic(() => import('@/components/RouteMap'), { ssr: false });


function parseRouteText(text: string): RouteStop[] {
    if (!text.trim()) return [];

    const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
    const headerLine = lines.shift()?.trim();
    if (!headerLine) return [];
    
    const hasTabs = headerLine.includes('\t');
    const getColumns = (line: string) => {
        if (hasTabs) {
            return line.split('\t').map(cell => cell.trim().replace(/ {2,}/g, ' '));
        } else {
            return line.replace(/[\s\t]{2,}/g, '\t').split('\t').map(cell => cell.trim());
        }
    };

    const headers = getColumns(headerLine).map(h => h.toLowerCase());
    
    const getIndex = (names: string | string[]) => {
        const nameList = Array.isArray(names) ? names : [names];
        for (const n of nameList) {
            const index = headers.indexOf(n.toLowerCase());
            if (index !== -1) return index;
        }
        for (const n of nameList) {
            const index = headers.findIndex(h => h.includes(n.toLowerCase()));
            if (index !== -1) return index;
        }
        return -1;
    };

    const headerIndices = {
        soNro: getIndex(['so nro.', 'so nro', 'ordem de servico', 'os', 'nro os', 'so']),
        ascJobNo: getIndex(['asc job no.', 'asc job no', 'asc job']),
        consumerName: getIndex(['nome consumidor', 'consumidor', 'cliente', 'nome cliente']),
        city: getIndex(['cidade', 'city']),
        neighborhood: getIndex(['bairro', 'bairro/distrito']),
        state: getIndex(['uf', 'estado', 'st']),
        zipCode: getIndex(['cep', 'codigo postal', 'zip', 'zip code', 'zipcode']),
        model: getIndex(['modelo', 'model']),
        turn: getIndex(['turno', 'turno atendimento', 'turno atend.', 'periodo', 'período', 'horario', 'horário']),
        tat: getIndex(['tat']),
        requestDate: getIndex(['data de solicitação', 'data solicitacao', 'data sol']),
        firstVisitDate: getIndex(['1st visit date', 'primeira visita', 'data visita', 'agendamento']),
        ts: getIndex(['ts']),
        warrantyType: getIndex(['ow/lp', 'garantia', 'tipo garantia']),
        productType: getIndex(['spd', 'produto', 'tipo produto']),
        statusComment: getIndex(['status comment', 'status', 'comentario']),
    };
    
    const partColumns: { codeIndex: number; qtyIndex?: number; descIndex?: number }[] = [];
    headers.forEach((header, index) => {
        const cleanHeader = header.replace(/[^a-z0-9]/g, '');
        const isCodHeader = cleanHeader.startsWith('cod') || cleanHeader.startsWith('codigo');

        if (isCodHeader) {
            const codeIndex = index;
            let qtyIndex: number | undefined = undefined;
            let descIndex: number | undefined = undefined;

            for (let offset = 1; offset <= 3; offset++) {
                const nextHeader = (headers[index + offset] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!nextHeader) break;

                if (nextHeader.startsWith('desc')) {
                    descIndex = index + offset;
                } else if (nextHeader.startsWith('qtd') || nextHeader.startsWith('quant')) {
                    qtyIndex = index + offset;
                }
            }

            partColumns.push({ codeIndex, qtyIndex, descIndex });
        }
    });

    return lines.map(line => {
        const columns = getColumns(line);

        const serviceOrder = headerIndices.soNro !== -1 ? columns[headerIndices.soNro]?.trim() : columns[0]?.trim();
        if (!serviceOrder || serviceOrder.toLowerCase().includes('so nro')) {
            return null;
        }

        const parts: RoutePart[] = [];
        partColumns.forEach(pc => {
            const code = columns[pc.codeIndex]?.trim();
            if (!code) return;

            let quantity = 1;
            if (pc.qtyIndex !== undefined) {
                const quantityStr = columns[pc.qtyIndex]?.trim();
                if (quantityStr) {
                    const parsedQty = parseInt(quantityStr, 10);
                    if (!isNaN(parsedQty) && parsedQty > 0) {
                        quantity = parsedQty;
                    }
                }
            }

            const description = pc.descIndex !== undefined ? (columns[pc.descIndex]?.trim() || '') : '';

            if (!parts.some(p => p.code === code)) {
                parts.push({
                    code: code,
                    description: description,
                    quantity: quantity,
                    trackingCode: ''
                });
            }
        });
        
        return {
            serviceOrder: serviceOrder,
            ascJobNumber: headerIndices.ascJobNo !== -1 ? (columns[headerIndices.ascJobNo]?.trim() || '') : '',
            consumerName: headerIndices.consumerName !== -1 ? (columns[headerIndices.consumerName]?.trim() || '') : '',
            city: headerIndices.city !== -1 ? (columns[headerIndices.city]?.trim() || '') : '',
            neighborhood: headerIndices.neighborhood !== -1 ? (columns[headerIndices.neighborhood]?.trim() || '') : '',
            state: headerIndices.state !== -1 ? (columns[headerIndices.state]?.trim() || '') : '',
            zipCode: headerIndices.zipCode !== -1 ? (columns[headerIndices.zipCode]?.trim() || '') : '',
            model: headerIndices.model !== -1 ? (columns[headerIndices.model]?.trim() || '') : '',
            turn: headerIndices.turn !== -1 ? (columns[headerIndices.turn]?.trim() || '') : '',
            tat: headerIndices.tat !== -1 ? (columns[headerIndices.tat]?.trim() || '') : '',
            requestDate: headerIndices.requestDate !== -1 ? (columns[headerIndices.requestDate]?.trim() || '') : '',
            firstVisitDate: headerIndices.firstVisitDate !== -1 ? (columns[headerIndices.firstVisitDate]?.trim() || '') : '',
            ts: headerIndices.ts !== -1 ? (columns[headerIndices.ts]?.trim() || '') : '',
            warrantyType: headerIndices.warrantyType !== -1 ? (columns[headerIndices.warrantyType]?.trim() || '') : '',
            productType: headerIndices.productType !== -1 ? (columns[headerIndices.productType]?.trim() || '') : '',
            statusComment: headerIndices.statusComment !== -1 ? (columns[headerIndices.statusComment]?.trim() || '') : '',
            parts: parts,
            stopType: 'padrao' as const,
        } as RouteStop;
    }).filter((stop): stop is RouteStop => stop !== null);
}


function reconstructRouteText(stops: RouteStop[]): string {
    if (!stops || stops.length === 0) return "";

    let maxParts = 8;
    stops.forEach(s => {
        if (s.parts && s.parts.length > maxParts) {
            maxParts = s.parts.length;
        }
    });

    const baseHeaders = [
        "SO Nro.", "ASC Job No.", "Nome Consumidor", "Cidade", "Bairro", "UF", "CEP", "Modelo", "TURNO", "TAT",
        "Data de Solicitação", "1st Visit Date", "TS", "OW/LP", "SPD", "Status comment"
    ];

    const partHeaders: string[] = [];
    for (let i = 0; i < maxParts; i++) {
        partHeaders.push("COD", "DESCRICAO", "QTD");
    }

    const header = [...baseHeaders, ...partHeaders].join("\t");

    const lines = stops.map(stop => {
        const baseColumns = [
            stop.serviceOrder || '',
            stop.ascJobNumber || '',
            stop.consumerName || '',
            stop.city || '',
            stop.neighborhood || '',
            stop.state || '',
            stop.zipCode || '',
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

        const partColumns: string[] = [];
        for (let i = 0; i < maxParts; i++) {
            const p = stop.parts?.[i];
            partColumns.push(
                p?.code || '',
                p?.description || '',
                p?.quantity != null ? String(p.quantity) : ''
            );
        }

        return [...baseColumns, ...partColumns].join('\t');
    });

    return [header, ...lines].join('\n');
}


function RouteForm({ 
    mode, 
    isActive, 
    onCancel, 
    onRouteSaved, 
    initialData,
    technicians,
    drivers,
    serviceOrders = []
}: { 
    mode: 'add' | 'edit',
    isActive: boolean,
    onCancel: () => void,
    onRouteSaved: () => void,
    initialData?: Route | null,
    technicians: Technician[],
    drivers: Driver[],
    serviceOrders?: ServiceOrder[]
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
    const [driverId, setDriverId] = useState<string | undefined>("none");
    const [parsedStops, setParsedStops] = useState<RouteStop[]>([]);
    
    const [manualStopData, setManualStopData] = useState({
        serviceOrder: '',
        ascJobNumber: '',
        consumerName: '',
        city: '',
        neighborhood: '',
        model: '',
        ts: '',
        warrantyType: '',
        stopType: 'padrao' as 'padrao' | 'coleta' | 'entrega',
        collectionType: '' as 'reparo' | 'rma' | 'eco' | 'descarte' | '',
        addressDetails: '',
    });
    const [manualPartsText, setManualPartsText] = useState("");

    const routeDataModel = "SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tCEP\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTS\tOW/LP\tSPD\tStatus comment\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD\tCOD\tDESCRICAO\tQTD";

    const handleCopyModel = () => {
        navigator.clipboard.writeText(routeDataModel);
        toast({
            title: "Modelo copiado!",
            description: "O cabeçalho do modelo foi copiado para a área de transferência.",
        });
    };

    useEffect(() => {
        if (isActive) {
            if (mode === 'edit' && initialData) {
                setRouteName(initialData.name);
                setDepartureDate(initialData.departureDate ? new Date(initialData.departureDate) : undefined);
                setArrivalDate(initialData.arrivalDate ? new Date(initialData.arrivalDate) : undefined);
                setRouteType(initialData.routeType);
                setLicensePlate(initialData.licensePlate || "");
                setTechnicianId(initialData.technicianId || "");
                setDriverId(initialData.driverId || "none");
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
                setDriverId("none");
                setParsedStops([]);
            }
        }
    }, [initialData, mode, isActive]);
    
     const handleRouteTextChange = async (text: string) => {
        setRouteText(text);
        const stopsFromText = parseRouteText(text);
        const currentStops = parsedStops;

        const updatedStops = stopsFromText.map(newStop => {
            const existingStop = currentStops.find(cs => cs.serviceOrder === newStop.serviceOrder);
            return {
                ...newStop,
                stopType: existingStop?.stopType || 'padrao',
                addressDetails: existingStop?.addressDetails
            };
        });
        setParsedStops(updatedStops);

        const validatedStops = await Promise.all(updatedStops.map(async (stop) => {
            if (stop.zipCode) {
                const val = await validateCepWithCityState(stop.zipCode, stop.city, stop.state);
                if (val.mismatch) {
                    return {
                        ...stop,
                        zipMismatch: true,
                        zipMismatchDetails: val.details,
                        suggestedCityState: `${val.suggestedCity}-${val.suggestedState}`
                    };
                }
            }
            return stop;
        }));
        setParsedStops(validatedStops);
    };


    const handleStopTypeChange = (index: number, type: 'padrao' | 'coleta' | 'entrega') => {
        setParsedStops(currentStops => {
            const newStops = [...currentStops];
            newStops[index].stopType = type;
            return newStops;
        });
    };

    const handleTurnChange = (index: number, value: string) => {
        setParsedStops(currentStops => {
            const newStops = [...currentStops];
            newStops[index].turn = value;
            return newStops;
        });
    };

    const handleDateChange = (index: number, value: string) => {
        setParsedStops(currentStops => {
            const newStops = [...currentStops];
            newStops[index].firstVisitDate = value;
            return newStops;
        });
    };

    const handleManualStopInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setManualStopData(prev => ({ ...prev, [name]: value }));
    };

    const handleManualStopSelectChange = (value: 'padrao' | 'coleta' | 'entrega') => {
        setManualStopData(prev => ({ ...prev, stopType: value, collectionType: value === 'coleta' ? prev.collectionType : '' }));
    };
    
    const handleAddManualStop = () => {
        const { serviceOrder, consumerName, city, model, stopType, collectionType } = manualStopData;

        if (!serviceOrder.trim() || !consumerName.trim() || !city.trim() || !model.trim()) {
            toast({
                variant: "destructive",
                title: "Campos Obrigatórios",
                description: "OS, Nome do Cliente, Cidade e Modelo são obrigatórios para adicionar uma parada manual."
            });
            return;
        }

        if (stopType === 'coleta' && !collectionType) {
            toast({
                variant: "destructive",
                title: "Campo Obrigatório",
                description: "Selecione o tipo de coleta."
            });
            return;
        }

        if (parsedStops.some(stop => stop.serviceOrder === serviceOrder.trim())) {
            toast({
                variant: "destructive",
                title: "OS Duplicada",
                description: "Esta ordem de serviço já está na rota."
            });
            return;
        }

        const newStop: RouteStop = {
            serviceOrder: manualStopData.serviceOrder.trim(),
            ascJobNumber: manualStopData.ascJobNumber.trim(),
            consumerName: manualStopData.consumerName.trim(),
            city: manualStopData.city.trim(),
            neighborhood: manualStopData.neighborhood.trim(),
            model: manualStopData.model.trim(),
            ts: manualStopData.ts.trim(),
            warrantyType: manualStopData.warrantyType.trim(),
            stopType: manualStopData.stopType,
            state: '',
            zipCode: '',
            turn: '',
            tat: '',
            requestDate: '',
            firstVisitDate: '',
            productType: '',
            statusComment: '',
            parts: [],
            addressDetails: manualStopData.addressDetails.trim() || '',
        };

        if (manualPartsText.trim()) {
            manualPartsText.split(',').forEach(p => {
                const str = p.trim();
                if (!str) return;
                const qtyMatch = str.match(/x(\d+)$/i);
                let qty = 1;
                let code = str;
                if (qtyMatch) {
                    qty = parseInt(qtyMatch[1], 10);
                    code = str.replace(/x\d+$/i, '').trim();
                }
                newStop.parts!.push({ code, quantity: qty, description: "Peça Adicionada Manualmente" });
            });
        }

        if (manualStopData.stopType === 'coleta' && manualStopData.collectionType !== '') {
            newStop.collectionType = manualStopData.collectionType as 'reparo' | 'rma' | 'eco' | 'descarte';
        }

        setParsedStops(currentStops => [...currentStops, newStop]);
        setManualStopData({
            serviceOrder: '', ascJobNumber: '', consumerName: '', city: '',
            neighborhood: '', model: '', ts: '', warrantyType: '', stopType: 'padrao',
            collectionType: '', addressDetails: ''
        });
        setManualPartsText("");
        toast({ title: "Parada adicionada!", description: `A OS ${serviceOrder} foi adicionada à pré-visualização.` });
    };

    const handleMoveStop = (index: number, direction: 'up' | 'down') => {
        setParsedStops(currentStops => {
            const newStops = [...currentStops];
            if (direction === 'up' && index > 0) {
                [newStops[index - 1], newStops[index]] = [newStops[index], newStops[index - 1]];
            } else if (direction === 'down' && index < newStops.length - 1) {
                [newStops[index + 1], newStops[index]] = [newStops[index], newStops[index + 1]];
            }
            return newStops;
        });
    };

    const handleRemoveStop = (index: number) => {
        setParsedStops(currentStops => currentStops.filter((_, i) => i !== index));
    };

    // --- Reallocate stop ---
    const [isReallocateOpen, setIsReallocateOpen] = useState(false);
    const [stopToReallocate, setStopToReallocate] = useState<{ stop: RouteStop; index: number } | null>(null);
    const [availableRoutes, setAvailableRoutes] = useState<Route[]>([]);
    const [targetRouteId, setTargetRouteId] = useState<string>("");
    const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
    const [isReallocating, setIsReallocating] = useState(false);

    const handleOpenReallocate = async (stop: RouteStop, index: number) => {
        setStopToReallocate({ stop, index });
        setTargetRouteId("");
        setIsReallocateOpen(true);
        setIsLoadingRoutes(true);
        try {
            // Load active routes excluding current one
            const routes = await routeService.getActiveRoutes();
            setAvailableRoutes(routes.filter(r => r.id !== initialData?.id));
        } catch (e) {
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as rotas disponíveis." });
        } finally {
            setIsLoadingRoutes(false);
        }
    };

    const handleConfirmReallocate = async () => {
        if (!stopToReallocate || !targetRouteId || !initialData) return;
        setIsReallocating(true);
        try {
            const targetRoute = availableRoutes.find(r => r.id === targetRouteId);
            if (!targetRoute) throw new Error("Rota destino não encontrada.");

            // The stop carries ALL its data: parts, tracking codes, etc.
            const stopToMove = stopToReallocate.stop;

            // Check for duplicate in target route
            if ((targetRoute.stops || []).some(s => s.serviceOrder === stopToMove.serviceOrder)) {
                toast({ variant: "destructive", title: "OS Duplicada", description: `A OS ${stopToMove.serviceOrder} já existe na rota destino.` });
                return;
            }

            // Mark as reallocated on original route
            const newCurrentStops = parsedStops.map((stop, i) => {
                if (i === stopToReallocate.index) {
                    return {
                        ...stop,
                        isReallocated: true,
                        reallocatedToRouteName: targetRoute.name
                    };
                }
                return stop;
            });

            // Prepare a clean copy of the stop for the new route
            const stopToMoveClean = {
                ...stopToMove,
                isReallocated: false,
                reallocatedToRouteName: undefined
            };
            const newTargetStops = [...(targetRoute.stops || []), stopToMoveClean];
            
            const updates = [
                { id: initialData.id, data: { stops: newCurrentStops } },
                { id: targetRouteId, data: { stops: newTargetStops } }
            ];
            await routeService.updateBatch(updates);

            // Update local state
            setParsedStops(newCurrentStops);
            setIsReallocateOpen(false);
            setStopToReallocate(null);

            toast({
                title: "Atendimento realocado!",
                description: `OS ${stopToMove.serviceOrder} movida para "${targetRoute.name}" com todas as peças e rastreios preservados.`
            });
        } catch (e: any) {
            toast({ variant: "destructive", title: "Erro ao Realocar", description: e.message || "Não foi possível realocar o atendimento." });
        } finally {
            setIsReallocating(false);
        }
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
            const driver = drivers.find(d => d.id === driverId);
            
            // Helper to remove any undefined fields (Firestore rejects them)
            const sanitizeStop = (stop: RouteStop): Record<string, unknown> => {
                const s: Record<string, unknown> = {};
                Object.entries(stop).forEach(([k, v]) => {
                    if (v !== undefined) s[k] = v;
                });
                // Ensure nested parts array is also clean
                if (Array.isArray(stop.parts)) {
                    s['parts'] = stop.parts.map(p => {
                        const clean: Record<string, unknown> = {};
                        Object.entries(p).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
                        return clean;
                    });
                }
                return s;
            };

            let stopsToSave: RouteStop[] = parsedStops;

            if (mode === 'edit' && initialData) {
                  stopsToSave = parsedStops.map(newStop => {
                     const existingStop = initialData.stops.find(s => s.serviceOrder === newStop.serviceOrder);
                     if (existingStop) {
                         const newParts = (newStop.parts || []).map(newPart => {
                              const existingPart = (existingStop.parts || []).find(p => p.code === newPart.code);
                              if (existingPart) {
                                  // Mantenha todas as propriedades da peça (status de uso, tracking, etc)
                                  return { 
                                      ...existingPart, 
                                      ...newPart, 
                                      trackingCode: newPart.trackingCode ? newPart.trackingCode : (existingPart.trackingCode || ''),
                                      description: newPart.description ? newPart.description : (existingPart.description || '')
                                  };
                              }
                              return newPart;
                         });
                         return { 
                             ...existingStop, 
                             ...newStop, 
                             // Restaurar statusComment se a planilha vier em branco e apagar o comentário do técnico
                             statusComment: newStop.statusComment ? newStop.statusComment : (existingStop.statusComment || ''),
                             parts: newParts 
                         };
                     }
                     return newStop;
                  });
             }


            const dataToSave = {
                name: routeName,
                stops: stopsToSave.map(sanitizeStop),
                departureDate: departureDate.toISOString(),
                arrivalDate: arrivalDate.toISOString(),
                routeType: routeType,
                licensePlate: licensePlate || '',
                technicianId: technicianId,
                technicianName: technician?.name || '',
                driverId: driverId || 'none',
                driverName: driver?.name || '',
                driverPhone: driver?.phone || '',
            };

            if (mode === 'add') {
                const newRouteData = {
                    ...dataToSave,
                    createdAt: new Date().toISOString(),
                    isActive: true,
                };
                await routeService.create(newRouteData as unknown as Omit<Route, 'id'>);
                toast({ title: "Rota salva com sucesso!" });

                await triggerWebhook({
                    event: 'new_route',
                    technicianName: technician?.name,
                    technicianPhone: technician?.phone,
                    driverName: driver?.name,
                    driverPhone: driver?.phone,
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
                await routeService.update(initialData.id, dataToSave as unknown as Partial<Route>);
                toast({ title: "Rota atualizada com sucesso!" });
            }
            
            onCancel();
            onRouteSaved();
        } catch (error) {
            console.error("Error saving route: ", error);
            toast({ variant: "destructive", title: "Erro ao Salvar", description: `Não foi possível ${mode === 'add' ? 'salvar' : 'atualizar'} a rota.` });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>{mode === 'add' ? 'Adicionar Nova Rota' : 'Editar Rota'}</CardTitle>
                <CardDescription>
                    Preencha o nome da rota, atribua a um técnico e cole os dados da sua planilha.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid xl:grid-cols-2 gap-6 py-4">
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

                        <div className="space-y-2">
                            <Label htmlFor="driverId">Motorista (Opcional)</Label>
                            <Select value={driverId} onValueChange={setDriverId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um motorista" />
                                </SelectTrigger>
                                <SelectContent>
                                     <SelectItem value="none">Nenhum</SelectItem>
                                    {drivers.map(driver => (
                                        <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
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
                            <div className="flex justify-between items-center">
                                <Label htmlFor="route-text">Colar Dados da Rota</Label>
                                <Button type="button" variant="link" className="p-0 h-auto" onClick={handleCopyModel}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copiar Modelo
                                </Button>
                            </div>
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
                        <div className="border rounded-lg overflow-x-auto w-full">
                            <Table className="min-w-[850px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>OS</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Peças</TableHead>
                                        <TableHead>Agendamento</TableHead>
                                        <TableHead>Turno</TableHead>
                                        <TableHead>Confirmação</TableHead>
                                        <TableHead className="w-[60px] text-center">Local</TableHead>
                                        <TableHead className="w-[150px] text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {parsedStops.length > 0 ? parsedStops.map((stop, index) => {
                                        const isAlreadyVisited = serviceOrders.some(os => os.serviceOrderNumber === stop.serviceOrder);

                                        return (
                                            <TableRow key={stop.serviceOrder} className={cn(stop.isReallocated && "line-through text-muted-foreground bg-slate-50 dark:bg-slate-900/10 opacity-60")}>
                                                <TableCell className="font-mono">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span>{stop.serviceOrder}</span>
                                                        {isAlreadyVisited && (
                                                            <Badge variant="secondary" className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-100 hover:text-violet-700 text-[10px] px-1.5 py-0 flex items-center gap-0.5">
                                                                <History className="w-3 h-3" /> Já Visitada
                                                            </Badge>
                                                        )}
                                                        {stop.isReallocated && (
                                                            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 text-[10px] px-1.5 py-0">
                                                                Realocado para: {stop.reallocatedToRouteName}
                                                            </Badge>
                                                        )}
                                                        {stop.zipMismatch && (
                                                            <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50 dark:bg-red-950 dark:text-red-300 text-[10px] px-1.5 py-0 flex items-center gap-1" title={stop.zipMismatchDetails}>
                                                                ⚠️ CEP ({stop.zipCode}) de {stop.suggestedCityState} — Posicionado em {stop.city}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            <TableCell>
                                                <Select value={stop.stopType || 'padrao'} onValueChange={(v) => handleStopTypeChange(index, v as any)} disabled={stop.isReallocated}>
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
                                            <TableCell>
                                                <Input 
                                                    className="h-8 text-xs w-[110px]" 
                                                    value={stop.firstVisitDate || stop.requestDate || ''} 
                                                    onChange={(e) => handleDateChange(index, e.target.value)} 
                                                    placeholder="dd/mm/aaaa"
                                                    disabled={stop.isReallocated}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                     <div className="flex items-center gap-0.5">
                                                         {['M', 'T', 'C'].map(turnPill => (
                                                             <button
                                                                 key={turnPill}
                                                                 type="button"
                                                                 disabled={stop.isReallocated}
                                                                 onClick={() => handleTurnChange(index, turnPill)}
                                                                 className={cn(
                                                                     "px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all",
                                                                     stop.turn === turnPill
                                                                         ? "bg-violet-600 text-white border-violet-600 shadow-xs"
                                                                         : "bg-muted/40 hover:bg-muted text-muted-foreground border-border/40"
                                                                 )}
                                                             >
                                                                 {turnPill}
                                                             </button>
                                                         ))}
                                                     </div>
                                                     <Input 
                                                         className="h-8 text-xs w-[75px]" 
                                                         value={stop.turn || ''} 
                                                         onChange={(e) => handleTurnChange(index, e.target.value)} 
                                                         placeholder="Outro"
                                                         disabled={stop.isReallocated}
                                                     />
                                                 </div>
                                            </TableCell>
                                            <TableCell>
                                                 <div className="flex items-center gap-1">
                                                     <Button
                                                         type="button"
                                                         variant="ghost"
                                                         size="sm"
                                                         disabled={stop.isReallocated}
                                                         onClick={() => {
                                                             setParsedStops(currentStops => {
                                                                 const newStops = [...currentStops];
                                                                 newStops[index].confirmedByCall = !newStops[index].confirmedByCall;
                                                                 return newStops;
                                                             });
                                                         }}
                                                         className={cn(
                                                             "h-7 px-2 text-[10px] font-bold border transition-all gap-1",
                                                             stop.confirmedByCall
                                                                 ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:text-white"
                                                                 : "bg-muted/30 text-slate-600 dark:text-slate-400 hover:bg-muted border-border/40"
                                                         )}
                                                         title="Confirmação por Ligação Telefônica"
                                                     >
                                                         ☎️ {stop.confirmedByCall ? "✓" : "Ligação"}
                                                     </Button>
                                                     <Button
                                                         type="button"
                                                         variant="ghost"
                                                         size="sm"
                                                         disabled={stop.isReallocated}
                                                         onClick={() => {
                                                             setParsedStops(currentStops => {
                                                                 const newStops = [...currentStops];
                                                                 newStops[index].confirmedByMessage = !newStops[index].confirmedByMessage;
                                                                 return newStops;
                                                             });
                                                         }}
                                                         className={cn(
                                                             "h-7 px-2 text-[10px] font-bold border transition-all gap-1",
                                                             stop.confirmedByMessage
                                                                 ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white"
                                                                 : "bg-muted/30 text-slate-600 dark:text-slate-400 hover:bg-muted border-border/40"
                                                         )}
                                                         title="Confirmação por Mensagem / WhatsApp"
                                                     >
                                                         💬 {stop.confirmedByMessage ? "✓" : "Mensagem"}
                                                     </Button>
                                                 </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button variant="ghost" size="icon" className={cn("h-8 w-8", stop.addressDetails ? "text-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "text-muted-foreground")} title="Editar Detalhes do Endereço" disabled={stop.isReallocated}>
                                                            <MapPin className="h-4 w-4" />
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80">
                                                        <div className="space-y-2">
                                                            <h4 className="font-medium leading-none">Endereço Detalhado</h4>
                                                            <p className="text-xs text-muted-foreground">
                                                                Preencha para ter mais exatidão no Mapa.
                                                            </p>
                                                            <Textarea 
                                                                placeholder="Rua Exata, Nº, Bloco, Apto, Condomínio, Referência..."
                                                                value={stop.addressDetails || ''}
                                                                onChange={(e) => {
                                                                    setParsedStops(currentStops => {
                                                                        const newStops = [...currentStops];
                                                                        newStops[index].addressDetails = e.target.value;
                                                                        return newStops;
                                                                    });
                                                                }}
                                                                className="h-24 text-sm"
                                                            />
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </TableCell>
                                             <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMoveStop(index, 'up')} disabled={index === 0 || stop.isReallocated}>
                                                        <ArrowUp className="h-4 w-4" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMoveStop(index, 'down')} disabled={index === parsedStops.length - 1 || stop.isReallocated}>
                                                        <ArrowDown className="h-4 w-4" />
                                                    </Button>
                                                    {mode === 'edit' && (
                                                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Realocar para outra rota" onClick={() => handleOpenReallocate(stop, index)} disabled={stop.isReallocated}>
                                                            <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                                                        </Button>
                                                    )}
                                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveStop(index)} disabled={stop.isReallocated}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        );
                                    }) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="h-24 text-center">
                                                A pré-visualização aparecerá aqui.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="space-y-4 border-t pt-4 mt-4 bg-muted/50 p-4 rounded-lg">
                            <Label className="font-semibold">Adicionar Parada Manualmente</Label>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-serviceOrder" className="text-xs">Nº da OS *</Label>
                                    <Input id="manual-serviceOrder" name="serviceOrder" value={manualStopData.serviceOrder} onChange={handleManualStopInputChange} placeholder="Obrigatório"/>
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-ascJobNumber" className="text-xs">ASC Job No.</Label>
                                    <Input id="manual-ascJobNumber" name="ascJobNumber" value={manualStopData.ascJobNumber} onChange={handleManualStopInputChange} />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label htmlFor="manual-consumerName" className="text-xs">Nome Cliente *</Label>
                                    <Input id="manual-consumerName" name="consumerName" value={manualStopData.consumerName} onChange={handleManualStopInputChange} placeholder="Obrigatório" />
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-city" className="text-xs">Cidade *</Label>
                                    <Input id="manual-city" name="city" value={manualStopData.city} onChange={handleManualStopInputChange} placeholder="Obrigatório"/>
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-neighborhood" className="text-xs">Bairro</Label>
                                    <Input id="manual-neighborhood" name="neighborhood" value={manualStopData.neighborhood} onChange={handleManualStopInputChange} />
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-model" className="text-xs">Modelo *</Label>
                                    <Input id="manual-model" name="model" value={manualStopData.model} onChange={handleManualStopInputChange} placeholder="Obrigatório"/>
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-ts" className="text-xs">TS</Label>
                                    <Input id="manual-ts" name="ts" value={manualStopData.ts} onChange={handleManualStopInputChange} />
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-warrantyType" className="text-xs">OW/LP</Label>
                                    <Input id="manual-warrantyType" name="warrantyType" value={manualStopData.warrantyType} onChange={handleManualStopInputChange} />
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                    <Label htmlFor="manual-stopType" className="text-xs">Tipo *</Label>
                                    <Select value={manualStopData.stopType} onValueChange={handleManualStopSelectChange}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="padrao">Padrão</SelectItem>
                                            <SelectItem value="coleta">Coleta</SelectItem>
                                            <SelectItem value="entrega">Entrega</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {manualStopData.stopType === 'coleta' && (
                                    <div className="space-y-1 col-span-2 sm:col-span-1">
                                        <Label htmlFor="manual-collectionType" className="text-xs">Tipo de Coleta *</Label>
                                        <Select 
                                            value={manualStopData.collectionType} 
                                            onValueChange={(v) => setManualStopData(prev => ({ ...prev, collectionType: v as any}))}
                                        >
                                            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="reparo">Reparo</SelectItem>
                                                <SelectItem value="rma">RMA</SelectItem>
                                                <SelectItem value="eco">Eco</SelectItem>
                                                <SelectItem value="descarte">Descarte</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <div className="space-y-1 col-span-2">
                                    <Label htmlFor="manual-addressDetails" className="text-xs">Endereço Detalhado (Opcional)</Label>
                                    <Input id="manual-addressDetails" name="addressDetails" value={manualStopData.addressDetails} onChange={handleManualStopInputChange} placeholder="Rua, Nº, Apto, Condomínio, Referência..." />
                                </div>
                            </div>
                            <Button type="button" onClick={handleAddManualStop} className="w-full">Adicionar Parada à Rota</Button>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
                <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button onClick={handleSave} disabled={isSubmitting}>
                    <Save className="mr-2 h-4 w-4" /> {isSubmitting ? "Salvando..." : "Salvar Rota"}
                </Button>
            </CardFooter>
        </Card>

        {/* Reallocate Stop Dialog */}
        <Dialog open={isReallocateOpen} onOpenChange={(open) => { if (!isReallocating) setIsReallocateOpen(open); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="h-5 w-5 text-blue-500" />
                        Realocar Atendimento
                    </DialogTitle>
                    <DialogDescription>
                        Mova a OS <span className="font-mono font-bold">{stopToReallocate?.stop.serviceOrder}</span> para outra rota ativa.
                        Todas as peças e rastreios serão preservados.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {stopToReallocate && (
                        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                            <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{stopToReallocate?.stop.consumerName}</span></p>
                            <p><span className="text-muted-foreground">Cidade:</span> <span className="font-medium">{stopToReallocate?.stop.city}</span></p>
                            <p><span className="text-muted-foreground">Modelo:</span> <span className="font-medium">{stopToReallocate?.stop.model}</span></p>
                            {(stopToReallocate?.stop.parts?.length ?? 0) > 0 && (
                                <p><span className="text-muted-foreground">Peças:</span> <span className="font-mono text-xs">{stopToReallocate?.stop.parts?.map(p => `${p.code} x${p.quantity}`).join(', ')}</span></p>
                            )}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label>Rota de Destino</Label>
                        {isLoadingRoutes ? (
                            <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" /> Carregando rotas...
                            </div>
                        ) : availableRoutes.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhuma outra rota ativa disponível.</p>
                        ) : (
                            <Select value={targetRouteId} onValueChange={setTargetRouteId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione a rota destino" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableRoutes.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{r.name}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {r.technicianName || 'Técnico não definido'} · {r.stops?.length || 0} paradas
                                                    {r.departureDate instanceof Date
                                                        ? ` · ${format(r.departureDate, "dd/MM", { locale: ptBR })}`
                                                        : ''}
                                                </span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsReallocateOpen(false)} disabled={isReallocating}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirmReallocate}
                        disabled={!targetRouteId || isReallocating || isLoadingRoutes}
                        className="gap-2"
                    >
                        {isReallocating
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Realocando...</>
                            : <><ArrowRightLeft className="h-4 w-4" /> Confirmar Realocação</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}

function RouteDetailsRow({ stop, index, serviceOrders, routeCreatedAt }: { stop: RouteStop, index: number, serviceOrders: ServiceOrder[], routeCreatedAt: string | Date }) {
    const createdAtDate = new Date(routeCreatedAt);
    const relatedOsList = serviceOrders.filter(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, createdAtDate)
    );
    const relatedOs = relatedOsList.length > 0 ? relatedOsList[relatedOsList.length - 1] : null;

    const isPending = relatedOs && (relatedOs.isFinalized === false);
    const isCompleted = relatedOs && (relatedOs.isFinalized !== false);

    const getRowClass = () => {
        if (stop.isReallocated) return "bg-slate-100 dark:bg-slate-900/50 line-through text-slate-400 dark:text-slate-500 opacity-60";
        if (isPending) return "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100";
        if (isCompleted) return "bg-green-100 dark:bg-green-900/50 line-through text-slate-500 opacity-60";
        switch (stop.stopType) {
            case 'coleta': return 'bg-yellow-100 dark:bg-yellow-900/50';
            case 'entrega': return 'bg-blue-100 dark:bg-blue-900/50';
            default: return '';
        }
    };

    const stopTypeLabels = {
        padrao: 'Padrão',
        coleta: 'Coleta',
        entrega: 'Entrega'
    };

    const collectionTypeLabels = {
        reparo: 'Reparo',
        rma: 'RMA',
        eco: 'Eco',
        descarte: 'Descarte'
    } as const;

    const getStopTypeDisplay = () => {
        const base = stopTypeLabels[stop.stopType || 'padrao'];
        if (stop.stopType === 'coleta' && stop.collectionType) {
            const collectionLabel = collectionTypeLabels[stop.collectionType];
            return `${base} (${collectionLabel})`;
        }
        return base;
    };


    return (
        <React.Fragment>
            <CollapsibleTrigger asChild>
                <TableRow className={cn("cursor-pointer", getRowClass())}>
                    <TableCell className="font-mono">
                        <span className="flex items-center gap-1.5">
                            {stop.serviceOrder}
                            {stop.isReallocated && (
                                <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 text-[9px] px-1.5 py-0 flex items-center">
                                    Realocado
                                </Badge>
                            )}
                        </span>
                    </TableCell>
                    <TableCell className="font-mono">{stop.ascJobNumber}</TableCell>
                    <TableCell>{getStopTypeDisplay()}</TableCell>
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
                    <TableCell colSpan={10} className="p-2">
                            <div className="p-2 bg-background/50 rounded space-y-2">
                            {stop.isReallocated && (
                                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-2">
                                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                                        ⚠️ Este atendimento foi realocado para a rota: <span className="font-bold">{stop.reallocatedToRouteName}</span>
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="font-semibold text-xs mb-1">Nome Consumidor:</p>
                                <p className="text-sm text-foreground">{stop.consumerName || "N/A"}</p>
                            </div>
                            {isPending && (
                                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 space-y-1">
                                    <p className="font-semibold text-xs text-red-700 dark:text-red-400 mb-1">Registro do Técnico (Pendência):</p>
                                    {relatedOs?.pendingReason && (
                                        <p className="text-sm text-red-800 dark:text-red-300">
                                            <span className="font-bold">Motivo: </span>{relatedOs.pendingReason}
                                        </p>
                                    )}
                                    {relatedOs?.observations && (
                                        <p className="text-sm text-red-800 dark:text-red-300">
                                            <span className="font-bold">Observações: </span>{relatedOs.observations}
                                        </p>
                                    )}
                                    {!relatedOs?.pendingReason && !relatedOs?.observations && (
                                        <p className="text-sm text-muted-foreground">Nenhuma observação registrada.</p>
                                    )}
                                </div>
                            )}
                            {stop.statusComment && (
                                <div>
                                    <p className="font-semibold text-xs mb-1">Status ASC:</p>
                                    <p className="text-sm text-foreground">{stop.statusComment}</p>
                                </div>
                            )}
                            {(() => {
                                const addressQuery = stop.addressDetails
                                    ? encodeURIComponent(`${stop.addressDetails}, ${stop.neighborhood}, ${stop.city}`)
                                    : encodeURIComponent(`${stop.neighborhood ? stop.neighborhood + ', ' : ''}${stop.city}`);

                                return (
                                    <div className="pt-2">
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 hover:text-blue-700"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`https://www.google.com/maps/search/?api=1&query=${addressQuery}`, '_blank');
                                            }}
                                        >
                                            <MapPin className="mr-2 h-4 w-4" />
                                            Visualizar no Mapa
                                        </Button>
                                    </div>
                                );
                            })()}
                        </div>
                    </TableCell>
                </tr>
            </CollapsibleContent>
        </React.Fragment>
    )
}

export default function RoutesPage() {
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { data: technicians = [], isLoading: loadingTech } = useTechnicians();
    const { data: serviceOrders = [], isLoading: loadingSo } = useServiceOrders(2000);
    const contextLoading = loadingTech || loadingSo;
    const refreshDynamicData = () => queryClient.invalidateQueries();

    // --- Active routes (always fully loaded) ---
    const [activeRoutes, setActiveRoutes] = useState<Route[]>([]);
    // --- Inactive routes (paginated) ---
    const [inactiveRoutes, setInactiveRoutes] = useState<Route[]>([]);
    const [lastInactiveDoc, setLastInactiveDoc] = useState<number | null>(null);
    const [hasMoreInactive, setHasMoreInactive] = useState(false);
    const [isLoadingMoreInactive, setIsLoadingMoreInactive] = useState(false);

    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    const [showOnlyActive, setShowOnlyActive] = useState(true);

    const [activeTab, setActiveTab] = useState('list');
    const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
    const [selectedRouteForEdit, setSelectedRouteForEdit] = useState<Route | null>(null);

    const activeStopsForMap = useMemo(() => {
        if (!selectedRoute) return [];
        const routeCreatedAt = selectedRoute.createdAt instanceof Date 
            ? selectedRoute.createdAt 
            : (selectedRoute.createdAt as any)?.toDate?.() ?? new Date();

        return (selectedRoute.stops || []).map(stop => {
            const relatedOsList = serviceOrders.filter(os =>
                os.serviceOrderNumber === stop.serviceOrder &&
                isAfter(os.date, routeCreatedAt)
            );
            const lastOs = relatedOsList.length > 0 ? relatedOsList[relatedOsList.length - 1] : null;

            let status: 'completed' | 'pending' | 'todo' = 'todo';
            if (lastOs) {
                if (lastOs.isFinalized === false) {
                    status = 'pending';
                } else {
                    status = 'completed';
                }
            }
            return {
                stop,
                route: selectedRoute,
                status
            };
        });
    }, [selectedRoute, serviceOrders]);

    const estimatedRouteTime = useMemo(() => {
        if (!selectedRoute) return "0 min";
        const stopsCount = selectedRoute.stops?.length || 0;
        if (stopsCount === 0) return "0 min";
        
        const isInterior = selectedRoute.routeType?.toLowerCase() === 'interior';
        const travelTime = isInterior ? 50 : 25;
        const serviceTime = 40;
        
        const totalMinutes = stopsCount * (travelTime + serviceTime);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        if (hours === 0) return `${minutes} min`;
        return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
    }, [selectedRoute]);

    const INACTIVE_PAGE_SIZE = 10;

    const toRoute = (d: any, data: any): Route => ({
        ...data,
        id: d.id,
        departureDate: data.departureDate ? new Date(data.departureDate) : undefined,
        arrivalDate: data.arrivalDate ? new Date(data.arrivalDate) : undefined,
        createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    } as Route);

    const fetchRoutes = async () => {
        setIsLoading(true);
        try {
            const cutoff15Days = subDays(new Date(), 15);

            const [activeRoutesList, inactiveData, driversSnap] = await Promise.all([
                // All active routes (no limit – should be small)
                routeService.getActiveRoutes(),
                // Inactive: only last 15 days
                routeService.getInactiveRoutesPaginated(INACTIVE_PAGE_SIZE, cutoff15Days),
                driverService.getAll()
            ]);

            setActiveRoutes(activeRoutesList);

            setInactiveRoutes(inactiveData.routes);
            // If we got a full page, there might be more older ones
            setLastInactiveDoc(inactiveData.lastVisible);
            setHasMoreInactive(inactiveData.routes.length === INACTIVE_PAGE_SIZE);

            setDrivers(driversSnap);
        } catch (error) {
            console.error("Error fetching routes: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar as rotas." });
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoadMoreInactive = async () => {
        if (!lastInactiveDoc || isLoadingMoreInactive) return;
        setIsLoadingMoreInactive(true);
        try {
            const data = await routeService.getInactiveRoutesPaginated(INACTIVE_PAGE_SIZE, undefined, lastInactiveDoc);
            setInactiveRoutes(prev => [...prev, ...data.routes]);
            setLastInactiveDoc(data.lastVisible);
            setHasMoreInactive(data.routes.length === INACTIVE_PAGE_SIZE);
        } catch (error) {
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível carregar mais rotas." });
        } finally {
            setIsLoadingMoreInactive(false);
        }
    };

    useEffect(() => {
        fetchRoutes();
    }, [toast]);

    // Derived display list
    const filteredRoutes = showOnlyActive ? activeRoutes : [...activeRoutes, ...inactiveRoutes];


    const handleCancelRoute = async () => {
        if (!selectedRoute) return;
        try {
            await routeService.update(selectedRoute.id, { isActive: false, isCanceled: true });
            toast({ title: "Rota cancelada com sucesso!" });
            setIsCancelDialogOpen(false);
            setSelectedRoute(null);
            fetchRoutes();
            refreshDynamicData();
        } catch (error) {
            console.error("Error canceling route: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível cancelar a rota." });
        }
    };
    
    const handleFinalizeRoute = async (routeId: string) => {
        try {
            await routeService.finishRoute(routeId, new Date());
            toast({ title: "Rota finalizada com sucesso!" });
            fetchRoutes(); // refetch to update the list
            refreshDynamicData();
        } catch (error) {
            console.error("Error finalizing route: ", error);
            toast({ variant: "destructive", title: "Erro", description: "Não foi possível finalizar a rota." });
        }
    };

    const handleExportActiveRoutes = () => {
        const activeRoutesToExport = activeRoutes.filter((route: Route) => route.isActive);
        if (activeRoutesToExport.length === 0) {
            toast({ title: "Atenção", description: "Nenhuma rota ativa encontrada para exportar." });
            return;
        }

        const reportData: any[] = [];

        activeRoutesToExport.forEach((route: Route) => {
            const routeName = route.name;
            const technician = route.technicianName || 'N/A';
            const driver = route.driverName || 'N/A';
            const departure = route.departureDate instanceof Date ? route.departureDate.toLocaleDateString('pt-BR') : '';
            const routeCreatedAt = route.createdAt instanceof Date ? route.createdAt : (route.createdAt as any)?.toDate?.() ?? new Date(0);

            (route.stops || []).forEach((stop: RouteStop) => {
                // Determine OS status the same way the UI does
                const relatedOsList = serviceOrders.filter(os =>
                    os.serviceOrderNumber === stop.serviceOrder &&
                    isAfter(os.date, routeCreatedAt)
                );
                const lastOs = relatedOsList.length > 0 ? relatedOsList[relatedOsList.length - 1] : null;

                let osStatus: string;
                if (!lastOs) {
                    osStatus = 'A Fazer';
                } else if (lastOs.isFinalized === false) {
                    osStatus = 'Pendente';
                } else {
                    osStatus = 'Finalizada';
                }

                const numericOS = /^\d+$/.test(stop.serviceOrder) ? Number(stop.serviceOrder) : stop.serviceOrder;

                reportData.push({
                    "OS Nro.": numericOS,
                    "Nome da Rota": routeName,
                    "Data de Saída": departure,
                    "Técnico": technician,
                    "Motorista": driver,
                    "ASC Job No.": stop.ascJobNumber || '',
                    "Nome Consumidor": stop.consumerName || '',
                    "Cidade": stop.city || '',
                    "Bairro": stop.neighborhood || '',
                    "Modelo": stop.model || '',
                    "Tipo de Parada": stop.stopType === 'coleta' ? `Coleta (${stop.collectionType || ''})` : stop.stopType === 'entrega' ? 'Entrega' : 'Padrão',
                    "Status da OS": osStatus,
                    "Motivo Pendência": osStatus === 'Pendente' 
                        ? [lastOs?.pendingReason, lastOs?.observations].filter(Boolean).join(' - ') || (stop.statusComment || '')
                        : '',
                });
            });
        });

        if (reportData.length === 0) {
            toast({ title: "Atenção", description: "As rotas ativas não possuem ordens de serviço." });
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(reportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Ordens em Rotas Ativas");
        
        XLSX.writeFile(workbook, `relatorio-rotas-ativas-${format(new Date(), 'dd-MM-yyyy')}.xlsx`);
    };


    const handleOpenViewDialog = (route: Route) => {
        setSelectedRoute(route);
        setIsViewDialogOpen(true);
    };

    const handleOpenCancelDialog = (route: Route) => {
        setSelectedRoute(route);
        setIsCancelDialogOpen(true);
    };

    const handleOpenForm = (mode: 'add' | 'edit', route?: Route) => {
        setFormMode(mode);
        setSelectedRouteForEdit(route || null);
        setActiveTab('form');
    };

    const renderRouteActions = (route: Route) => (
        <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => handleOpenViewDialog(route)}>
                <Eye className="mr-2 h-4 w-4" /> Visualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleOpenForm('edit', route)}>
                <Edit className="mr-2 h-4 w-4" /> Editar
            </Button>
            {route.isActive && (
                <Button size="sm" onClick={() => handleFinalizeRoute(route.id)}>
                    <CheckCircle className="mr-2 h-4 w-4" /> Finalizar
                </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => handleOpenCancelDialog(route)}>
                <Trash2 className="mr-2 h-4 w-4" /> Cancelar Rota
            </Button>
        </div>
    );

    return (
        <>
            <div className="flex flex-col gap-6 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <h1 className="text-2xl font-bold">Gerenciar Rotas</h1>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleExportActiveRoutes}>
                            <FileDown className="mr-2 h-4 w-4" /> Exportar Relatório (Ativas)
                        </Button>
                        {activeTab === 'list' && (
                            <Button onClick={() => handleOpenForm('add')}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Rota
                            </Button>
                        )}
                        {activeTab === 'form' && (
                            <Button variant="outline" onClick={() => setActiveTab('list')}>
                                <Eye className="mr-2 h-4 w-4" /> Voltar para Lista
                            </Button>
                        )}
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                    <TabsContent value="list" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
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
                           <div className="space-y-2 py-2">
                               {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                           </div>
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
                                        <TableHead>Motorista</TableHead>
                                        <TableHead>Paradas</TableHead>
                                        <TableHead>Progresso</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredRoutes.map(route => {
                                            const stops = route.stops || [];
                                            const totalStops = stops.length;
                                            const completedStopsCount = stops.filter(stop => 
                                                serviceOrders.some(os => 
                                                    os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt as Date)
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
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Truck className="h-4 w-4 text-muted-foreground" />
                                                    <span>{route.driverName || 'N/A'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{totalStops}</TableCell>
                                            <TableCell className="w-[200px]">
                                                    <div className="flex flex-col gap-1">
                                                        <Progress value={progress} />
                                                        <span className="text-xs text-muted-foreground">{completedStopsCount} de {totalStops} concluídas</span>
                                                    </div>
                                            </TableCell>
                                            <TableCell>
                                                    <Badge variant={route.isActive ? "default" : route.isCanceled ? "destructive" : "secondary"}>
                                                        {route.isActive ? "Ativa" : route.isCanceled ? "Cancelada" : "Finalizada"}
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

                            {/* Load More Inactive Button */}
                            {!showOnlyActive && hasMoreInactive && (
                                <div className="flex justify-center mt-4">
                                    <Button
                                        variant="outline"
                                        onClick={handleLoadMoreInactive}
                                        disabled={isLoadingMoreInactive}
                                        className="gap-2"
                                    >
                                        {isLoadingMoreInactive
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <ChevronDown className="h-4 w-4" />}
                                        {isLoadingMoreInactive ? 'Carregando...' : 'Ver mais rotas finalizadas'}
                                    </Button>
                                </div>
                            )}

                            {/* Mobile Card View */}
                            <div className="md:hidden space-y-4">
                                {filteredRoutes.map(route => {
                                        const stops = route.stops || [];
                                        const totalStops = stops.length;
                                        const completedStopsCount = stops.filter(stop => 
                                            serviceOrders.some(os => 
                                                os.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(os.date, route.createdAt as Date)
                                            )
                                        ).length;
                                        const progress = totalStops > 0 ? (completedStopsCount / totalStops) * 100 : 0;

                                    return (
                                        <Card key={route.id} className={cn(!route.isActive && "bg-muted/50")}>
                                            <CardHeader>
                                                <div className="flex justify-between items-start">
                                                    <CardTitle>{route.name}</CardTitle>
                                                    <Badge variant={route.isActive ? "default" : route.isCanceled ? "destructive" : "secondary"}>
                                                        {route.isActive ? "Ativa" : route.isCanceled ? "Cancelada" : "Finalizada"}
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                 <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Técnico:</span>
                                                    <span className="font-medium">{route.technicianName || 'N/A'}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground flex items-center gap-2"><Truck className="h-4 w-4" /> Motorista:</span>
                                                    <span className="font-medium">{route.driverName || 'N/A'}</span>
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
                    </TabsContent>

                    <TabsContent value="form" className="mt-0 focus-visible:outline-none focus-visible:ring-0">
                        <RouteForm 
                            mode={formMode}
                            isActive={activeTab === 'form'}
                            onCancel={() => setActiveTab('list')}
                            onRouteSaved={() => {
                                fetchRoutes();
                                refreshDynamicData();
                                setActiveTab('list');
                            }}
                            initialData={selectedRouteForEdit}
                            technicians={technicians}
                            drivers={drivers}
                            serviceOrders={serviceOrders}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent className="max-w-6xl w-[90vw]">
                    <DialogHeader>
                        <DialogTitle>Detalhes da Rota: {selectedRoute?.name}</DialogTitle>
                         <DialogDescription>
                            Use a legenda de cores para identificar os tipos de parada.
                        </DialogDescription>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs pt-2">
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300"></div><span>Coleta</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300"></div><span>Entrega</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-100 border border-green-300"></div><span>Finalizada</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-100 border border-red-300"></div><span>Pendência</span></div>
                        </div>
                    </DialogHeader>

                    {/* Summary Info Banner */}
                    <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-muted/40 rounded-xl border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-foreground">
                            <Clock className="w-4 h-4 text-primary" />
                            <span className="font-medium text-muted-foreground">Tempo Estimado:</span>
                            <span className="font-bold text-foreground">{estimatedRouteTime}</span>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                            <MapPin className="w-4 h-4 text-primary" />
                            <span className="font-medium text-muted-foreground">Paradas Totais:</span>
                            <span className="font-bold text-foreground">{selectedRoute?.stops?.length || 0}</span>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-border"></div>
                        <div className="flex items-center gap-2 text-sm text-foreground">
                            <Truck className="w-4 h-4 text-primary" />
                            <span className="font-medium text-muted-foreground">Tipo de Rota:</span>
                            <span className="font-bold text-foreground capitalize">{selectedRoute?.routeType || 'Padrão'}</span>
                        </div>
                    </div>

                    {/* Tab Navigation between List and Map */}
                    <Tabs defaultValue="list" className="w-full">
                        <TabsList className="grid w-full max-w-[400px] grid-cols-2">
                            <TabsTrigger value="list" className="flex items-center gap-2">
                                <List className="w-4 h-4" /> Lista de Paradas
                            </TabsTrigger>
                            <TabsTrigger value="map" className="flex items-center gap-2">
                                <MapIcon className="w-4 h-4" /> Mapa da Rota
                            </TabsTrigger>
                        </TabsList>
                        
                        <TabsContent value="list" className="max-h-[50vh] overflow-y-auto overflow-x-auto rounded-xl border mt-2 w-full">
                            <Table className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>OS</TableHead>
                                        <TableHead>ASC Job No.</TableHead>
                                        <TableHead>Tipo</TableHead>
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
                        </TabsContent>
                        
                        <TabsContent value="map" className="h-[50vh] min-h-[400px] overflow-hidden rounded-xl border relative mt-2">
                            {selectedRoute && (
                                <DynamicalRouteMap 
                                    routes={[selectedRoute]} 
                                    activeStops={activeStopsForMap} 
                                />
                            )}
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso cancelará a rota
                            <span className="font-bold mx-1">{selectedRoute?.name}</span>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelRoute} className="bg-destructive hover:bg-destructive/90">
                           Sim, cancelar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}






