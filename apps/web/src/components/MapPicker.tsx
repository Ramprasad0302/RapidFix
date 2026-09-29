import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button, cx } from '@fixora/ui';
import { loadGoogleMaps, type GMap } from './TrackingMap';

/** Drag the map under a fixed centre pin, then confirm — "Choose on Map". Needs a Google Maps key. */
export function MapPicker({
  initial,
  onPick,
  className,
}: {
  initial: { latitude: number; longitude: number } | null;
  onPick(p: { latitude: number; longitude: number }): void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !el.current) return;
        map.current = new g.maps.Map(el.current, {
          center: { lat: initial?.latitude ?? 16.7547, lng: initial?.longitude ?? 81.6818 },
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
        });
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
    };
    // Initialise once; later `initial` changes shouldn't recentre while the user is dragging.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className={cx('rounded-xl bg-danger-soft p-3 text-sm text-danger', className)}>Map could not load. Please enter the address manually.</p>;

  return (
    <div className={className}>
      <div className="relative h-64 overflow-hidden rounded-2xl bg-slate-100">
        <div ref={el} className="h-full w-full" role="application" aria-label="Map — drag to position the pin on your home" />
        <MapPin className="pointer-events-none absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-full fill-danger text-white drop-shadow" aria-hidden />
      </div>
      <Button
        type="button"
        variant="secondary"
        fullWidth
        className="mt-2"
        onClick={() => {
          const c = map.current?.getCenter();
          if (c) onPick({ latitude: c.lat(), longitude: c.lng() });
        }}
      >
        Use this location
      </Button>
    </div>
  );
}
