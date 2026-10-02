import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CalendarDays, ChevronRight, CircleCheck, Clock, Headset, MapPinned, ToggleRight, WalletCards } from 'lucide-react';
import type { TechnicianDashboardDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { SectionHeader } from '../../../components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { Toggle } from '../../../components/Toggle';
import { technicianApi } from '../../../lib/endpoints';
import { requestCurrentPosition } from '../../../store/location';
import { toast } from '../../../store/toast';
import { JobAlertsCard } from '../components/JobAlertsCard';
import { JobCard } from '../components/JobCard';
import { TechHeader } from '../components/TechHeader';

export function DashboardPage() {
  const dash = useQuery({ queryKey: ['tech', 'dashboard'], queryFn: technicianApi.dashboard, refetchInterval: 30_000 });
  return (
    <>
      <TechHeader />
      <main className="flex flex-col gap-5 px-4 lg:mx-auto lg:max-w-7xl lg:gap-8 lg:px-8 lg:py-10">
        {dash.isPending && (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-28" />
            <Skeleton className="h-40" />
          </>
        )}
        {dash.isError && !dash.data && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />}
        {dash.data && <Dashboard d={dash.data} />}
      </main>
    </>
  );
}

function Dashboard({ d }: { d: TechnicianDashboardDto }) {
  const qc = useQueryClient();
  const p = d.profile;
  const verified = p.verificationStatus === 'VERIFIED';

  const online = useMutation({
    mutationFn: async (next: boolean) => {
      let coords: { lat: number; lng: number } | undefined;
      if (next) {
        // Share location only when going online — used to find nearby jobs.
        coords = await requestCurrentPosition()
          .then(({ latitude, longitude }) => ({ lat: latitude, lng: longitude }))
          .catch(() => undefined);
      }
      return technicianApi.setOnline(next, coords);
    },
    onSuccess: (profile) => {
      qc.setQueryData<TechnicianDashboardDto>(['tech', 'dashboard'], (old) => (old ? { ...old, profile } : old));
      // Starts / stops the background "online for jobs" service and location sharing right away.
      void qc.invalidateQueries({ queryKey: ['tech', 'profile'] });
      toast(profile.isOnline ? 'You’re online — new requests can reach you' : 'You’re offline');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <>
      <section className="flex items-center gap-3.5 rounded-2xl bg-fixora-blue-soft/70 p-3.5">
        <Avatar name={p.name} src={p.avatarUrl} size={60} online={p.isOnline} />
        <Link to="/technician/profile" className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">{p.name}</p>
          <p className="text-sm text-slate-600">{p.title}</p>
          <span className={cx('mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', p.isOnline ? 'bg-success-soft text-success' : 'bg-slate-200 text-slate-600')}>
            <span className={cx('size-2 rounded-full', p.isOnline ? 'bg-success' : 'bg-slate-400')} /> {p.isOnline ? 'Online' : 'Offline'}
          </span>
        </Link>
        <Toggle label={p.isOnline ? 'Go offline' : 'Go online'} checked={p.isOnline} disabled={!verified || online.isPending} onChange={(v) => online.mutate(v)} />
      </section>

      <JobAlertsCard />

      {!verified && (
        <Alert tone="info">
          {p.verificationStatus === 'PENDING'
            ? 'Your profile is under verification. You can go online and accept jobs once RapidFix approves your documents.'
            : 'Your partner account needs attention. Please contact RapidFix support.'}
        </Alert>
      )}

      <section className="grid grid-cols-3 divide-x divide-white/25 rounded-2xl bg-fixora-blue p-4 text-white shadow-[0_10px_24px_rgb(37_99_235/0.3)]">
        <Stat icon={<CalendarDays className="size-5" />} label="Today’s Jobs" value={String(d.today.jobs)} />
        <Stat icon={<CircleCheck className="size-5" />} label="Completed" value={String(d.today.completed)} />
        <Stat icon={<WalletCards className="size-5" />} label="Earnings" value={formatINR(d.today.earnings)} />
      </section>

      <section>
        <SectionHeader
          title="Today’s Schedule"
          action={
            <Link to="/technician/bookings" className="text-[15px] font-medium text-fixora-blue">
              View All
            </Link>
          }
        />
        <div className="mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-4 xl:grid-cols-3">
          {d.schedule.length === 0 && (
            <EmptyState
              className="py-6"
              art={<CalendarCheck2 className="size-10 text-slate-300" />}
              title="No jobs scheduled today"
              body={p.isOnline ? 'Stay online — new requests will appear here.' : 'Go online to start receiving requests.'}
            />
          )}
          {d.schedule.map((j) => (
            <JobCard key={j.id} job={j} compact />
          ))}
        </div>
      </section>

      <Link to="/technician/bookings" className="flex items-center gap-4 rounded-2xl bg-fixora-navy p-4 text-white">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <Clock className="size-8 text-fixora-cyan" aria-hidden />
        </span>
        <span className="flex-1">
          <span className="block text-[17px] font-semibold">Stay On Schedule</span>
          <span className="block text-sm text-white/75">Complete jobs on time to maintain a high rating.</span>
        </span>
        <ChevronRight className="size-5" aria-hidden />
      </Link>

      <section>
        <SectionHeader title="Quick Actions" />
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          <QuickAction
            icon={<ToggleRight className="size-7 text-fixora-blue" />}
            label="Update Availability"
            onClick={() => (verified ? online.mutate(!p.isOnline) : toast('Available after verification', 'error'))}
          />
          <QuickAction to="/technician/earnings" icon={<WalletCards className="size-7 text-success" />} label="View Earnings" />
          <QuickAction icon={<MapPinned className="size-7 text-fixora-blue" />} label="Service Areas" onClick={() => toast(`You receive jobs within your service radius.`)} />
          <QuickAction to="/technician/help" icon={<Headset className="size-7 text-fixora-blue" />} label="Help & Support" />
        </div>
      </section>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-3 first:pl-1">
      {icon}
      <span className="text-[13px] text-white/85">{label}</span>
      <span className="text-[22px] font-bold">{value}</span>
    </div>
  );
}

function QuickAction({ icon, label, to, onClick }: { icon: React.ReactNode; label: string; to?: string; onClick?: () => void }) {
  const cls = 'flex h-full flex-col items-center gap-1.5 rounded-2xl bg-[#F3F6FB] px-1 py-3 text-center text-[11.5px] leading-tight font-medium text-slate-800';
  return to ? (
    <Link to={to} className={cls}>
      {icon}
      {label}
    </Link>
  ) : (
    <button onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}
