import { useMemo, useState } from 'react';
import { Check, LocateFixed, MapPin, Search } from 'lucide-react';
import { haversineKm } from '@fixora/shared-utils';
import { Alert, cx, Spinner } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { ErrorState, Skeleton } from '../../../components/States';
import { requestCurrentPosition, useLocationStore } from '../../../store/location';
import { useLocations } from '../queries';

/** Pick a service town, or (only on tap) use GPS and snap to the nearest town. */
export function LocationPicker({ open, onClose }: { open: boolean; onClose(): void }) {
  const locations = useLocations();
  const { selected, select } = useLocationStore();
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const filtered = useMemo(
    () => (locations.data ?? []).filter((l) => `${l.name} ${l.district}`.toLowerCase().includes(q.trim().toLowerCase())),
    [locations.data, q],
  );

  async function locateMe() {
    setGpsError(null);
    setLocating(true);
    try {
      const { latitude, longitude } = await requestCurrentPosition();
      const nearest = (locations.data ?? [])
        .map((l) => ({ l, d: haversineKm(latitude, longitude, l.latitude, l.longitude) }))
        .sort((a, b) => a.d - b.d)[0];
      select({
        label: nearest && nearest.d < 25 ? `${nearest.l.name}, ${nearest.l.stateCode}` : 'Current location',
        latitude,
        longitude,
        source: 'gps',
      });
      onClose();
    } catch (e) {
      setGpsError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Choose your location">
      <button
        onClick={() => void locateMe()}
        disabled={locating}
        className="flex w-full items-center gap-3 rounded-xl border border-fixora-blue/30 bg-fixora-blue-soft px-4 py-3.5 text-left font-semibold text-fixora-blue"
      >
        {locating ? <Spinner className="size-5" /> : <LocateFixed className="size-5" aria-hidden />}
        Use my current location
      </button>
      {gpsError && <Alert className="mt-3">{gpsError}</Alert>}

      <div className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-slate-100 px-3">
        <Search className="size-4 text-slate-500" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your town"
          aria-label="Search your town"
          className="h-full flex-1 bg-transparent text-[15px] outline-none"
        />
      </div>

      <p className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">We serve</p>
      {locations.isPending && <Skeleton className="h-40" />}
      {locations.isError && <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />}
      <ul className="divide-y divide-slate-100">
        {filtered.map((l) => {
          const label = `${l.name}, ${l.stateCode}`;
          const active = selected?.label === label;
          return (
            <li key={l.id}>
              <button
                onClick={() => {
                  select({ label, latitude: l.latitude, longitude: l.longitude, source: 'town' });
                  onClose();
                }}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <MapPin className={cx('size-5', active ? 'text-fixora-blue' : 'text-slate-400')} aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium text-slate-900">{l.name}</span>
                  <span className="block text-xs text-slate-500">
                    {l.district}, {l.state}
                  </span>
                </span>
                {active && <Check className="size-5 text-fixora-blue" aria-label="Selected" />}
              </button>
            </li>
          );
        })}
      </ul>
      {locations.isSuccess && filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">FIXORA isn’t in “{q}” yet. We’re expanding soon.</p>
      )}
    </Dialog>
  );
}
