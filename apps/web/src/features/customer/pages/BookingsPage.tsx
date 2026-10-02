import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Search, X } from 'lucide-react';
import { cx } from '@fixora/ui';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { customerApi, type BookingTabParam } from '../../../lib/endpoints';
import { useAuth } from '../../../store/auth';
import { BookingCard } from '../components/BookingCard';
import { NeedHelpCard } from '../components/NeedHelpCard';

const TABS: { key: BookingTabParam; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function BookingsPage() {
  const status = useAuth((s) => s.status);
  const [tab, setTab] = useState<BookingTabParam>('all');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');

  const bookings = useQuery({
    queryKey: ['customer', 'bookings', tab],
    queryFn: () => customerApi.bookings(tab),
    enabled: status === 'authenticated',
    // Light polling keeps live statuses fresh until sockets arrive (Phase 7).
    refetchInterval: 30_000,
  });

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (bookings.data ?? []).filter((b) => !term || `${b.service.name} ${b.code}`.toLowerCase().includes(term));
  }, [bookings.data, q]);

  return (
    <main className="px-4 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-8 lg:py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-slate-900 lg:text-4xl">My Bookings</h1>
          <p className="mt-0.5 text-[15px] text-slate-500">Track and manage your service bookings</p>
        </div>
        {status === 'authenticated' && (
          <button onClick={() => setSearching((v) => !v)} aria-label={searching ? 'Close search' : 'Search bookings'} className="mt-1 flex size-10 items-center justify-center rounded-full hover:bg-slate-100">
            {searching ? <X className="size-6" /> : <Search className="size-6" />}
          </button>
        )}
      </div>

      {status === 'guest' && (
        <EmptyState
          art={
            <span className="flex size-16 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
              <CalendarDays className="size-8" />
            </span>
          }
          title="Login to see your bookings"
          body="Track your technician, reschedule or cancel — all in one place."
          action={
            <Link to="/login?redirect=/bookings" className="inline-flex h-12 items-center rounded-xl bg-fixora-blue px-6 font-semibold text-white">
              Login / Sign Up
            </Link>
          }
        />
      )}

      {status === 'authenticated' && (
        <>
          {searching && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by service or booking ID"
              aria-label="Search bookings"
              className="mt-4 h-11 w-full rounded-xl bg-slate-100 px-4 text-[15px] outline-none"
            />
          )}
          <div role="tablist" aria-label="Booking status" className="scroll-row -mx-4 mt-5 gap-2 px-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx(
                  'h-11 shrink-0 rounded-xl px-4 text-[15px] font-medium transition-colors',
                  tab === t.key ? 'bg-fixora-blue text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <section className="mt-5 flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:gap-5 xl:grid-cols-3" aria-live="polite">
            {bookings.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)}
            {bookings.isError && !bookings.data && <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />}
            {bookings.isSuccess && visible.length === 0 && (
              <EmptyState
                art={
                  <span className="flex size-16 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
                    <CalendarDays className="size-8" />
                  </span>
                }
                title={q ? 'No matching bookings' : "You don't have any bookings yet."}
                body={q ? undefined : 'Book a verified professional in a few taps.'}
                action={
                  !q && (
                    <Link to="/book" className="inline-flex h-12 items-center rounded-xl bg-fixora-blue px-6 font-semibold text-white">
                      Book a Service
                    </Link>
                  )
                }
              />
            )}
            {visible.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </section>
        </>
      )}

      <div className="mt-6">
        <NeedHelpCard />
      </div>
    </main>
  );
}
