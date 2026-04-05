"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { collection, query, where, onSnapshot, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Route, type RouteStop, type ServiceOrder } from "@/lib/data";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Truck, Users, Activity, Bell, BellOff, Calendar as CalendarIcon, CheckCircle2, ChevronRight, Search, TrendingUp, AlertTriangle, Clock, BarChart2, XCircle, Zap, MapPin, Timer } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { parse, isValid, format, isAfter, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import DynamicalRouteMap from "@/components/DynamicalRouteMap";
import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppData } from "@/context/AppDataContext";

type FeedItem = {
    id: string;
    message: string;
    timestamp: Date;
    type: 'success' | 'info' | 'warning';
};

export default function CommandCenterPage() {
    const { technicians } = useAppData();
    const techniciansRef = useRef(technicians);
    useEffect(() => { techniciansRef.current = technicians; }, [technicians]);

    const [routes, setRoutes] = useState<Route[]>([]);
    const routesRef = useRef<Route[]>([]);
    const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);        // 60-day window - route tracking
    const [comparisonOrders, setComparisonOrders] = useState<ServiceOrder[]>([]); // 2-day window  - comparison chart
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const feedEndRef = useRef<HTMLDivElement>(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [selectedMapRoute, setSelectedMapRoute] = useState<string>("all");
    const isFirstLoad = useRef(true);
    const audioCtxRef = useRef<AudioContext | null>(null);

    const [currentTime, setCurrentTime] = useState(new Date());

    // Sound alert using Web Audio API
    const playAlert = useCallback((isPending: boolean) => {
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            }
            const ctx = audioCtxRef.current;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            // Pending = low warning tone, Success = bright success tone
            osc.frequency.setValueAtTime(isPending ? 440 : 880, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(isPending ? 330 : 1100, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
            // Second beep for pending
            if (isPending) {
                const osc2 = ctx.createOscillator();
                const gain2 = ctx.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx.destination);
                osc2.frequency.setValueAtTime(440, ctx.currentTime + 0.5);
                gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.5);
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
                osc2.start(ctx.currentTime + 0.5);
                osc2.stop(ctx.currentTime + 0.9);
            }
        } catch (e) { /* AudioContext not available */ }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);



    useEffect(() => {
        const fetchInitialContext = async () => {
            // Setup real-time listener for active routes
            const routesQuery = query(collection(db, "routes"), where("isActive", "==", true));
            const unsubscribeRoutes = onSnapshot(routesQuery, (snapshot) => {
                const routesData = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: (data.createdAt as Timestamp)?.toDate(),
                        departureDate: (data.departureDate as Timestamp)?.toDate(),
                        arrivalDate: (data.arrivalDate as Timestamp)?.toDate(),
                    } as Route;
                });
                setRoutes(routesData);
                routesRef.current = routesData;
            });

            // 60-day window needed for route completion tracking (past stops)
            const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
            const soQuery = query(collection(db, "serviceOrders"), where("date", ">=", sixtyDaysAgo));
            
            // Narrow 2-day window just for the Ontem × Hoje comparison chart
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
            const compSoQuery = query(collection(db, "serviceOrders"), where("date", ">=", twoDaysAgo));
            const unsubscribeCompSOs = onSnapshot(compSoQuery, (snapshot) => {
                setComparisonOrders(snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { id: doc.id, ...data, date: (data.date as Timestamp).toDate() } as ServiceOrder;
                }));
            });
            
            const unsubscribeSOs = onSnapshot(soQuery, (snapshot) => {
                const orders = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                         id: doc.id,
                         ...data,
                         date: (data.date as Timestamp).toDate(),
                    } as ServiceOrder;
                });
                setServiceOrders(orders);

                // Handle timeline feed notification
                const changes = snapshot.docChanges();
                
                // On initial load, we might get multiple additions. Sort them to process chronologically
                const addedChanges = changes.filter(c => c.type === "added");
                addedChanges.sort((a, b) => {
                    const dateA = (a.doc.data().date as Timestamp)?.toDate().getTime() || 0;
                    const dateB = (b.doc.data().date as Timestamp)?.toDate().getTime() || 0;
                    return dateA - dateB;
                });

                const newFeedItems: FeedItem[] = [];
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                
                addedChanges.forEach((change) => {
                    const data = change.doc.data();
                    const isPending = data.isFinalized === false;
                    const itemDate = (data.date as Timestamp)?.toDate() || new Date();
                    
                    if (itemDate < twentyFourHoursAgo) return; // Only show last 24h on feed
                    
                    let stopCity = 'Cidade N/A';
                    let routeName = 'Rota Avulsa';
                    
                    const techFromGlobal = techniciansRef.current.find(t => t.id === data.technicianId);
                    let techName = techFromGlobal ? techFromGlobal.name : 'Técnico';
                    
                    for (const r of routesRef.current) {
                        if (r.technicianId === data.technicianId) {
                            const matchedStop = r.stops?.find(s => s.serviceOrder === data.serviceOrderNumber);
                            if (matchedStop) {
                                stopCity = matchedStop.city || 'Cidade N/A';
                                routeName = r.name;
                                techName = r.technicianName || techName;
                                break;
                            }
                        }
                    }
                    
                    let message = '';
                    if (isPending) {
                        message = `⚠️ Pendência OS ${data.serviceOrderNumber}\nMotivo: ${data.pendingReason}\n📍 ${stopCity} (${routeName})\n👤 Técnico: ${techName}`;
                    } else {
                        message = `✅ OS ${data.serviceOrderNumber} concluída!\n📍 ${stopCity} (${routeName})\n👤 Técnico: ${techName}`;
                    }

                    newFeedItems.push({
                        id: change.doc.id + Date.now(),
                        message: message,
                        timestamp: itemDate,
                        type: isPending ? 'warning' : 'success'
                    });
                });

                if (newFeedItems.length > 0) {
                    // Play alert sound for truly new items (not initial load)
                    if (!isFirstLoad.current && soundEnabled) {
                        const hasPending = newFeedItems.some(i => i.type === 'warning');
                        playAlert(hasPending);
                    }
                    if (isFirstLoad.current) isFirstLoad.current = false;

                    setFeed(prev => {
                        const getOsNumber = (msg: string) => {
                            const match = msg.match(/OS (\d+)/);
                            return match ? match[1] : null;
                        };
                        const merged = [...newFeedItems, ...prev];
                        const seen = new Set<string>();
                        const deduped = merged.filter(item => {
                            const osNum = getOsNumber(item.message);
                            if (!osNum) return true;
                            if (seen.has(osNum)) return false;
                            seen.add(osNum);
                            return true;
                        });
                        deduped.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                        return deduped.slice(0, 50);
                    });
                }
            });

            return () => {
                unsubscribeRoutes();
                unsubscribeSOs();
                unsubscribeCompSOs();
            };
        };

        const cleanup = fetchInitialContext();
        return () => {
            cleanup.then(unsub => unsub());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Grouping stops by firstVisitDate
    const aggregatedData = React.useMemo(() => {
        const groups: Record<string, { total: number; completed: number; routes: Set<string> }> = {};
        
        routes.forEach(route => {
            (route.stops || []).forEach(stop => {
                // Determine the group key mapping string values or defaulting to "S/D"
                let dateKey = stop.firstVisitDate || stop.requestDate || "Sem Data";
                
                if (!groups[dateKey]) {
                    groups[dateKey] = { total: 0, completed: 0, routes: new Set() };
                }

                groups[dateKey].total += 1;
                groups[dateKey].routes.add(route.name);

                const isCompleted = serviceOrders.some(MathOs => 
                    MathOs.serviceOrderNumber === stop.serviceOrder && 
                    route.createdAt && isAfter(MathOs.date, route.createdAt as Date)
                );
                
                if (isCompleted) {
                    groups[dateKey].completed += 1;
                }
            });
        });

        // Convert the groups to an array to be mapped
        const mappedGroups = Object.keys(groups).map(date => ({
            dateStr: date,
            ...groups[date],
            routesArray: Array.from(groups[date].routes)
        }));

        // Basic sort to put "Sem Data" at bottom, and other dates parsed properly 
        mappedGroups.sort((a, b) => {
            if (a.dateStr === "Sem Data") return 1;
            if (b.dateStr === "Sem Data") return -1;
            // Trying to parse standard formats 'dd/mm/yyyy' or 'dd-mm-yyyy' could get complex if it comes from varied sources. Simple string comparison fallback.
            return a.dateStr.localeCompare(b.dateStr);
        });

        return mappedGroups;
    }, [routes, serviceOrders]);

    const routeData = React.useMemo(() => {
        return routes.map(route => {
            const stops = route.stops || [];
            const totalStops = stops.length;
            
            const completedStopsCount = stops.filter(stop => 
                serviceOrders.some(MathOs => 
                    MathOs.serviceOrderNumber === stop.serviceOrder && route.createdAt && isAfter(MathOs.date, route.createdAt as Date)
                )
            ).length;

            return {
                id: route.id,
                name: route.name,
                technicianName: route.technicianName,
                driverName: route.driverName,
                licensePlate: route.licensePlate,
                departureDate: route.departureDate,
                total: totalStops,
                completed: completedStopsCount
            };
        });
    }, [routes, serviceOrders]);

    // Analytics: yesterday vs today + route stats
    const analyticsData = React.useMemo(() => {
        const WORK_START = 8, WORK_END = 18, WORK_HOURS = 10;
        const curHour = new Date().getHours();
        const curMin  = new Date().getMinutes();

        // Yesterday vs Today hourly completions
        const todayByHour: number[] = Array(24).fill(0);
        const yestByHour:  number[] = Array(24).fill(0);
        // Use narrow 2-day window and only count explicitly finalized orders
        comparisonOrders.forEach(os => {
            if (os.isFinalized !== true) return; // strict: must be explicitly finalized
            const h = os.date.getHours();
            if (isToday(os.date)) todayByHour[h]++;
            else if (isYesterday(os.date)) yestByHour[h]++; // ← only actual yesterday, not 60 days ago
        });
        let todayTotal = 0, yestTotal = 0;
        for (let h = 0; h <= curHour; h++) { todayTotal += todayByHour[h]; yestTotal += yestByHour[h]; }
        const hours = Array.from({ length: 13 }, (_, i) => i + WORK_START).map(h => ({
            h, label: `${String(h).padStart(2, '0')}h`,
            today: todayByHour[h], yesterday: yestByHour[h],
        }));
        const maxVal = Math.max(...hours.map(d => Math.max(d.today, d.yesterday)), 1);

        // Expected % at current time
        const elapsed = Math.max(0, Math.min(curHour + curMin / 60 - WORK_START, WORK_HOURS));
        const xPct = Math.round((elapsed / WORK_HOURS) * 100);

        const todayStart = new Date(); todayStart.setHours(0,0,0,0);
        const routeStats = routes.map(route => {
            const stops = route.stops || [];
            if (stops.length === 0) return null;
            const createdAt = route.createdAt as Date;
            const completed = stops.filter(stop =>
                serviceOrders.some(os =>
                    os.serviceOrderNumber === stop.serviceOrder &&
                    createdAt && isAfter(os.date, createdAt) && os.isFinalized !== false
                )
            ).length;
            const total = stops.length;
            const actualPct = Math.round((completed / total) * 100);
            
            // If route was created before today, expected is 100%
            const routeIsPast = createdAt && createdAt.getTime() < todayStart.getTime();
            const routeXPct = routeIsPast ? 100 : xPct;
            const gap = actualPct - routeXPct;

            // Projection
            const msWorked = Math.max(Date.now() - todayStart.getTime() - WORK_START * 3_600_000, 1000);
            const ratePerMs = completed / msWorked;
            const remaining = total - completed;
            let estimatedEnd: Date | null = null;
            if (remaining === 0) estimatedEnd = new Date();
            else if (ratePerMs > 0) estimatedEnd = new Date(Date.now() + remaining / ratePerMs);

            const status = gap > 10 ? 'ahead' : gap < -20 ? 'critical' : gap < -8 ? 'behind' : 'on-track';
            return { id: route.id, name: route.name, technicianName: route.technicianName || 'N/A',
                total, completed, actualPct, xPct: routeXPct, gap, estimatedEnd, status };
        }).filter(Boolean) as { id:string; name:string; technicianName:string; total:number; completed:number; actualPct:number; xPct:number; gap:number; estimatedEnd:Date|null; status:string }[];

        return { hours, maxVal, todayTotal, yestTotal, trend: todayTotal - yestTotal, curHour, xPct, routeStats, WORK_END };
    }, [routes, serviceOrders]);

    // Dashboard KPIs for today
    const dashboardData = React.useMemo(() => {
        const todayStr = format(new Date(), 'dd/MM/yyyy');

        // All stops scheduled for today — deduplicated by serviceOrder number
        const seenStops = new Set<string>();
        const todayStops: { stop: RouteStop, route: Route }[] = [];
        // Also collect all future stops to cross-reference with today OSes (for early completions)
        const futureFutureStops: { stop: RouteStop, route: Route }[] = [];

        routes.forEach(route => {
            const fallbackDateObj = route.departureDate || route.createdAt;
            const fallbackDateStr = fallbackDateObj && isValid(fallbackDateObj as Date) ? format(fallbackDateObj as Date, 'dd/MM/yyyy') : '';

            (route.stops || []).forEach(stop => {
                const stopDate = stop.firstVisitDate || fallbackDateStr;
                if (stopDate === todayStr && !seenStops.has(stop.serviceOrder)) {
                    seenStops.add(stop.serviceOrder);
                    todayStops.push({ stop, route });
                } else if (stopDate !== todayStr && stopDate !== '') {
                    futureFutureStops.push({ stop, route });
                }
            });
        });

        const totalScheduledToday = todayStops.length;
        let completedToday = 0;
        let pendingToday = 0;
        let notDoneYet = 0;

        const pendingList: { soNumber: string; reason: string; techName: string; city: string; routeName: string }[] = [];
        // completedByTech now stores: count (done today), scheduled (total scheduled for today)
        const completedByTech: Record<string, { name: string; count: number; scheduled: number }> = {};
        const hourlyMap: Record<number, number> = {};

        // Deduplicate today service orders — keep only the most recent per OS number
        const uniqueSOs: Record<string, ServiceOrder> = {};
        serviceOrders.filter(os => isToday(os.date)).forEach(os => {
            const existing = uniqueSOs[os.serviceOrderNumber];
            if (!existing || os.date > existing.date) {
                uniqueSOs[os.serviceOrderNumber] = os;
            }
        });
        const dedupedTodaySOs = Object.values(uniqueSOs);

        // Preparamos as paradas ativas mapeadas em formato correto para enviar para a Lib de Mapas.
        const mapActiveStops: { stop: RouteStop, route: Route, status: 'completed' | 'pending' | 'todo' }[] = [];
        
        routes.forEach(route => {
            const createdAt = route.createdAt as Date;
            (route.stops || []).forEach(stop => {
                // To determine map status, find the most recent OS for this stop (if any)
                // We use deduplicated today SOs if possible, or search the main SO array
                // Let's search the main `serviceOrders` array in descending date order (most recent first)
                const matchedOS = serviceOrders
                    .filter(os => os.serviceOrderNumber === stop.serviceOrder && createdAt && isAfter(os.date, createdAt))
                    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
                
                let status: 'completed' | 'pending' | 'todo' = 'todo';
                if (matchedOS) {
                    status = matchedOS.isFinalized === false ? 'pending' : 'completed';
                }
                mapActiveStops.push({ stop, route, status });
            });
        });

        // Pre-compute scheduled counts per technician for today's stops
        todayStops.forEach(({ stop, route }) => {
            const techId = route.technicianId || '';
            const techName = techniciansRef.current.find(t => t.id === techId)?.name || route.technicianName || 'N/A';
            if (!completedByTech[techId]) completedByTech[techId] = { name: techName, count: 0, scheduled: 0 };
            completedByTech[techId].scheduled++;

            const createdAt = route.createdAt as Date;
            const matchedOS = dedupedTodaySOs.find(os =>
                os.serviceOrderNumber === stop.serviceOrder &&
                createdAt && isAfter(os.date, createdAt)
            );

            let status: 'completed' | 'pending' | 'todo' = 'todo';
            
            if (matchedOS) {
                if (matchedOS.isFinalized === false) {
                    pendingToday++;
                    status = 'pending';
                    pendingList.push({
                        soNumber: stop.serviceOrder,
                        reason: matchedOS.pendingReason || 'Não informado',
                        techName,
                        city: stop.city || 'N/A',
                        routeName: route.name
                    });
                } else {
                    completedToday++;
                    status = 'completed';
                    if (!completedByTech[techId]) completedByTech[techId] = { name: techName, count: 0, scheduled: 0 };
                    completedByTech[techId].count++;
                    const hour = matchedOS.date.getHours();
                    hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
                }
            } else {
                notDoneYet++;
            }
        });

        // Avulsos: deduped OS launched today not linked to any today-stop
        const avulsosCompleted = dedupedTodaySOs.filter(os => {
            const isInTodayStop = todayStops.some(({ stop }) => stop.serviceOrder === os.serviceOrderNumber);
            return !isInTodayStop && os.isFinalized !== false;
        });

        // Late completions (atrasados): OS launched today that belong to a PAST scheduled stop
        // Build this FIRST so we can use route-context for names and scheduled counts
        const atrasadosList: { soNumber: string; techName: string; city: string; scheduledDate: string; routeName: string; techId: string }[] = [];
        const seenAtrasados = new Set<string>();
        // Map techId -> how many scheduled stops they had that are now atrasados
        const atrasadosScheduledByTech: Record<string, { name: string; scheduled: number }> = {};

        dedupedTodaySOs.forEach(os => {
            if (os.isFinalized === false) return;
            const isInTodayStop = todayStops.some(({ stop }) => stop.serviceOrder === os.serviceOrderNumber);
            if (isInTodayStop) return; // handled by today stops

            const pastStop = futureFutureStops.find(({ stop, route }) => {
                const createdAt = route.createdAt as Date;
                return stop.serviceOrder === os.serviceOrderNumber && createdAt && isAfter(os.date, createdAt);
            });
            if (pastStop && !seenAtrasados.has(os.serviceOrderNumber)) {
                seenAtrasados.add(os.serviceOrderNumber);
                const techId = os.technicianId || pastStop.route.technicianId || '';
                const techName = techniciansRef.current.find(t => t.id === techId)?.name
                    || pastStop.route.technicianName || 'N/A';
                const fallbackObj = pastStop.route.departureDate || pastStop.route.createdAt;
                const fallbackDateStr = fallbackObj && isValid(fallbackObj as Date) 
                    ? format(fallbackObj as Date, 'dd/MM/yyyy') : 'N/A';
                atrasadosList.push({
                    soNumber: os.serviceOrderNumber,
                    techName,
                    city: pastStop.stop.city || 'N/A',
                    scheduledDate: pastStop.stop.firstVisitDate || fallbackDateStr,
                    routeName: pastStop.route.name,
                    techId
                });
            }
        });

        // Count how many atrasado stops each tech had scheduled (for the X/Y display)
        // Group by techId from the past stops
        futureFutureStops.forEach(({ stop, route }) => {
            const isAtrasadoDone = atrasadosList.some(a => a.soNumber === stop.serviceOrder);
            if (!isAtrasadoDone) return;
            // This stop is one of the atrasados
            const techId = route.technicianId || '';
            const techName = techniciansRef.current.find(t => t.id === techId)?.name
                || route.technicianName || 'N/A';
            // Count distinct past-date groups per tech as "scheduled" for atrasados
            if (!atrasadosScheduledByTech[techId]) atrasadosScheduledByTech[techId] = { name: techName, scheduled: 0 };
            atrasadosScheduledByTech[techId].scheduled++;
        });

        // Now process avulsosCompleted (which includes atrasados) to build completedByTech
        avulsosCompleted.forEach(os => {
            const techId = os.technicianId || '';
            // Try to get tech name from atrasados first (has route context), then global list
            const atrasado = atrasadosList.find(a => a.soNumber === os.serviceOrderNumber);
            const techName = atrasado?.techName
                || techniciansRef.current.find(t => t.id === techId)?.name
                || 'N/A';
            const scheduledExtra = atrasadosScheduledByTech[techId]?.scheduled || 0;
            if (!completedByTech[techId]) completedByTech[techId] = { name: techName, count: 0, scheduled: scheduledExtra };
            else if (completedByTech[techId].name === 'N/A' && techName !== 'N/A') {
                completedByTech[techId].name = techName;
            }
            // Merge scheduled: if this is an atrasado tech and scheduled not yet merged
            if (scheduledExtra > 0 && completedByTech[techId].scheduled === 0) {
                completedByTech[techId].scheduled = scheduledExtra;
            }
            completedByTech[techId].count++;
            const hour = os.date.getHours();
            hourlyMap[hour] = (hourlyMap[hour] || 0) + 1;
        });

        // Hourly chart data (8am to 8pm)
        const hourlyData = Array.from({ length: 13 }, (_, i) => i + 8).map(hour => ({
            hour,
            label: `${String(hour).padStart(2, '0')}h`,
            count: hourlyMap[hour] || 0
        }));
        const maxHourly = Math.max(...hourlyData.map(d => d.count), 1);

        const totalCompletedToday = completedToday + avulsosCompleted.length;
        const totalPendingToday = pendingToday + dedupedTodaySOs.filter(os => {
            const isInTodayStop = todayStops.some(({ stop }) => stop.serviceOrder === os.serviceOrderNumber);
            return !isInTodayStop && os.isFinalized === false;
        }).length;

        // Average time between completions today
        const completedTimestamps = dedupedTodaySOs
            .filter(os => os.isFinalized !== false && isToday(os.date))
            .map(os => os.date.getTime())
            .sort((a, b) => a - b);
        let avgTimeMinutes = 0;
        if (completedTimestamps.length >= 2) {
            const gaps = completedTimestamps.slice(1).map((t, i) => t - completedTimestamps[i]);
            const avgGapMs = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            avgTimeMinutes = Math.round(avgGapMs / 60000);
        }

        // City heat map: group all today stops by city
        const cityMap: Record<string, { total: number; completed: number; pending: number }> = {};
        todayStops.forEach(({ stop, route }) => {
            const city = stop.city || 'Sem cidade';
            if (!cityMap[city]) cityMap[city] = { total: 0, completed: 0, pending: 0 };
            cityMap[city].total++;
            const createdAt = route.createdAt as Date;
            const matchedOS = dedupedTodaySOs.find(os =>
                os.serviceOrderNumber === stop.serviceOrder && createdAt && isAfter(os.date, createdAt)
            );
            if (matchedOS) {
                if (matchedOS.isFinalized === false) cityMap[city].pending++;
                else cityMap[city].completed++;
            }
        });
        const cityHeatMap = Object.entries(cityMap)
            .map(([city, data]) => ({ city, ...data }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        // Overdue backlog: past stops (firstVisitDate < today) with no OS at all in 60-day window
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const seenBacklog = new Set<string>();
        let overdueBacklog = 0;
        futureFutureStops.forEach(({ stop, route }) => {
            if (seenBacklog.has(stop.serviceOrder)) return;

            let isPastStop = false;
            const originDateObj = (route.departureDate || route.createdAt) as Date;
            
            if (originDateObj && originDateObj.getTime() < todayStart.getTime()) {
                isPastStop = true; // The whole route is from a past day
            } else if (stop.firstVisitDate) {
                const parsed = parse(stop.firstVisitDate, 'dd/MM/yyyy', new Date());
                if (isValid(parsed) && parsed < todayStart) {
                    isPastStop = true;
                }
            }

            if (!isPastStop) return; // Ignore today or future stops
            
            // Check if there is ANY service order (success or failure) launched after route creation
            const createdAt = route.createdAt as Date;
            const hasAnyOS = serviceOrders.some(os =>
                os.serviceOrderNumber === stop.serviceOrder && createdAt && isAfter(os.date, createdAt)
            );
            
            if (!hasAnyOS) {
                seenBacklog.add(stop.serviceOrder);
                overdueBacklog++;
            }
        });

        return {
            totalScheduledToday,
            completedToday: totalCompletedToday,
            pendingToday: totalPendingToday,
            notDoneYet,
            pendingList,
            atrasadosList,
            overdueBacklog,
            completedByTech: Object.values(completedByTech)
                .filter(t => t.count > 0)
                .sort((a, b) => b.count - a.count),
            hourlyData,
            maxHourly,
            avgTimeMinutes,
            cityHeatMap,
            mapActiveStops
        };
    }, [routes, serviceOrders, technicians]);


    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex overflow-hidden">
            
            {/* Main Area: Progress & Dashboard */}
            <main className="flex-1 p-6 md:p-10 flex flex-col overflow-y-auto">
                 <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl lg:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 flex items-center gap-4">
                            <Activity className="h-8 w-8 lg:h-12 lg:w-12 text-blue-400" />
                            Command Center
                        </h1>
                        <p className="text-slate-400 mt-2 text-lg">Visão estratégica e andamento de agendamentos</p>
                    </div>
                    <div className="text-right hidden sm:block">
                        <div className="text-4xl font-bold text-white tracking-wider glow-text">
                            {format(currentTime, "HH:mm")}
                        </div>
                        <div className="text-slate-400 text-md mt-1 capitalize">
                            {format(currentTime, "EEEE, d 'de' MMMM", { locale: ptBR })}
                        </div>
                    </div>
                </header>

                <Tabs defaultValue="agendamento" className="w-full">
                    <TabsList className="mb-8 grid w-full grid-cols-4 max-w-[800px] bg-slate-900 border border-slate-800">
                        <TabsTrigger value="agendamento" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Por Agendamento</TabsTrigger>
                        <TabsTrigger value="rota" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Análise de Rotas</TabsTrigger>
                        <TabsTrigger value="mapa" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Mapa das Rotas</TabsTrigger>
                        <TabsTrigger value="dashboard" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Dashboard</TabsTrigger>
                    </TabsList>

                    <TabsContent value="mapa" className="animate-in fade-in-50 duration-500 mt-0">
                        <div className="flex flex-col h-[75vh]">
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin className="text-blue-500 h-5 w-5" />
                                    <h2 className="text-xl font-semibold text-slate-200">Radar Dinâmico</h2>
                                </div>
                                
                                <select 
                                    value={selectedMapRoute}
                                    onChange={e => setSelectedMapRoute(e.target.value)}
                                    className="bg-slate-800 border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-3 py-1.5 focus:outline-none focus:ring-2 max-w-[300px] cursor-pointer"
                                >
                                    <option value="all">Todas as Rotas Ativas</option>
                                    {routes.map(r => <option key={r.id} value={r.id}>{r.name} ({r.technicianName})</option>)}
                                </select>

                                <div className="flex gap-4 text-sm font-medium">
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Concluídos</span>
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-yellow-500"></div> Com Pendência</span>
                                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-600"></div> A Fazer</span>
                                </div>
                            </div>
                            <div className="flex-1 rounded-xl shadow-2xl relative overflow-hidden">
                                <DynamicalRouteMap 
                                    routes={routes} 
                                    activeStops={selectedMapRoute === 'all' 
                                        ? dashboardData.mapActiveStops 
                                        : dashboardData.mapActiveStops.filter(s => s.route.id === selectedMapRoute)
                                    } 
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="agendamento" className="animate-in fade-in-50 duration-500 mt-0">
                        <div className="mb-6 flex items-center gap-2">
                    <CalendarIcon className="text-blue-500 h-5 w-5" />
                    <h2 className="text-xl font-semibold text-slate-200">Visão por Agendamento</h2>
                </div>

                {aggregatedData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-60 border-2 border-dashed border-slate-800 rounded-2xl p-10">
                        <Search className="h-16 w-16 mb-4 text-slate-500" />    
                        <h3 className="text-2xl font-bold">Sem Roteiros Ativos</h3>
                        <p className="text-slate-400 mt-2">Os agendamentos agrupados aparecerão aqui assim que as rotas forem carregadas.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {aggregatedData.map((group, idx) => {
                            const progress = group.total > 0 ? (group.completed / group.total) * 100 : 0;
                            const is100 = progress === 100 && group.total > 0;

                            return (
                                <Card 
                                    key={idx} 
                                    className={`border border-slate-800 bg-slate-900/40 backdrop-blur-md shadow-lg overflow-hidden transition-all duration-300 hover:border-slate-700 hover:bg-slate-900/60`}
                                >
                                    <div className={`h-1 w-full ${is100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400 opacity-75'}`}></div>
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-100">{group.dateStr}</h3>
                                                <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                                                    Rotas atuando: 
                                                    <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                                                        {group.routesArray.length} conectadas
                                                    </span>
                                                </p>
                                            </div>
                                            {is100 && (
                                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1 text-xs">
                                                    <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Completo
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Andamento</span>
                                                <div className="text-right">
                                                    <span className="text-3xl font-black text-white">{group.completed}</span>
                                                    <span className="text-xl font-bold text-slate-600"> / {group.total}</span>
                                                </div>
                                            </div>
                                            <Progress value={progress} className={`h-4 bg-slate-950 border border-slate-800 ${is100 ? '[&>div]:bg-emerald-500' : '[&>div]:bg-gradient-to-r [&>div]:from-blue-600 [&>div]:to-cyan-400'}`} />
                                            <p className="text-right text-xs font-bold text-slate-400">{Math.round(progress)}% Concluído</p>
                                        </div>
                                    </CardContent>
                                    
                                    <div className="bg-slate-950/50 px-6 py-3 border-t border-slate-800 flex flex-wrap gap-2 text-xs">
                                        <span className="text-slate-500 mr-2 flex items-center"><Truck className="h-3 w-3 mr-1" /> Equipes:</span>
                                        {group.routesArray.map(rname => (
                                            <span key={rname} className="px-2 py-1 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 truncate max-w-[150px] inline-block">{rname}</span>
                                        ))}
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                )}
                    </TabsContent>

                    <TabsContent value="rota" className="animate-in fade-in-50 duration-500 mt-0 space-y-8">

                        {/* Comparativo Ontem x Hoje */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="text-blue-500 h-5 w-5" />
                                <h2 className="text-xl font-semibold text-slate-200">Comparativo Ontem × Hoje</h2>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <Card className="border border-slate-800 bg-slate-900/40">
                                    <CardContent className="p-4 flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Hoje (até agora)</span>
                                        <span className="text-4xl font-black text-white">{analyticsData.todayTotal}</span>
                                        <span className="text-xs text-slate-500">atendimentos</span>
                                    </CardContent>
                                </Card>
                                <Card className="border border-slate-800 bg-slate-900/40">
                                    <CardContent className="p-4 flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ontem (mesmo horário)</span>
                                        <span className="text-4xl font-black text-slate-400">{analyticsData.yestTotal}</span>
                                        <span className="text-xs text-slate-500">atendimentos</span>
                                    </CardContent>
                                </Card>
                                <Card className={`border backdrop-blur-md ${
                                    analyticsData.trend > 0 ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : analyticsData.trend < 0 ? 'border-red-500/30 bg-red-500/5'
                                    : 'border-slate-700 bg-slate-800/20'}`}>
                                    <CardContent className="p-4 flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tendência</span>
                                        <div className="flex items-center gap-2">
                                            {analyticsData.trend > 0
                                                ? <TrendingUp className="h-6 w-6 text-emerald-400" />
                                                : analyticsData.trend < 0
                                                    ? <TrendingUp className="h-6 w-6 text-red-400 rotate-180" />
                                                    : <Activity className="h-6 w-6 text-slate-400" />}
                                            <span className={`text-4xl font-black ${
                                                analyticsData.trend > 0 ? 'text-emerald-300'
                                                : analyticsData.trend < 0 ? 'text-red-300' : 'text-slate-400'}`}>
                                                {analyticsData.trend > 0 ? '+' : ''}{analyticsData.trend}
                                            </span>
                                        </div>
                                        <span className="text-xs text-slate-500">vs. ontem neste horário</span>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Dual bar chart */}
                            <Card className="border border-slate-800 bg-slate-900/40">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-4">
                                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500 inline-block" /> Hoje</span>
                                        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-600 inline-block" /> Ontem</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pb-6">
                                    <div className="flex items-end gap-1 h-40">
                                        {analyticsData.hours.map(d => {
                                            const isPast = d.h <= analyticsData.curHour;
                                            const tH = (d.today / analyticsData.maxVal) * 128;
                                            const yH = (d.yesterday / analyticsData.maxVal) * 128;
                                            return (
                                                <div key={d.h} className="flex-1 flex flex-col items-center gap-0.5">
                                                    <div className="flex items-end gap-0.5 w-full">
                                                        <div className="flex-1 rounded-t bg-slate-700/60 transition-all duration-700"
                                                            style={{ height: `${Math.max(yH, d.yesterday > 0 ? 3 : 0)}px` }} />
                                                        <div className={`flex-1 rounded-t transition-all duration-700 ${
                                                            isPast ? 'bg-gradient-to-t from-blue-600 to-cyan-400' : 'bg-slate-800/40'}`}
                                                            style={{ height: `${Math.max(tH, d.today > 0 ? 3 : 0)}px` }} />
                                                    </div>
                                                    <span className={`text-[8px] font-mono ${
                                                        d.h === analyticsData.curHour ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>
                                                        {d.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        {/* Taxa de Conclusão por Rota */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Truck className="text-blue-500 h-5 w-5" />
                                <h2 className="text-xl font-semibold text-slate-200">Taxa de Conclusão por Rota</h2>
                                <span className="ml-auto text-xs text-slate-500 font-mono">
                                    Esperado agora: <span className="text-blue-400 font-bold">{analyticsData.xPct}%</span>
                                </span>
                            </div>
                            {analyticsData.routeStats.length === 0 ? (
                                <Card className="border border-dashed border-slate-800"><CardContent className="p-8 text-center text-slate-500">Nenhuma rota ativa com paradas.</CardContent></Card>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {analyticsData.routeStats
                                        .slice().sort((a, b) => a.gap - b.gap)
                                        .map(r => {
                                            const sc = r.status === 'ahead' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
                                                : r.status === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/5'
                                                : r.status === 'behind'   ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/5'
                                                : 'text-blue-400 border-blue-500/30 bg-blue-500/5';
                                            const sl = r.status === 'ahead' ? 'Adiantada' : r.status === 'critical' ? 'Crítica'
                                                : r.status === 'behind' ? 'Atrasada' : 'Em dia';
                                            return (
                                                <Card key={r.id} className={`border backdrop-blur-md ${sc}`}>
                                                    <CardContent className="p-5">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                <p className="font-bold text-white text-sm">{r.name}</p>
                                                                <p className="text-xs text-slate-500 mt-0.5">👤 {r.technicianName}</p>
                                                            </div>
                                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${sc}`}>{sl}</span>
                                                        </div>
                                                        <div className="relative h-3 bg-slate-800 rounded-full overflow-visible mb-2">
                                                            <div className="absolute top-0 bottom-0 w-0.5 bg-white/20 z-10"
                                                                style={{ left: `${Math.min(r.xPct, 99)}%` }} />
                                                            <div className={`h-full rounded-full transition-all duration-700 ${
                                                                r.status === 'critical' ? 'bg-gradient-to-r from-red-600 to-red-400'
                                                                : r.status === 'behind' ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
                                                                : r.status === 'ahead'  ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                                                                : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`}
                                                                style={{ width: `${r.actualPct}%` }} />
                                                        </div>
                                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                                            <span>{r.completed}/{r.total} paradas</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-slate-500">Esp.: {r.xPct}%</span>
                                                                <span className="font-bold text-white">{r.actualPct}%</span>
                                                                <span className={r.gap >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                                    {r.gap >= 0 ? '+' : ''}{r.gap}%
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                </div>
                            )}
                        </section>

                        {/* Projeção de Encerramento */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Clock className="text-blue-500 h-5 w-5" />
                                <h2 className="text-xl font-semibold text-slate-200">Projeção de Encerramento</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {analyticsData.routeStats
                                    .slice().sort((a, b) => (a.estimatedEnd?.getTime() ?? Infinity) - (b.estimatedEnd?.getTime() ?? Infinity))
                                    .map(r => {
                                        const isDone = r.completed >= r.total && r.total > 0;
                                        const late = r.estimatedEnd && r.estimatedEnd.getHours() >= analyticsData.WORK_END;
                                        return (
                                            <Card key={r.id} className={`border backdrop-blur-md ${
                                                isDone ? 'border-emerald-500/30 bg-emerald-500/5'
                                                : late  ? 'border-red-500/30 bg-red-500/5'
                                                : 'border-slate-800 bg-slate-900/40'}`}>
                                                <CardContent className="p-5">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        {isDone
                                                            ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                                            : late
                                                                ? <AlertTriangle className="h-5 w-5 text-red-400" />
                                                                : <Clock className="h-5 w-5 text-blue-400" />}
                                                        <div>
                                                            <p className="font-bold text-white text-sm leading-tight">{r.name}</p>
                                                            <p className="text-[10px] text-slate-500">{r.technicianName}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-end justify-between">
                                                        <div>
                                                            {isDone ? (
                                                                <p className="text-2xl font-black text-emerald-300">Concluída ✓</p>
                                                            ) : r.estimatedEnd ? (
                                                                <>
                                                                    <p className={`text-3xl font-black ${ late ? 'text-red-300' : 'text-white'}`}>
                                                                        {format(r.estimatedEnd, 'HH:mm')}
                                                                    </p>
                                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                                        {late ? '⚠️ Fora do horário' : 'Previsão de encerramento'}
                                                                    </p>
                                                                </>
                                                            ) : (
                                                                <p className="text-lg font-bold text-slate-500">Sem dados</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-2xl font-black text-slate-400">{r.completed}/{r.total}</p>
                                                            <p className="text-[10px] text-slate-600">paradas</p>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                            </div>
                        </section>

                    </TabsContent>

                    <TabsContent value="dashboard" className="animate-in fade-in-50 duration-500 mt-0 space-y-8">
                        <div className="mb-6 flex items-center gap-2">
                            <BarChart2 className="text-blue-500 h-5 w-5" />
                            <h2 className="text-xl font-semibold text-slate-200">Produtividade do Dia</h2>
                            <span className="ml-auto text-xs text-slate-500 font-mono">{format(new Date(), "dd/MM/yyyy", { locale: ptBR })}</span>
                            <a
                                href="/admin/analytics"
                                className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-all"
                            >
                                <TrendingUp className="h-3.5 w-3.5" /> Ver Análise Completa
                            </a>
                        </div>

                        {/* KPI Cards – single row, 7 columns */}
                        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                            {/* Programados */}
                            <Card className="border border-blue-500/20 bg-blue-500/5 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-blue-500/10"><CalendarIcon className="h-4 w-4 text-blue-400" /></div>
                                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider leading-tight">Programados</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">{dashboardData.totalScheduledToday}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">agendados hoje</p>
                                </CardContent>
                            </Card>

                            {/* Concluídos */}
                            <Card className="border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div>
                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider leading-tight">Concluídos</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">{dashboardData.completedToday}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        {dashboardData.totalScheduledToday > 0
                                            ? `${Math.round((dashboardData.completedToday / dashboardData.totalScheduledToday) * 100)}% do planejado`
                                            : 'OS no dia'}
                                    </p>
                                </CardContent>
                            </Card>

                            {/* Pendências */}
                            <Card className="border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-yellow-500/10"><AlertTriangle className="h-4 w-4 text-yellow-400" /></div>
                                        <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider leading-tight">Pendências</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">{dashboardData.pendingToday}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">não finalizados</p>
                                </CardContent>
                            </Card>

                            {/* Atrasados */}
                            <Card className="border border-orange-500/20 bg-orange-500/5 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-orange-500/10"><Clock className="h-4 w-4 text-orange-400" /></div>
                                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider leading-tight">Atrasados</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">{dashboardData.atrasadosList.length}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">realizados fora do prazo</p>
                                </CardContent>
                            </Card>

                            {/* Acúmulo – past stops never serviced */}
                            <Card className={`border backdrop-blur-md ${dashboardData.overdueBacklog > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/30 bg-slate-800/10'}`}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`p-1.5 rounded-md ${dashboardData.overdueBacklog > 0 ? 'bg-red-500/10' : 'bg-slate-700/20'}`}>
                                            <AlertTriangle className={`h-4 w-4 ${dashboardData.overdueBacklog > 0 ? 'text-red-400' : 'text-slate-500'}`} />
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${dashboardData.overdueBacklog > 0 ? 'text-red-400' : 'text-slate-500'}`}>Acúmulo</span>
                                    </div>
                                    <p className={`text-4xl font-black ${dashboardData.overdueBacklog > 0 ? 'text-red-300' : 'text-slate-500'}`}>{dashboardData.overdueBacklog}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">vencidos sem OS</p>
                                </CardContent>
                            </Card>

                            {/* Sem registro */}
                            <Card className="border border-slate-600/30 bg-slate-800/20 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-slate-700/30"><XCircle className="h-4 w-4 text-slate-400" /></div>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Sem Registro</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">{dashboardData.notDoneYet}</p>
                                    <p className="text-[10px] text-slate-500 mt-1">paradas sem OS</p>
                                </CardContent>
                            </Card>

                            {/* Tempo Médio */}
                            <Card className="border border-purple-500/20 bg-purple-500/5 backdrop-blur-md">
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 rounded-md bg-purple-500/10"><Timer className="h-4 w-4 text-purple-400" /></div>
                                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider leading-tight">Tempo Médio</span>
                                    </div>
                                    <p className="text-4xl font-black text-white">
                                        {dashboardData.avgTimeMinutes > 0 ? dashboardData.avgTimeMinutes : '--'}
                                        <span className="text-base font-bold text-slate-500 ml-1">min</span>
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-1">entre conclusões</p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {/* Hourly Chart */}
                            <Card className="border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-blue-400" /> Atendimentos por Hora
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pb-6">
                                    <div className="flex items-end gap-1.5 h-40">
                                        {dashboardData.hourlyData.map(d => (
                                            <div key={d.hour} className="flex flex-col items-center flex-1 gap-1">
                                                <span className="text-[10px] text-slate-400 font-bold">{d.count > 0 ? d.count : ''}</span>
                                                <div
                                                    className="w-full rounded-t transition-all duration-700"
                                                    style={{
                                                        height: `${(d.count / dashboardData.maxHourly) * 112}px`,
                                                        minHeight: d.count > 0 ? '4px' : '2px',
                                                        background: d.count > 0
                                                            ? 'linear-gradient(to top, #3b82f6, #06b6d4)'
                                                            : 'rgba(100,116,139,0.2)'
                                                    }}
                                                />
                                                <span className="text-[9px] text-slate-600 font-mono">{d.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* By Technician */}
                            <Card className="border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                                        <Users className="h-4 w-4 text-blue-400" /> Ranking de Técnicos Hoje
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {dashboardData.completedByTech.length === 0 ? (
                                        <p className="text-sm text-slate-500 py-4 text-center">Nenhum atendimento concluído ainda.</p>
                                    ) : (
                                        dashboardData.completedByTech.map((tech, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <span className="text-xs font-black text-slate-500 w-4">{i + 1}</span>
                                                <div className="flex-1">
                                                    <div className="flex justify-between mb-1 items-center">
                                                        <span className="text-sm font-semibold text-slate-200">{tech.name}</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-black text-white">{tech.count}</span>
                                                            {tech.scheduled > 0 && (
                                                                <span className="text-xs text-slate-500 font-mono">/ {tech.scheduled}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-700"
                                                            style={{ width: `${(tech.count / (dashboardData.completedByTech[0]?.count || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* City Heat Map */}
                        {dashboardData.cityHeatMap.length > 0 && (
                            <Card className="border border-slate-800 bg-slate-900/40 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                                        <MapPin className="h-4 w-4 text-blue-400" /> Atividade por Cidade
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {dashboardData.cityHeatMap.map((c, i) => {
                                            const pct = Math.round((c.completed / c.total) * 100);
                                            const hasPending = c.pending > 0;
                                            return (
                                                <div key={i} className="flex items-center gap-3">
                                                    <span className="text-xs text-slate-500 w-4 font-mono">{i + 1}</span>
                                                    <span className="text-sm font-semibold text-slate-200 w-36 truncate">{c.city}</span>
                                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ${hasPending ? 'bg-gradient-to-r from-yellow-500 to-orange-400' : 'bg-gradient-to-r from-blue-500 to-emerald-400'}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs font-mono">
                                                        <span className="text-emerald-400">{c.completed}✓</span>
                                                        {c.pending > 0 && <span className="text-yellow-400">{c.pending}⚠</span>}
                                                        <span className="text-slate-500">/{c.total}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Late Completions (Atrasados) */}
                        {dashboardData.atrasadosList.length > 0 && (
                            <Card className="border border-orange-500/20 bg-orange-500/5 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold text-orange-400 flex items-center gap-2">
                                        <Clock className="h-4 w-4" /> Atendimentos em Atraso Realizados Hoje ({dashboardData.atrasadosList.length})
                                    </CardTitle>
                                    <p className="text-xs text-slate-500 pt-1">OS com data prevista anterior a hoje, finalizadas neste dia.</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {dashboardData.atrasadosList.map((a, i) => (
                                            <div key={i} className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-orange-500/10 rounded-lg px-4 py-3">
                                                <span className="font-mono text-sm font-black text-orange-300">{a.soNumber}</span>
                                                <span className="text-xs bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20">Previsto: {a.scheduledDate}</span>
                                                <span className="text-xs text-slate-400 flex items-center gap-1">📍 {a.city}</span>
                                                <span className="text-xs text-slate-500">{a.routeName}</span>
                                                <span className="ml-auto text-xs text-slate-500">👤 {a.techName}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Pending List */}
                        {dashboardData.pendingList.length > 0 && (
                            <Card className="border border-yellow-500/20 bg-yellow-500/5 backdrop-blur-md">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base font-semibold text-yellow-400 flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4" /> Pendências Registradas Hoje
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {dashboardData.pendingList.map((p, i) => (
                                            <div key={i} className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-yellow-500/10 rounded-lg px-4 py-3">
                                                <span className="font-mono text-sm font-black text-yellow-300">{p.soNumber}</span>
                                                <span className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/20">{p.reason}</span>
                                                <span className="text-xs text-slate-400 flex items-center gap-1">📍 {p.city}</span>
                                                <span className="text-xs text-slate-500">{p.routeName}</span>
                                                <span className="ml-auto text-xs text-slate-500">👤 {p.techName}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </main>

            {/* Right Panel: Live Feed / Timeline */}
            <aside className="w-full lg:w-[400px] border-l border-slate-800 bg-slate-900/30 flex flex-col">
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Bell className="h-5 w-5 text-slate-300" />
                            {feed.length > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>}
                            {feed.length > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500"></span>}
                        </div>
                        <h2 className="font-semibold text-lg text-slate-200">Radar de Interações</h2>
                        {feed.length > 0 && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">{feed.length}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSoundEnabled(s => !s)}
                            title={soundEnabled ? 'Desativar som' : 'Ativar som'}
                            className={`p-2 rounded-lg border transition-all ${soundEnabled ? 'border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:bg-slate-700/40'}`}
                        >
                            {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                        </button>
                        <Badge variant="outline" className="border-slate-700 text-slate-400">Ao Vivo</Badge>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <ScrollArea className="h-full px-6 py-4">
                        {feed.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-20 opacity-50">
                                <Activity className="h-10 w-10 mb-4" />
                                <p className="text-sm font-medium">Aguardando atividades...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {feed.map((item, index) => (
                                    <div key={item.id} className="relative pl-6">
                                        {/* Timeline Line */}
                                        {index !== feed.length - 1 && (
                                            <div className="absolute left-[7px] top-6 bottom-[-24px] w-0.5 bg-slate-800"></div>
                                        )}
                                        {/* Timeline Dot */}
                                        <div className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-slate-950 ${item.type === 'warning' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`}></div>
                                        
                                        <div className={`bg-slate-800/40 border p-3 rounded-lg shadow-sm hover:border-slate-600 transition-colors ${item.type === 'warning' ? 'border-yellow-500/30' : 'border-slate-700/50'}`}>
                                            <p className="text-sm text-slate-200 font-medium leading-relaxed whitespace-pre-line">{item.message}</p>
                                            <span className="text-xs text-slate-500 mt-2 block font-mono">
                                                {format(item.timestamp, "HH:mm:ss")}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-slate-900/30 to-transparent pointer-events-none"></div>
                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-slate-900/50 to-transparent pointer-events-none"></div>
                </div>
            </aside>

        </div>
    );
}
