"use client";

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
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


// Custom DivIcons
const getCustomIcon = (color: 'green' | 'blue' | 'yellow') => {
    const colorClasses = {
        green: 'bg-emerald-500 shadow-emerald-500/50',
        blue: 'bg-blue-600 shadow-blue-500/50',
        yellow: 'bg-yellow-500 shadow-yellow-500/50'
    };
    
    return L.divIcon({
        className: 'custom-leaflet-icon',
        html: `<div class="w-5 h-5 rounded-full border-2 border-white shadow-lg ${colorClasses[color]} flex items-center justify-center animate-in zoom-in"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
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
}

function MapBounds({ stops }: { stops: MapStop[] }) {
    const map = useMap();
    useEffect(() => {
        if (stops.length === 0) return;
        const bounds = L.latLngBounds(stops.map(s => s.coords));
        if (bounds.isValid()) {
            // Using flyToBounds for a smooth animation when switching routes
            map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 12, duration: 1.5 });
        }
    }, [stops, map]);
    return null;
}

export default function RouteMap({ routes, activeStops }: RouteMapProps) {
    const [mapStops, setMapStops] = useState<MapStop[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        // Clear markers that are no longer in the activeStops list
        setMapStops(prev => prev.filter(p => activeStops.some(a => a.stop.serviceOrder === p.stop.serviceOrder)));

        const loadCoords = async () => {
            const loaded: MapStop[] = [];
            for (const item of activeStops) {
                if (!isMounted) break;
                // Fetch coordinates sequentially to respect rate limit
                const coords = await getCoordinates(item.stop.city, item.stop.neighborhood, item.stop.state, item.stop.addressDetails);
                if (coords) {
                    loaded.push({ ...item, coords });
                    // Update state incrementally so map doesn't stay completely blank for a minute
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

    return (
        <div className="w-full h-full min-h-[500px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative z-0">
            {mapStops.length === 0 && loading && (
                <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-300">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                    <p>Buscando localizações no satélite...</p>
                    <p className="text-xs text-slate-500 mt-2">Pode levar alguns segundos pois é um serviço sem recarga.</p>
                </div>
            )}
            
            <MapContainer 
                center={[-12.9714, -38.5014]} // Salvador default
                zoom={6} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                />
                
                <MapBounds stops={mapStops} />

                {mapStops.map((item, idx) => (
                    <Marker 
                        key={`${item.stop.serviceOrder}-${idx}`} 
                        position={item.coords}
                        icon={getCustomIcon(item.status === 'completed' ? 'green' : item.status === 'pending' ? 'yellow' : 'blue')}
                    >
                        <Popup className="custom-popup">
                            <div className="p-1">
                                <h4 className="font-bold text-slate-900 text-sm mb-1">{item.stop.city} - {item.stop.neighborhood}</h4>
                                {item.stop.addressDetails && (
                                    <p className="text-xs text-slate-700 italic border-l-2 border-slate-300 pl-2 mb-2 bg-slate-50 py-1">
                                        {item.stop.addressDetails}
                                    </p>
                                )}
                                <p className="text-xs text-slate-600 mb-2"><strong>OS:</strong> {item.stop.serviceOrder}</p>
                                
                                <div className="text-xs space-y-1 mb-2">
                                    <p><strong>Rota:</strong> {item.route.name}</p>
                                    <p><strong>Téc:</strong> {item.route.technicianName}</p>
                                    <p><strong>Turno/Produto:</strong> {item.stop.turn} • {item.stop.productType}</p>
                                </div>
                                <div className="mt-2 text-center text-xs font-bold rounded-md py-1 bg-slate-100">
                                    {item.status === 'completed' ? <span className="text-emerald-600">Finalizado</span> : item.status === 'pending' ? <span className="text-yellow-600">Com Pendência</span> : <span className="text-blue-600">A Fazer</span>}
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
