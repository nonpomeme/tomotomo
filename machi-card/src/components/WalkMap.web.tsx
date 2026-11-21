// Web 版の地図（Leaflet + OpenStreetMap タイル）

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import type { WalkMapProps } from './WalkMap.types';

function FitView({ points, follow }: { points: [number, number][]; follow: boolean }) {
  const map = useMap();
  const last = points[points.length - 1];
  useEffect(() => {
    if (points.length === 0) return;
    if (follow && last) {
      map.setView(last, Math.max(map.getZoom(), 16));
    } else if (points.length === 1) {
      map.setView(points[0], 16);
    } else {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [24, 24], maxZoom: 17 });
    }
    // 点が増えるたび（散歩中は追従）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, points.length, follow, last?.[0], last?.[1]]);
  return null;
}

export default function WalkMap({ route, pins, station, height = 320, follow = false }: WalkMapProps) {
  const line = useMemo(() => route.map((p) => [p.lat, p.lon] as [number, number]), [route]);
  const allPoints = useMemo(() => {
    const pts = [...line, ...pins.map((p) => [p.lat, p.lon] as [number, number])];
    if (!follow && station?.lat != null && station?.lon != null) pts.push([station.lat, station.lon]);
    return pts;
  }, [line, pins, station, follow]);

  const center: LatLngExpression = allPoints[0] ?? [35.681, 139.767];
  const start = line[0];

  return (
    <View style={{ height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e8e4da' }}>
      <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2f6f4f', weight: 5, opacity: 0.85 }} />}
        {start && (
          <CircleMarker center={start} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2f6f4f', fillOpacity: 1 }}>
            <Tooltip>スタート</Tooltip>
          </CircleMarker>
        )}
        {follow && line.length > 0 && (
          <CircleMarker center={line[line.length - 1]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2b6cb0', fillOpacity: 1 }}>
            <Tooltip>現在地</Tooltip>
          </CircleMarker>
        )}
        {pins.map((p, i) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lon]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#d9534f', fillOpacity: 0.95 }}
          >
            <Popup>
              <b>ピン {i + 1}</b>
              <br />
              {p.memo || '（メモなし）'}
            </Popup>
          </CircleMarker>
        ))}
        {station?.lat != null && station?.lon != null && (
          <CircleMarker center={[station.lat, station.lon]} radius={8} pathOptions={{ color: '#333', weight: 2, fillColor: '#f0c040', fillOpacity: 1 }}>
            <Tooltip>{station.name}</Tooltip>
          </CircleMarker>
        )}
        <FitView points={allPoints} follow={follow} />
      </MapContainer>
    </View>
  );
}
