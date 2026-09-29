import { lazy, Suspense } from 'react';
import { cx, Spinner } from '@fixora/ui';
import { GOOGLE_MAPS_KEY } from '../../lib/config';
import type { FixoraMapProps } from './types';

// Each engine is its own chunk, loaded only when a map is actually shown.
const Engine = GOOGLE_MAPS_KEY ? lazy(() => import('./GoogleMap')) : lazy(() => import('./LeafletMap'));

/** Google Maps when a key is configured, otherwise OpenStreetMap (Leaflet). */
export function FixoraMap(props: FixoraMapProps) {
  return (
    <Suspense
      fallback={
        <div className={cx(props.className, 'flex items-center justify-center bg-slate-100 text-fixora-blue')}>
          <Spinner className="size-6" />
        </div>
      }
    >
      <Engine {...props} />
    </Suspense>
  );
}

export type { LatLng, MapMarker } from './types';
