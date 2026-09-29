import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, ChevronRight, House, LocateFixed, MapPin, Search } from 'lucide-react';
import { cx, Spinner } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { Skeleton } from '../../../components/States';
import { customerApi, geoApi } from '../../../lib/endpoints';
import { addressLines } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { confirmLocationPath, useLocationStore } from '../../../store/location';
import { useLocations } from '../queries';

const LABEL_ICON = { HOME: House, WORK: Briefcase, OTHER: MapPin } as const;

/**
 * "Select a location" sheet (Swiggy/Zomato style): current location, search by
 * area/street, saved addresses, or a town we serve.
 */
export function LocationPicker({ open, onClose, from = '/' }: { open: boolean; onClose(): void; from?: string }) {
  const navigate = useNavigate();
  const authed = useAuth((s) => s.status === 'authenticated' && s.user?.role === 'CUSTOMER');
  const { selected, select } = useLocationStore();
  const locations = useLocations();
  const saved = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: open && authed });
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const near = selected ? { lat: selected.latitude, lng: selected.longitude } : undefined;
  const places = useQuery({
    queryKey: ['geo', 'search', debounced, near?.lat, near?.lng],
    queryFn: () => geoApi.search(debounced, near),
    enabled: open && debounced.length >= 3,
    staleTime: 10 * 60_000,
  });
  const towns = useMemo(
    () => (locations.data ?? []).filter((l) => !q || `${l.name} ${l.district}`.toLowerCase().includes(q.trim().toLowerCase())),
    [locations.data, q],
  );

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Select a location">
      <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-fixora-blue">
        <Search className="size-5 text-fixora-blue" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for area, street name..."
          aria-label="Search for area or street"
          className="h-full flex-1 bg-transparent text-[15px] outline-none"
        />
        {places.isFetching && <Spinner className="size-4 text-slate-400" />}
      </div>

      <button onClick={() => go(confirmLocationPath({ from, gps: true }))} className="mt-3 flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
        <LocateFixed className="size-5 text-fixora-blue" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold text-fixora-blue">Use current location</span>
          <span className="block text-xs text-slate-500">Using GPS · we’ll auto-fill your street and area</span>
        </span>
        <ChevronRight className="size-5 text-slate-400" aria-hidden />
      </button>

      {debounced.length >= 3 && (
        <section className="border-t border-slate-100 pt-2">
          <p className="py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Search results</p>
          {places.isError && <p className="py-2 text-sm text-danger">{places.error.message}</p>}
          {places.isSuccess && places.data.length === 0 && <p className="py-2 text-sm text-slate-500">No places found. Try a nearby landmark or town.</p>}
          <ul>
            {places.data?.map((p) => (
              <li key={`${p.latitude},${p.longitude}`}>
                <button onClick={() => go(confirmLocationPath({ from, lat: p.latitude, lng: p.longitude }))} className="flex w-full items-start gap-3 py-2.5 text-left">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{p.title}</span>
                    <span className="line-clamp-2 block text-xs text-slate-500">{p.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {authed && !!saved.data?.length && !debounced && (
        <section className="border-t border-slate-100 pt-2">
          <p className="py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Saved addresses</p>
          <ul>
            {saved.data.map((a) => {
              const Icon = LABEL_ICON[a.label];
              const active = selected?.addressId === a.id;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => {
                      select({
                        label: [a.area, a.villageTown].filter(Boolean).join(', '),
                        latitude: a.latitude ?? selected?.latitude ?? locations.data?.[0]?.latitude ?? 0,
                        longitude: a.longitude ?? selected?.longitude ?? locations.data?.[0]?.longitude ?? 0,
                        source: 'saved',
                        addressId: a.id,
                        address: a,
                      });
                      onClose();
                    }}
                    className={cx('flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left', active && 'bg-fixora-blue-soft/60')}
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-fixora-blue" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{a.label[0] + a.label.slice(1).toLowerCase()}</span>
                      <span className="line-clamp-2 block text-xs text-slate-500">{addressLines(a).join(', ')}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!debounced && (
        <section className="border-t border-slate-100 pt-2">
          <p className="py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Towns we serve</p>
          {locations.isPending && <Skeleton className="h-24" />}
          <ul className="grid grid-cols-2 gap-2">
            {towns.map((l) => (
              <li key={l.id}>
                <button onClick={() => go(confirmLocationPath({ from, lat: l.latitude, lng: l.longitude }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:border-fixora-blue">
                  <span className="block text-sm font-medium text-slate-900">{l.name}</span>
                  <span className="block truncate text-xs text-slate-500">{l.district}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
