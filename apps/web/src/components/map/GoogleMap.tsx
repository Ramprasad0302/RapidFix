import { useEffect, useRef, useState } from 'react';
import { GOOGLE_MAPS_KEY } from '../../lib/config';
import { moved, type FixoraMapProps, type LatLng } from './types';

// Minimal typing for the Google Maps JS API surface used here.
interface GLatLng {
  lat(): number;
  lng(): number;
}
interface GMap {
  getCenter(): GLatLng;
  getZoom(): number;
  panTo(p: LatLng): void;
  fitBounds(b: unknown, padding?: number): void;
  addListener(event: string, fn: () => void): void;
}
interface GOverlay {
  setMap(m: GMap | null): void;
}
interface GoogleNS {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => GOverlay;
    Polyline: new (opts: Record<string, unknown>) => GOverlay;
    LatLngBounds: new () => { extend(p: LatLng): void };
  };
}
declare global {
  interface Window {
    google?: GoogleNS;
  }
}

let loader: Promise<GoogleNS> | null = null;
function loadGoogleMaps(): Promise<GoogleNS> {
  if (window.google?.maps) return Promise.resolve(window.google);
  loader ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly`;
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error('Maps failed to load')));
    s.onerror = () => reject(new Error('Maps failed to load'));
    document.head.appendChild(s);
  });
  return loader;
}

/** Map engine when VITE_GOOGLE_MAPS_API_KEY is set. */
export default function GoogleMap({ center, zoom = 16, markers = [], route, onMoveEnd, className, label }: FixoraMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const g = useRef<GoogleNS | null>(null);
  const overlays = useRef<GOverlay[]>([]);
  const lastCenter = useRef<LatLng>(center);
  const onMoveEndRef = useRef(onMoveEnd);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
  }, [onMoveEnd]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !el.current) return;
        g.current = google;
        const m = new google.maps.Map(el.current, { center, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' });
        m.addListener('idle', () => {
          const c = m.getCenter();
          lastCenter.current = { lat: c.lat(), lng: c.lng() };
          onMoveEndRef.current?.(lastCenter.current);
        });
        map.current = m;
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once
  }, []);

  useEffect(() => {
    if (map.current && moved(center, lastCenter.current)) {
      lastCenter.current = center;
      map.current.panTo(center);
    }
  }, [center, ready]);

  useEffect(() => {
    const m = map.current;
    const google = g.current;
    if (!m || !google) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = markers.map((mk) => new google.maps.Marker({ position: mk, map: m, title: mk.kind === 'tech' ? 'Technician' : 'Service address' }));
    if (route && markers.length >= 2) {
      overlays.current.push(new google.maps.Polyline({ path: markers.slice(0, 2), map: m, strokeColor: '#2563EB', strokeWeight: 4 }));
      const b = new google.maps.LatLngBounds();
      markers.slice(0, 2).forEach((p) => b.extend(p));
      m.fitBounds(b, 48);
    }
  }, [markers, route, ready]);

  if (error) return <div className={`${className} flex items-center justify-center bg-slate-100 text-sm text-slate-500`}>Map could not load.</div>;
  return <div ref={el} className={className} role="application" aria-label={label} />;
}
