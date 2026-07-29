"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCoordinates } from '@/lib/geocode';
import { Route, RouteStop } from '@/lib/data';

// Fix for default Leaflet icons in Webpack/Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


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
    const [baseCoords, setBaseCoords] = useState<[number, number] | null>([-10.9142, -37.0545]); // Default Barão de Maruim
    const [roadPolyline, setRoadPolyline] = useState<[number, number][]>([]);
    const [loading, setLoading] = useState(true);

    // 1. Fetch Base coordinates
    useEffect(() => {
        if (!baseAddress) return;
        getCoordinates("Aracaju", "São José", "SE", baseAddress).then(coords => {
            if (coords) setBaseCoords(coords);
        }).catch(console.error);
    }, [baseAddress]);

    // 2. Fetch Stop coordinates
    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        setMapStops(prev => prev.filter(p => activeStops.some(a => a.stop.serviceOrder === p.stop.serviceOrder)));

        const loadCoords = async () => {
            const loaded: MapStop[] = [];
            for (const item of activeStops) {
                if (!isMounted) break;
                const coords = await getCoordinates(item.stop.city, item.stop.neighborhood, item.stop.state, item.stop.addressDetails);
                if (coords) {
                    loaded.push({ ...item, coords });
                    setMapStops(prev => {
                        const existing = prev.find(p => p.stop.serviceOrder === item.stop.serviceOrder);
                        if (existing) return prev;
                        return [...prev, { ...item, coords }];
                    });
                }
            }
            if (isMounted) setLoading(false);
        };

        loadCoords();

        return () => {
            isMounted = false;
        };
    }, [activeStops]);

    // 3. Fetch OSRM Road Routing (Tracejar pelas vias)
    useEffect(() => {
        if (!showPolyline || mapStops.length === 0) {
            setRoadPolyline([]);
            return;
        }

        const waypoints: [number, number][] = [];
        if (baseCoords) waypoints.push(baseCoords);
        mapStops.forEach(s => waypoints.push(s.coords));
        if (baseCoords) waypoints.push(baseCoords); // Return to base

        if (waypoints.length < 2) return;

        // Construct OSRM driving route API request (max ~15 waypoints per request for public OSRM server)
        const sampleWaypoints = waypoints.length > 12
            ? [waypoints[0], ...waypoints.filter((_, i) => i % Math.ceil(waypoints.length / 10) === 0), waypoints[waypoints.length - 1]]
            : waypoints;

        const coordsString = sampleWaypoints.map(c => `${c[1]},${c[0]}`).join(';');
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

        let isMounted = true;
        fetch(osrmUrl)
            .then(res => res.json())
            .then(data => {
                if (!isMounted) return;
                if (data.routes && data.routes[0] && data.routes[0].geometry) {
                    const geoCoords: [number, number][] = data.routes[0].geometry.coordinates.map(
                        (c: [number, number]) => [c[1], c[0]]
                    );
                    setRoadPolyline(geoCoords);
                } else {
                    setRoadPolyline(waypoints); // Fallback
                }
            })
            .catch(err => {
                console.error("OSRM routing fallback:", err);
                if (isMounted) setRoadPolyline(waypoints);
            });

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
