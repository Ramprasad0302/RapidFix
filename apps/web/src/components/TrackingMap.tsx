import { useEffect, useRef, useState } from 'react';
import { House, Truck } from 'lucide-react';
import { GOOGLE_MAPS_KEY } from '../lib/config';

interface Point {
  lat: number;
  lng: number;
}

// Minimal typing for the parts of the Google Maps JS API used here.
export interface GMap {
  fitBounds(b: unknown, padding?: number): void;
  getCenter(): { lat(): number; lng(): number };
}
export interface GoogleMapsNS {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
    Marker: new (opts: Record<string, unknown>) => unknown;
    Polyline: new (opts: Record<string, unknown>) => unknown;
    LatLngBounds: new () => { extend(p: Point): void };
  };
}
declare global {
  interface Window {
    google?: GoogleMapsNS;
  }
}

let loader: Promise<GoogleMapsNS> | null = null;
export function loadGoogleMaps(): Promise<GoogleMapsNS> {
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

/**
 * Technician → customer map. Uses Google Maps when VITE_GOOGLE_MAPS_API_KEY is
 * set; otherwise shows a simple distance/ETA panel (no fake map tiles).
 */
export function TrackingMap({ from, to, etaMinutes, distanceKm }: { from: Point | null; to: Point; etaMinutes: number | null; distanceKm: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !ref.current) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !ref.current) return;
        const map = new g.maps.Map(ref.current, { center: to, zoom: 14, disableDefaultUI: true, gestureHandling: 'cooperative' });
        new g.maps.Marker({ position: to, map, title: 'Your address' });
        if (from) {
          new g.maps.Marker({ position: from, map, title: 'Technician' });
          new g.maps.Polyline({ path: [from, to], map, strokeColor: '#2563EB', strokeWeight: 4 });
          const bounds = new g.maps.LatLngBounds();
          bounds.extend(from);
          bounds.extend(to);
          map.fitBounds(bounds, 48);
        }
      })
      .catch(() => setMapError(true));
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const eta = etaMinutes != null ? `${etaMinutes} min away` : null;

  if (GOOGLE_MAPS_KEY && !mapError) {
    return (
      <div className="relative h-52 overflow-hidden rounded-2xl bg-slate-100">
        <div ref={ref} className="h-full w-full" role="img" aria-label="Map showing the technician and your address" />
        {eta && <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-fixora-navy px-3 py-1 text-xs font-semibold text-white">{eta}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4" role="img" aria-label={`Technician ${distanceKm ?? '?'} km from your address`}>
      <span className="flex size-11 items-center justify-center rounded-full bg-fixora-blue text-white">
        <Truck className="size-5" />
      </span>
      <div className="relative h-1 flex-1 rounded-full bg-fixora-blue/20">
        <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-fixora-blue" />
        {eta && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-fixora-navy px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white">
            {eta}
          </span>
        )}
        {distanceKm != null && <span className="absolute top-2.5 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap text-slate-500">{distanceKm} km</span>}
      </div>
      <span className="flex size-11 items-center justify-center rounded-full bg-danger text-white">
        <House className="size-5" />
      </span>
    </div>
  );
}
