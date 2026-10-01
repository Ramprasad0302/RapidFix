import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { serviceAreaApi } from '../lib/endpoints';
import { useLocationStore } from '../store/location';
import { NotServedSheet } from './NotServedSheet';

/** Home-page notice when the chosen location is outside the area we serve. */
export function ServiceAreaBanner() {
  const selected = useLocationStore((s) => s.selected);
  const [open, setOpen] = useState(false);
  const lat = selected?.latitude;
  const lng = selected?.longitude;
  const check = useQuery({
    queryKey: ['service-area', lat?.toFixed(3), lng?.toFixed(3)],
    queryFn: () => serviceAreaApi.check(lat!, lng!),
    enabled: lat != null && lng != null,
    staleTime: 10 * 60_000,
  });
  if (!check.data || check.data.served) return null;
  const place = selected?.label?.split(',').at(-1)?.trim() || selected?.label;
  return (
    <>
      <section className="flex items-center gap-3 rounded-2xl border border-fixora-blue/20 bg-gradient-to-r from-fixora-blue-soft to-sky-50 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fixora-blue text-white">
          <Rocket className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Not yet in {place || 'your area'} — coming very soon!</p>
          <p className="text-sm text-slate-600">We serve {check.data.areas.map((a) => `${a.name} (${a.radiusKm} km)`).join(', ') || 'Tanuku'} today.</p>
        </div>
        <button onClick={() => setOpen(true)} className="shrink-0 rounded-xl bg-fixora-blue px-3.5 py-2 text-sm font-semibold text-white hover:bg-fixora-blue-dark">
          I'm interested
        </button>
      </section>
      <NotServedSheet open={open} onClose={() => setOpen(false)} check={check.data} place={place} point={lat != null && lng != null ? { lat, lng } : null} />
    </>
  );
}
