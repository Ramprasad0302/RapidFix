import { useEffect, useMemo, useState } from 'react';
import { FixoraMap, type LatLng, type MapMarker } from './map/FixoraMap';

/**
 * Live technician → customer map (Google Maps or OpenStreetMap) with the ETA and
 * a "Live · updated Xs ago" badge. Positions arrive over the socket every ~5 s
 * while the technician travels.
 */
export function TrackingMap({ from, to, etaMinutes, distanceKm }: { from: LatLng | null; to: LatLng; etaMinutes: number | null; distanceKm: number | null }) {
  const markers = useMemo<MapMarker[]>(() => (from ? [{ ...from, kind: 'tech' }, { ...to, kind: 'home' }] : [{ ...to, kind: 'home' }]), [from, to]);

  // When did the last position arrive? (re-render every second for the "Xs ago" text)
  const [now, setNow] = useState(() => Date.now());
  const key = from ? `${from.lat.toFixed(5)},${from.lng.toFixed(5)}` : '';
  const [seen, setSeen] = useState<{ key: string; at: number | null }>({ key: '', at: null });
  if (key && key !== seen.key) setSeen({ key, at: now }); // a new position arrived
  const updatedAt = seen.at;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = ago != null && ago > 60;

  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-slate-200">
      <FixoraMap center={from ?? to} zoom={15} markers={markers} route={!!from} className="h-64 w-full lg:h-80" label="Live map showing the technician and your address" />
      {(etaMinutes != null || distanceKm != null) && (
        <span className="pointer-events-none absolute top-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-fixora-navy px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-white shadow-raised">
          {etaMinutes != null ? `Arriving in ~${etaMinutes} min` : `${distanceKm} km away`}
          {etaMinutes != null && distanceKm != null && <span className="font-normal text-white/70"> · {distanceKm} km</span>}
        </span>
      )}
      <span
        className="pointer-events-none absolute bottom-3 left-3 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-card"
        aria-live="polite"
      >
        <span className="relative flex size-2.5">
          {!stale && from && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />}
          <span className={`relative inline-flex size-2.5 rounded-full ${from && !stale ? 'bg-success' : 'bg-slate-400'}`} />
        </span>
        {!from ? 'Waiting for technician location…' : stale ? `Last seen ${Math.round(ago / 60)} min ago` : `LIVE · updated ${ago ?? 0}s ago`}
      </span>
    </div>
  );
}
