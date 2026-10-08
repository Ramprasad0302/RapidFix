import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react';
import type { GeoPlaceDto } from '@fixora/shared-types';
import { Alert, Button, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { adminModulesApi, geoApi } from '../../../lib/endpoints';
import { toast } from '../../../store/toast';
import { STATES } from '../../customer/components/AddressForm';
import { Field, inputCls } from './kit';

/**
 * Add a town / locality RapidFix serves: search it on the map, set the radius,
 * optionally hand it to a franchise. Bookings inside the radius are accepted.
 */
export function AddLocalityDialog({
  open,
  onClose,
  franchiseId = null,
  onCreated,
}: {
  open: boolean;
  onClose(): void;
  /** Attach the new locality to this franchise straight away. */
  franchiseId?: string | null;
  onCreated?(id: string): void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<GeoPlaceDto | null>(null);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('Andhra Pradesh');
  const [radius, setRadius] = useState('10');
  const searchRef = useRef<HTMLInputElement>(null);
  // <dialog> opens after render, so focus the search box once it's shown.
  useEffect(() => {
    if (!open || picked) return;
    const t = setTimeout(() => searchRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, picked]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({ queryKey: ['geo', 'search', debounced], queryFn: () => geoApi.search(debounced), enabled: debounced.length >= 3 && !picked, staleTime: 60_000 });

  const pick = async (p: GeoPlaceDto) => {
    setPicked(p);
    setName(p.title.split(',')[0]!.trim());
    const a = await geoApi.reverse(p.latitude, p.longitude).catch(() => null);
    if (a?.district) setDistrict(a.district);
    if (a?.state && STATES.includes(a.state)) setState(a.state);
  };

  const reset = () => {
    setQuery('');
    setPicked(null);
    setName('');
    setDistrict('');
    setRadius('10');
  };
  const close = () => {
    reset();
    onClose();
  };

  const r = Number(radius);
  const valid = !!picked && name.trim().length >= 2 && district.trim().length >= 2 && r >= 1 && r <= 100;
  const save = useMutation({
    mutationFn: () =>
      adminModulesApi.createLocality({ name: name.trim(), district: district.trim(), state, latitude: picked!.latitude, longitude: picked!.longitude, radiusKm: r, isActive: true, franchiseId }),
    onSuccess: (l) => {
      toast(`${name.trim()} added — bookings within ${r} km are accepted`);
      void qc.invalidateQueries({ queryKey: ['admin', 'service-area'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'franchises'] });
      onCreated?.(l.id);
      close();
    },
  });

  return (
    <Dialog
      variant="center"
      open={open}
      onClose={close}
      title="Add a locality"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Add locality
          </Button>
        </div>
      }
    >
      {!picked ? (
        <>
          <Field label="Find the town, village or area" hint="Type at least 3 letters, e.g. Tadepalligudem">
            <span className="relative block">
              <Search className="pointer-events-none absolute top-3 left-3 size-4.5 text-slate-400" aria-hidden />
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a place" className={cx(inputCls, 'pl-9')} />
            </span>
          </Field>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {results.data?.map((p) => (
              <li key={`${p.latitude},${p.longitude}`}>
                <button type="button" onClick={() => void pick(p)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50">
                  <MapPin className="mt-0.5 size-4.5 shrink-0 text-fixora-blue" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{p.title}</span>
                    <span className="block truncate text-xs text-slate-500">{p.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
            {results.isFetching && <li className="px-2 py-2 text-sm text-slate-500">Searching…</li>}
            {results.data?.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">No places found. Try the town name with the district.</li>}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="flex items-center justify-between rounded-xl bg-fixora-blue-soft px-3 py-2 text-sm text-slate-700">
            <span className="min-w-0 truncate">
              <MapPin className="mr-1 inline size-4 text-fixora-blue" aria-hidden />
              {picked.subtitle || picked.title}
            </span>
            <button type="button" onClick={reset} className="ml-2 shrink-0 font-semibold text-fixora-blue">
              Change
            </button>
          </p>
          <Field label="Locality name (shown to customers)">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="District">
              <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputCls} />
            </Field>
            <Field label="State">
              <select value={state} onChange={(e) => setState(e.target.value)} className={inputCls}>
                {STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Service radius (km)" hint="Bookings within this distance of the map point are accepted.">
            <input type="number" min={1} max={100} value={radius} onChange={(e) => setRadius(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}
      {save.error && <Alert className="mt-3">{(save.error as Error).message}</Alert>}
    </Dialog>
  );
}
