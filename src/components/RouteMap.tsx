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

const getLegBadgeIcon = (legNumber: number) => {
    return L.divIcon({
        className: 'custom-leg-badge-icon',
        html: `<div class="px-1.5 py-0.5 rounded-full bg-slate-900/90 text-white text-[9px] font-extrabold border border-emerald-400/80 shadow-md backdrop-blur-sm pointer-events-none flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>T${legNumber}</div>`,
        iconSize: [36, 18],
        iconAnchor: [18, 9],
    });
};

type RouteLeg = {
    id: string;
    fromLabel: string;
    toLabel: string;
    coords: [number, number][];
    midpoint: [number, number];
    distanceKm: number;
    durationMin: number;
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

async function fetchLegRoadPath(
    p1: [number, number],
    p2: [number, number]
): Promise<{ coords: [number, number][]; distanceKm: number; durationMin: number }> {
    const coordsStr = `${p1[1]},${p1[0]};${p2[1]},${p2[0]}`;
    const customOsrm = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_OSRM_URL)
        ? `${process.env.NEXT_PUBLIC_OSRM_URL.replace(/\/$/, '')}/route/v1/driving/`
        : null;

    const endpoints = [
        customOsrm,
        `https://router.project-osrm.org/route/v1/driving/`,
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/`
    ].filter(Boolean) as string[];

    for (const baseUrl of endpoints) {
        try {
            const res = await fetch(`${baseUrl}${coordsStr}?overview=full&geometries=geojson`);
            if (res.ok) {
                const data = await res.json();
                if (data.routes && data.routes[0] && data.routes[0].geometry) {
                    const r = data.routes[0];
                    const roadCoords: [number, number][] = r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
                    return {
                        coords: roadCoords.length > 0 ? roadCoords : [p1, p2],
                        distanceKm: Math.round((r.distance / 1000) * 10) / 10,
                        durationMin: Math.round(r.duration / 60)
                    };
                }
            }
        } catch (e) {}
    }

    const dist = getHaversineDistance(p1, p2);
    return {
        coords: [p1, p2],
        distanceKm: Math.round(dist * 10) / 10,
        durationMin: Math.round((dist / 60) * 60)
    };
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
    const [routeLegs, setRouteLegs] = useState<RouteLeg[]>([]);
    const [loading, setLoading] = useState(true);
    const [mapStyle, setMapStyle] = useState<'google' | 'google_satellite' | 'carto'>('google');

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

        const timer = setTimeout(() => {
            if (isMounted) setLoading(false);
        }, 3500);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [activeStops]);

    // 3. Fetch Leg-by-Leg Highway Routing
    useEffect(() => {
        if (!showPolyline || mapStops.length === 0) {
            setRouteLegs([]);
            return;
        }

        let isMounted = true;

        const pointsWithLabels: { label: string; coords: [number, number] }[] = [];
        if (baseCoords) {
            pointsWithLabels.push({ label: 'Base (Loja)', coords: baseCoords });
        }
        mapStops.forEach((s, idx) => {
            pointsWithLabels.push({
                label: `#${idx + 1} (${s.stop.city} - ${s.stop.neighborhood})`,
                coords: s.coords
            });
        });
        if (baseCoords) {
            pointsWithLabels.push({ label: 'Retorno Base', coords: baseCoords });
        }

        if (pointsWithLabels.length < 2) return;

        const loadLegs = async () => {
            const legs: RouteLeg[] = [];
            for (let i = 0; i < pointsWithLabels.length - 1; i++) {
                const from = pointsWithLabels[i];
                const to = pointsWithLabels[i + 1];

                const legData = await fetchLegRoadPath(from.coords, to.coords);
                const midIdx = Math.floor(legData.coords.length / 2);
                const midpoint = legData.coords[midIdx] || from.coords;

                legs.push({
                    id: `leg-${i}-${from.label}-${to.label}`,
                    fromLabel: from.label,
                    toLabel: to.label,
                    coords: legData.coords,
                    midpoint,
                    distanceKm: legData.distanceKm,
                    durationMin: legData.durationMin
                });
            }

            if (isMounted) {
                setRouteLegs(legs);
            }
        };

        loadLegs();

        return () => { isMounted = false; };
    }, [mapStops, baseCoords, showPolyline]);

    return (
        <div style={{ height }} className="w-full min-h-[300px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative z-0">
            {/* Map Style Selector Overlay */}
            <div className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur-md p-1 rounded-xl shadow-lg border border-slate-200 flex items-center gap-1 text-xs">
                <button
                    type="button"
                    onClick={() => setMapStyle('google')}
                    className={`px-2.5 py-1 rounded-lg transition-all font-semibold text-[11px] ${mapStyle === 'google' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                    🗺️ Google Maps
                </button>
                <button
                    type="button"
                    onClick={() => setMapStyle('google_satellite')}
                    className={`px-2.5 py-1 rounded-lg transition-all font-semibold text-[11px] ${mapStyle === 'google_satellite' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                    🛰️ Satélite
                </button>
                <button
                    type="button"
                    onClick={() => setMapStyle('carto')}
                    className={`px-2.5 py-1 rounded-lg transition-all font-semibold text-[11px] ${mapStyle === 'carto' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                    📍 CartoDB
                </button>
            </div>

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
                {mapStyle === 'google' && (
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                        maxZoom={20}
                    />
                )}
                {mapStyle === 'google_satellite' && (
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                        maxZoom={20}
                    />
                )}
                {mapStyle === 'carto' && (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                    />
                )}
                
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

                {/* Road Polyline along actual highway network */}
                {showPolyline && routeLegs.map((leg, idx) => (
                    <React.Fragment key={leg.id}>
                        {/* High-contrast dark shadow outline */}
                        <Polyline
                            positions={leg.coords}
                            pathOptions={{ color: '#0f172a', weight: 7, opacity: 0.6, lineCap: 'round', lineJoin: 'round' }}
                        />
                        {/* Bright foreground polyline following roads */}
                        <Polyline
                            positions={leg.coords}
                            pathOptions={{ color: polylineColor || '#6366f1', weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                        >
                            <Popup className="custom-popup">
                                <div className="p-1 text-xs">
                                    <h4 className="font-bold text-slate-900 text-xs mb-1">
                                        🛣️ Trecho #{idx + 1}
                                    </h4>
                                    <p className="text-slate-700 font-medium mb-1">
                                        {leg.fromLabel} ➔ {leg.toLabel}
                                    </p>
                                    <div className="flex items-center gap-2 text-[11px] font-semibold text-violet-700 bg-violet-50 dark:bg-violet-950 p-1 rounded">
                                        <span>📏 {leg.distanceKm} km</span>
                                        <span>⏱️ {leg.durationMin} min</span>
                                    </div>
                                </div>
                            </Popup>
                        </Polyline>

                        {/* Midpoint Leg Marker Badge */}
                        <Marker position={leg.midpoint} icon={getLegBadgeIcon(idx + 1)}>
                            <Popup className="custom-popup">
                                <div className="p-1 text-xs">
                                    <p className="font-bold text-slate-900">Trecho #{idx + 1}</p>
                                    <p className="text-slate-600 text-[11px]">{leg.fromLabel} ➔ {leg.toLabel}</p>
                                    <p className="text-violet-700 font-semibold text-[11px]">{leg.distanceKm} km ({leg.durationMin} min)</p>
                                </div>
                            </Popup>
                        </Marker>
                    </React.Fragment>
                ))}

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
