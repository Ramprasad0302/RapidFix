import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2 } from 'lucide-react';
import type { TechnicianJobDto } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { technicianApi, type TechnicianTabParam } from '../../../lib/endpoints';
import { dayKey, formatDayHeading } from '../../../lib/format';
import { JobCard } from '../components/JobCard';
import { TechHeader } from '../components/TechHeader';

const TABS: { key: TechnicianTabParam; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'inProgress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function JobsPage() {
  const [tab, setTab] = useState<TechnicianTabParam>('all');
  const jobs = useQuery({ queryKey: ['tech', 'jobs', tab], queryFn: () => technicianApi.jobs(tab), refetchInterval: 30_000 });

  // Group by calendar day: "Today, 29 Sep 2026", "Tomorrow, …".
  const groups = new Map<string, TechnicianJobDto[]>();
  for (const j of jobs.data?.items ?? []) {
    const k = dayKey(j.scheduledFor);
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }

  return (
    <>
      <TechHeader />
      <main className="px-4 lg:mx-auto lg:max-w-5xl lg:px-8 lg:pt-8">
        <h1 className="text-[28px] font-bold text-slate-900">My Bookings</h1>
        <p className="text-[15px] text-slate-500">View and manage your assigned bookings.</p>

        <div role="tablist" className="scroll-row -mx-4 mt-4 gap-2 px-4">
          {TABS.map((t) => {
            const count = t.key !== 'all' && (t.key === 'upcoming' || t.key === 'inProgress') ? jobs.data?.counts[t.key] : undefined;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx('h-10 shrink-0 rounded-lg px-3.5 text-sm font-medium', tab === t.key ? 'bg-fixora-blue text-white' : 'bg-slate-100 text-slate-700')}
              >
                {t.label}
                {count ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-5">
          {jobs.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28" />)}
          {jobs.isError && <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />}
          {jobs.isSuccess && jobs.data.items.length === 0 && <EmptyState art={<CalendarCheck2 className="size-10 text-slate-300" />} title="No bookings here" />}
          {[...groups.entries()].map(([k, items]) => (
            <section key={k}>
              <h2 className="mb-2.5 text-[17px] font-semibold text-slate-900">{formatDayHeading(items[0]!.scheduledFor)}</h2>
              <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-4">
                {items.map((j) => (
                  <JobCard key={j.id} job={j} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
