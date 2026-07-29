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
}

function MapBounds({ stops }: { stops: MapStop[] }) {
    const map = useMap();
    useEffect(() => {
        if (stops.length === 0) return;
        const bounds = L.latLngBounds(stops.map(s => s.coords));
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 12, duration: 1.2 });
        }
    }, [stops, map]);
    return null;
}

export default function RouteMap({ routes, activeStops, showPolyline = true, polylineColor = '#8b5cf6', height = '500px' }: RouteMapProps) {
    const [mapStops, setMapStops] = useState<MapStop[]>([]);
    const [loading, setLoading] = useState(true);

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

    return (
        <div style={{ height }} className="w-full min-h-[300px] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 relative z-0">
            {mapStops.length === 0 && loading && (
                <div className="absolute inset-0 z-10 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-slate-300 p-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                    <p className="text-xs">Buscando localizações no satélite...</p>
                </div>
            )}
            
            <MapContainer 
                center={[-10.9472, -37.0731]}
                zoom={10} 
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
                />
                
                <MapBounds stops={mapStops} />

                {showPolyline && mapStops.length > 1 && (
                    <Polyline
                        positions={mapStops.map(s => s.coords)}
                        pathOptions={{ color: polylineColor, weight: 3.5, opacity: 0.85, dashArray: '6, 6' }}
                    />
                )}

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
