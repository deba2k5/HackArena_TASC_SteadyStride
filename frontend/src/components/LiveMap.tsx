import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";

// Fix default marker icons under Vite bundling
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-expect-error - internal default merge
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  accent?: boolean;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function LiveMap({
  points,
  center,
  geofenceRadius,
  height = 380,
}: {
  points: MapPoint[];
  center?: [number, number];
  geofenceRadius?: number;
  height?: number;
}) {
  const fallback: [number, number] = [46.8182, 8.2275]; // Switzerland
  const view = center || (points[0] ? [points[0].lat, points[0].lng] : fallback);

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border">
      <MapContainer center={view} zoom={center ? 16 : 7} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
        />
        <Recenter center={view as [number, number]} />
        {center && geofenceRadius && (
          <Circle
            center={center}
            radius={geofenceRadius}
            pathOptions={{ color: "hsl(354 78% 49%)", fillOpacity: 0.08 }}
          />
        )}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            {p.label && <Popup>{p.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
