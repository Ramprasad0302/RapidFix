import { useMemo } from 'react';
import { FixoraMap, type LatLng, type MapMarker } from './map/FixoraMap';

/** Technician → customer map with an ETA pill (Google Maps or OpenStreetMap). */
export function TrackingMap({ from, to, etaMinutes, distanceKm }: { from: LatLng | null; to: LatLng; etaMinutes: number | null; distanceKm: number | null }) {
  const markers = useMemo<MapMarker[]>(() => (from ? [{ ...from, kind: 'tech' }, { ...to, kind: 'home' }] : [{ ...to, kind: 'home' }]), [from, to]);
  return (
    <div className="relative isolate overflow-hidden rounded-2xl">
      <FixoraMap center={from ?? to} zoom={14} markers={markers} route={!!from} className="h-52 w-full" label="Map showing the technician and your address" />
      {(etaMinutes != null || distanceKm != null) && (
        <span className="pointer-events-none absolute top-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-fixora-navy px-3 py-1 text-xs font-semibold text-white shadow-raised">
          {etaMinutes != null ? `${etaMinutes} min away` : `${distanceKm} km away`}
        </span>
      )}
    </div>
  );
}
