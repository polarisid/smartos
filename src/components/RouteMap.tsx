"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCoordinates, parseFullAddress } from '@/lib/geocode';
import { configService } from '@/services/supabase/configService';
import { Route, RouteStop } from '@/lib/data';

// Fix for default Leaflet icons in Webpack/Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function getHaversineDistance(c1: [number, number], c2: [number, number]): number {
    const dLat = (c2[0] - c1[0]) * Math.PI / 180;
    const dLng = (c2[1] - c1[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(c1[0] * Math.PI / 180) * Math.cos(c2[0] * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Custom DivIcons with sequential index numbers
const getCustomIcon = (color: 'green' | 'blue' | 'yellow', index: number) => {
    const colorClasses = {
        green: 'bg-emerald-500 shadow-emerald-500/50',
        blue: 'bg-blue-600 shadow-blue-500/50',
        yellow: 'bg-yellow-500 shadow-yellow-500/50'
    };
    
    return L.divIcon({
        className: 'custom-leaflet-icon',
        html: `<div class="w-6 h-6 rounded-full border-2 border-white shadow-lg ${colorClasses[color]} flex items-center justify-center text-[10px] font-bold text-white animate-in zoom-in">${index}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });
};

const getStoreIcon = () => {
    return L.divIcon({
        className: 'custom-store-leaflet-icon',
        html: `<div class="w-8 h-8 rounded-full border-2 border-white shadow-xl bg-violet-600 flex items-center justify-center text-sm text-white font-bold ring-4 ring-violet-500/30 animate-in zoom-in">🏢</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
    });
};

type MapStop = {
    stop: RouteStop;
    route: Route;
    status: 'completed' | 'pending' | 'todo';
    coords: [number, number];
};

interface RouteMapProps {
    routes: Route[];
    activeStops: { stop: RouteStop, route: Route, status: 'completed' | 'pending' | 'todo' }[];
    showPolyline?: boolean;
    polylineColor?: string;
    height?: string;
    baseAddress?: string;
}

function MapBounds({ stops, baseCoords }: { stops: MapStop[]; baseCoords?: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        const allCoords = stops.map(s => s.coords);
        if (baseCoords) allCoords.push(baseCoords);
        if (allCoords.length === 0) return;

        const bounds = L.latLngBounds(allCoords);
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [45, 45], maxZoom: 13, duration: 1.2 });
        }
    }, [stops, baseCoords, map]);
    return null;
}

export default function RouteMap({
    routes,
    activeStops,
    showPolyline = true,
    polylineColor = '#8b5cf6',
    height = '500px',
    baseAddress = "Avenida Barão de Maruim, 83, São José, Aracaju - SE"
}: RouteMapProps) {
    const [mapStops, setMapStops] = useState<MapStop[]>([]);
    const [baseCoords, setBaseCoords] = useState<[number, number] | null>([-10.9142, -37.0545]);
    const [roadPolyline, setRoadPolyline] = useState<[number, number][]>([]);
    const [loading, setLoading] = useState(true);

    // 1. Fetch Base coordinates dynamically from baseAddress or configService
    useEffect(() => {
        const resolveBase = async () => {
            let addr = baseAddress;
            if (!addr || addr.includes("Avenida Barão de Maruim")) {
                const configBase = await configService.getBaseAddress();
                if (configBase) addr = configBase;
            }
            if (!addr) return;

            const { city, state, street } = parseFullAddress(addr);
            const coords = await getCoordinates(city, "", state, street || addr);
            if (coords) setBaseCoords(coords);
        };

        resolveBase().catch(console.error);
    }, [baseAddress]);

    // 2. Fetch Stop coordinates in parallel
    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        if (!activeStops || activeStops.length === 0) {
            setMapStops([]);
            setLoading(false);
            return;
        }

        const loadCoords = async () => {
            try {
                const promises = activeStops.map(async (item) => {
                    const coords = await getCoordinates(item.stop.city, item.stop.neighborhood, item.stop.state, item.stop.addressDetails, item.stop.zipCode);
                    return coords ? { ...item, coords } : null;
                });
                const results = await Promise.all(promises);
                const loaded = results.filter((r): r is MapStop => r !== null);
                if (isMounted) {
                    setMapStops(loaded);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Failed to load map coordinates:", err);
                if (isMounted) setLoading(false);
            }
        };

        loadCoords();

        // Safety timeout to guarantee loading spinner resolves within 3.5 seconds max
        const timer = setTimeout(() => {
            if (isMounted) setLoading(false);
        }, 3500);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [activeStops]);

    // 3. Fetch OSRM Road Routing (Tracejar pelas vias)
    useEffect(() => {
        if (!showPolyline || mapStops.length === 0) {
            setRoadPolyline([]);
            return;
        }

        const waypoints: [number, number][] = [];
        
        // Include baseCoords if it is within reasonable distance (< 400 km) of the stops
        let includeBase = false;
        if (baseCoords && mapStops.length > 0) {
            const firstStop = mapStops[0].coords;
            const dist = getHaversineDistance(baseCoords, firstStop);
            if (dist < 400) {
                includeBase = true;
                waypoints.push(baseCoords);
            }
        }

        mapStops.forEach(s => waypoints.push(s.coords));
        if (includeBase && baseCoords) waypoints.push(baseCoords); // Return to base

        if (waypoints.length < 2) return;

        let isMounted = true;

        // Helper to fetch driving polyline segment for up to 10 waypoints
        const fetchSegment = async (points: [number, number][]): Promise<[number, number][]> => {
            if (points.length < 2) return points;
            const coordsStr = points.map(c => `${c[1]},${c[0]}`).join(';');
            const osrmBaseUrl = (process.env.NEXT_PUBLIC_OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
            const url = `${osrmBaseUrl}/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.routes && data.routes[0] && data.routes[0].geometry) {
                        return data.routes[0].geometry.coordinates.map(
                            (c: [number, number]) => [c[1], c[0]]
                        );
                    }
                }
            } catch (e) {}
            return points;
        };

        const loadFullPolyline = async () => {
            try {
                // Chunk waypoints into overlapping blocks of max 8 points to prevent OSRM URL limits and sampling loss
                const fullPath: [number, number][] = [];
                const chunkSize = 8;

                for (let i = 0; i < waypoints.length - 1; i += chunkSize - 1) {
                    const chunk = waypoints.slice(i, i + chunkSize);
                    const segmentPath = await fetchSegment(chunk);
                    if (fullPath.length > 0 && segmentPath.length > 0) {
                        fullPath.push(...segmentPath.slice(1));
                    } else {
                        fullPath.push(...segmentPath);
                    }
                }

                if (isMounted) {
                    setRoadPolyline(fullPath.length > 0 ? fullPath : waypoints);
                }
            } catch (err) {
                console.error("OSRM full routing fallback:", err);
                if (isMounted) setRoadPolyline(waypoints);
            }
        };

        loadFullPolyline();

        return () => { isMounted = false; };
    }, [mapStops, baseCoords, showPolyline]);

    // Fallback polyline if OSRM is loading
    const activePolyline = roadPolyline.length > 0
        ? roadPolyline
        : baseCoords
        ? [baseCoords, ...mapStops.map(s => s.coords), baseCoords]
        : mapStops.map(s => s.coords);

    return (
        <div style={{ height }} className="w-full min-h-[300px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative z-0">
            {mapStops.length === 0 && loading && (
                <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-300 p-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mb-2"></div>
                    <p className="text-xs font-bold">Calculando percurso pelas vias...</p>
                </div>
            )}
            
            <MapContainer 
                center={baseCoords || [-10.9142, -37.0545]}
                zoom={11} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                />
                
                <MapBounds stops={mapStops} baseCoords={baseCoords} />

                {/* Base / Store Marker */}
                {baseCoords && (
                    <Marker position={baseCoords} icon={getStoreIcon()}>
                        <Popup className="custom-popup">
                            <div className="p-1">
                                <h4 className="font-bold text-violet-900 text-sm mb-0.5">🏢 Base Operacional (Loja)</h4>
                                <p className="text-xs text-slate-600 font-medium">{baseAddress}</p>
                                <span className="inline-block mt-1 text-[9px] font-extrabold px-2 py-0.5 bg-violet-100 text-violet-800 rounded">
                                  🚩 Ponto de Saída & Retorno
                                </span>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Road Polyline along streets */}
                {showPolyline && activePolyline.length > 1 && (
                    <Polyline
                        positions={activePolyline}
                        pathOptions={{ color: polylineColor, weight: 4, opacity: 0.85 }}
                    />
                )}

                {/* Stop Markers */}
                {mapStops.map((item, idx) => {
                    const originalIndex = activeStops.findIndex(a => a.stop.serviceOrder === item.stop.serviceOrder) + 1;

                    return (
                        <Marker 
                            key={`${item.stop.serviceOrder}-${idx}`} 
                            position={item.coords}
                            icon={getCustomIcon(item.status === 'completed' ? 'green' : item.status === 'pending' ? 'yellow' : 'blue', originalIndex)}
                        >
                            <Popup className="custom-popup">
                                <div className="p-1">
                                    <h4 className="font-bold text-slate-900 text-sm mb-1">
                                        #{originalIndex} - {item.stop.city} - {item.stop.neighborhood}
                                    </h4>
                                    {item.stop.addressDetails && (
                                        <p className="text-xs text-slate-700 italic border-l-2 border-slate-300 pl-2 mb-2 bg-slate-50 py-1">
                                            {item.stop.addressDetails}
                                        </p>
                                    )}
                                    <p className="text-xs text-slate-600 mb-2"><strong>OS:</strong> {item.stop.serviceOrder}</p>
                                    
                                    <div className="text-xs space-y-1 mb-2">
                                        <p><strong>Rota:</strong> {item.route.name}</p>
                                        {item.route.technicianName && <p><strong>Téc:</strong> {item.route.technicianName}</p>}
                                        <p><strong>Turno/Produto:</strong> {item.stop.turn} • {item.stop.productType}</p>
                                    </div>
                                    <div className="mt-2 text-center text-xs font-bold rounded-md py-1 bg-slate-100">
                                        {item.status === 'completed' ? <span className="text-emerald-600">Finalizado</span> : item.status === 'pending' ? <span className="text-yellow-600">Com Pendência</span> : <span className="text-blue-600">A Fazer</span>}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
