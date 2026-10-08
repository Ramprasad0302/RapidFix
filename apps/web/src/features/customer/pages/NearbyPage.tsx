import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, MapPin, Star } from 'lucide-react';
import { Button, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { PageHeader } from '../../../components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { useLocationStore } from '../../../store/location';
import { MobileShell } from '../CustomerTabsLayout';
import { LocationPicker } from '../components/LocationPicker';

/** How far the full list looks (the home screen shows the closest few). */
const RADIUS_KM = 30;

/** "Technicians near you": every verified professional online around the selected location, nearest first. */
export function NearbyPage() {
  const selected = useLocationStore((s) => s.selected);
  const [picking, setPicking] = useState(false);
  const [type, setType] = useState<string | null>(null);
  const nearby = useQuery({
    queryKey: ['nearby', 'all', selected?.latitude, selected?.longitude],
    queryFn: () => catalogApi.nearby(selected!.latitude, selected!.longitude, { radiusKm: RADIUS_KM, limit: 20 }),
    enabled: !!selected,
    staleTime: 60_000,
  });

  const types = [...new Set((nearby.data ?? []).map((t) => t.title))];
  const list = (nearby.data ?? []).filter((t) => !type || t.title === type);

  return (
    <MobileShell>
      <PageHeader title="Technicians Near You" backTo="/" />
      <main className="px-4 pb-10">
        <button
          onClick={() => setPicking(true)}
          className="flex w-full items-center gap-2 rounded-2xl bg-fixora-blue-soft/70 px-3.5 py-3 text-left text-sm text-slate-700"
        >
          <MapPin className="size-5 shrink-0 fill-fixora-blue text-white" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{selected ? <>Near <b className="text-slate-900">{selected.label}</b></> : 'Choose your location'}</span>
          <span className="font-semibold text-fixora-blue">Change</span>
        </button>

        {!selected && (
          <EmptyState title="Where are you?" body="Set your location to see verified technicians near you." action={<Button onClick={() => setPicking(true)}>Select location</Button>} />
        )}

        {selected && nearby.isPending && (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        )}
        {nearby.isError && !nearby.data && <ErrorState error={nearby.error} onRetry={() => void nearby.refetch()} className="py-10" />}
        {nearby.isSuccess && nearby.data.length === 0 && (
          <EmptyState
            title="No technician online nearby right now"
            body="Book anyway — we'll assign the next available verified expert near you."
            action={
              <Link to="/book">
                <Button>Book a service</Button>
              </Link>
            }
          />
        )}

        {types.length > 1 && (
          <div className="scroll-row -mx-4 mt-4 gap-2 px-4" role="tablist" aria-label="Type of technician">
            {[null, ...types].map((t) => (
              <button
                key={t ?? 'all'}
                role="tab"
                aria-selected={type === t}
                onClick={() => setType(t)}
                className={cx(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium',
                  type === t ? 'border-fixora-blue bg-fixora-blue text-white' : 'border-slate-200 bg-white text-slate-700',
                )}
              >
                {t ?? `All (${nearby.data?.length ?? 0})`}
              </button>
            ))}
          </div>
        )}

        {!!list.length && (
          <ul className="mt-4 flex flex-col gap-3">
            {list.map((t) => (
              <li key={t.id}>
                <Link
                  to={t.categorySlug ? `/book/c/${t.categorySlug}` : '/book'}
                  className="flex items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-card"
                >
                  <Avatar name={t.name} src={t.avatarUrl} size={64} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-[17px] font-semibold text-slate-900">
                      {t.name} <BadgeCheck className="size-4.5 shrink-0 text-fixora-blue" aria-label="Verified" />
                    </p>
                    <p className="text-sm text-slate-500">
                      {t.title}
                      {t.experienceYears > 0 && ` · ${t.experienceYears} yr${t.experienceYears === 1 ? '' : 's'} exp.`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-700">
                      <span className="flex items-center gap-1">
                        <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                        {t.ratingAvg.toFixed(1)} <span className="text-slate-500">({t.ratingCount})</span>
                      </span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
                        <span className="size-2.5 rounded-full bg-success" aria-hidden /> {t.distanceKm} km away
                      </span>
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-fixora-blue-soft px-3 py-1.5 text-sm font-semibold text-fixora-blue">
                    Book <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!!list.length && <p className="mt-4 text-center text-xs text-slate-500">Showing verified technicians online within {RADIUS_KM} km. The nearest free one gets your booking first.</p>}
      </main>
      <LocationPicker open={picking} onClose={() => setPicking(false)} />
    </MobileShell>
  );
}
