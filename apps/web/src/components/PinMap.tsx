import { useMemo } from 'react';
import { ExternalLink, Navigation } from 'lucide-react';
import { FixoraMap, type MapMarker } from './map/FixoraMap';

/**
 * The customer's exact pinned location (door-level when they placed the pin),
 * with one-tap turn-by-turn directions. Used by technicians and admins.
 */
export function PinMap({ lat, lng, label = 'Customer location' }: { lat: number; lng: number; label?: string }) {
  const markers = useMemo<MapMarker[]>(() => [{ lat, lng, kind: 'home', title: label }], [lat, lng, label]);
  const point = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <FixoraMap center={{ lat, lng }} zoom={17} markers={markers} className="h-48 w-full lg:h-56" label={`Map: ${label}`} />
      <div className="grid grid-cols-2 gap-2 bg-white p-2.5">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${point}&travelmode=driving`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-fixora-blue text-sm font-semibold text-white hover:bg-fixora-blue-dark"
        >
          <Navigation className="size-4 fill-current" aria-hidden /> Navigate
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${point}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="size-4" aria-hidden /> Open in Maps
        </a>
      </div>
      <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-center text-[11px] text-slate-500 tabular-nums">Pin: {point}</p>
    </div>
  );
}
