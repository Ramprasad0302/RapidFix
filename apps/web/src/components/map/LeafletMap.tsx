import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { moved, type FixoraMapProps, type LatLng } from './types';

/** Map engine used when no Google Maps key is configured: Leaflet + OpenStreetMap tiles. */
const markerIcon = (kind: 'home' | 'tech') =>
  L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 12px rgb(11 31 58/.3);background:${kind === 'tech' ? '#2563EB' : '#E34948'};color:#fff;font:600 14px Inter,sans-serif">${kind === 'tech' ? '🛠' : '⌂'}</div>`,
  });

export default function LeafletMap({ center, zoom = 16, markers = [], route, fit, onMoveEnd, className, label }: FixoraMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const lastCenter = useRef<LatLng>(center);
  const onMoveEndRef = useRef(onMoveEnd);
  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);

  // Create once.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('moveend', () => {
      const c = m.getCenter();
      lastCenter.current = { lat: c.lat, lng: c.lng };
      onMoveEndRef.current?.(lastCenter.current);
    });
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; later props are applied below
  }, []);

  // Follow external centre changes (GPS, search result).
  useEffect(() => {
    if (map.current && moved(center, lastCenter.current)) {
      lastCenter.current = center;
      map.current.setView([center.lat, center.lng], map.current.getZoom());
    }
  }, [center]);

  // Markers + route.
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const mk of markers) {
      const marker = L.marker([mk.lat, mk.lng], { icon: markerIcon(mk.kind), title: mk.title ?? '' }).addTo(g);
      if (mk.title) {
        // Titles can contain user-entered names: pass a text node, never an HTML string.
        const label = document.createElement('span');
        label.textContent = mk.title;
        marker.bindTooltip(label);
      }
    }
    if (route && markers.length >= 2) {
      const pts = markers.slice(0, 2).map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(pts, { color: '#2563EB', weight: 4, dashArray: '8 8' }).addTo(g);
      m.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    } else if (fit && markers.length >= 2) {
      m.fitBounds(L.latLngBounds(markers.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 14 });
    }
  }, [markers, route, fit]);

  return <div ref={el} className={className} role="application" aria-label={label} />;
}
