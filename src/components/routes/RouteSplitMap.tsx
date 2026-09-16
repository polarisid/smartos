"use client";

// Mapa leve usado só pra visualizar a divisão de paradas em grupos (Rota A,
// Rota B...) no Planejador Livre. Diferente do RouteMap (dashboard ao vivo),
// aqui não busca trajeto real via OSRM nem status de conclusão — é só um
// "onde cada parada caiu" colorido por grupo, pra revisar/ajustar antes de
// criar os rascunhos de rota.

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteStop } from "@/lib/data";

delete (L.Icon.Default.prototype as any)._getIconUrl;

export type SplitMapPoint = {
  stop: RouteStop;
  coords: [number, number];
  groupIndex: number;
  /** Posição (1-based) da parada dentro do grupo, na ordem atual da rota. */
  sequence: number;
};

function getGroupIcon(hex: string, sequence: number) {
  return L.divIcon({
    className: "custom-leaflet-icon",
    html: `<div style="background:${hex}" class="w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold text-white">${sequence}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function FitBounds({ points }: { points: SplitMapPoint[] }) {
  const map = useMap();
  const lastSig = useRef<string>("");
  useEffect(() => {
    if (points.length === 0) return;
    const sig = points.map(p => `${p.coords[0].toFixed(4)},${p.coords[1].toFixed(4)}`).sort().join("|");
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    const bounds = L.latLngBounds(points.map(p => p.coords));
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 13, duration: 1 });
    }
  }, [points, map]);
  return null;
}

export type GroupPath = { groupIndex: number; coords: [number, number][] };

export default function RouteSplitMap({
  points,
  groupColors,
  groupLabels,
  paths = [],
  height = "100%",
}: {
  points: SplitMapPoint[];
  groupColors: string[];
  groupLabels: string[];
  paths?: GroupPath[];
  height?: string;
}) {
  return (
    <MapContainer center={[-10.9142, -37.0545]} zoom={10} style={{ height, width: "100%", zIndex: 0 }} className="z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={points} />
      {paths.map(p => (
        <Polyline
          key={`path-${p.groupIndex}`}
          positions={p.coords}
          pathOptions={{ color: groupColors[p.groupIndex % groupColors.length], weight: 4, opacity: 0.7 }}
        />
      ))}
      {points.map((p, i) => (
        <Marker key={`${p.stop.serviceOrder}-${i}`} position={p.coords} icon={getGroupIcon(groupColors[p.groupIndex % groupColors.length], p.sequence)}>
          <Popup>
            <div className="text-xs">
              <p className="font-bold font-mono">{p.stop.serviceOrder}</p>
              <p>{p.stop.city}{p.stop.neighborhood ? ` · ${p.stop.neighborhood}` : ""}</p>
              <p className="font-semibold" style={{ color: groupColors[p.groupIndex % groupColors.length] }}>
                {groupLabels[p.groupIndex] || `Grupo ${p.groupIndex + 1}`}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
