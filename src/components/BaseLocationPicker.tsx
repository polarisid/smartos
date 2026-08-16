"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function RecenterOnChange({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]]);
  return null;
}

interface BaseLocationPickerProps {
  position: [number, number];
  onChange: (coords: [number, number]) => void;
  height?: string;
}

export default function BaseLocationPicker({ position, onChange, height = "320px" }: BaseLocationPickerProps) {
  const markerRef = useRef<L.Marker>(null);

  return (
    <MapContainer
      center={position}
      zoom={15}
      style={{ height, width: "100%", borderRadius: "0.75rem" }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterOnChange position={position} />
      <Marker
        position={position}
        draggable
        ref={markerRef}
        eventHandlers={{
          dragend: () => {
            const marker = markerRef.current;
            if (marker) {
              const { lat, lng } = marker.getLatLng();
              onChange([lat, lng]);
            }
          },
        }}
      />
    </MapContainer>
  );
}
