import { useEffect } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Bell, BriefcaseBusiness, CalendarCheck2, CircleCheck, IndianRupee, Truck, type LucideIcon } from 'lucide-react';
import type { NotificationDto } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { PageHeader } from '../../../components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { notificationApi } from '../../../lib/endpoints';
import { timeAgo } from '../../../lib/format';
import { homeFor, useAuth } from '../../../store/auth';
import { MobileShell } from '../CustomerTabsLayout';

const ICONS: Record<string, LucideIcon> = {
  BOOKING_CONFIRMED: CalendarCheck2,
  TECHNICIAN_ACCEPTED: CalendarCheck2,
  TECHNICIAN_EN_ROUTE: Truck,
  TECHNICIAN_ARRIVED: Truck,
  SERVICE_STARTED: BriefcaseBusiness,
  SERVICE_COMPLETED: CircleCheck,
  PAYMENT: IndianRupee,
  OFFER: BadgePercent,
  NEW_JOB: BriefcaseBusiness,
};

/** Shared by customers and technicians; opening the list marks everything read. */
export function NotificationsPage() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const list = useQuery({ queryKey: ['notifications', 'list'], queryFn: notificationApi.list });
  const readAll = useMutation({
    mutationFn: notificationApi.readAll,
    onSuccess: () => qc.setQueryData(['notifications', 'unread'], { count: 0 }),
  });

  const hasUnread = list.data?.some((n) => !n.readAt);
  const markAllRead = readAll.mutate;
  useEffect(() => {
    if (hasUnread) markAllRead();
  }, [hasUnread, markAllRead]);

  const linkFor = (n: NotificationDto) => {
    const bookingId = typeof n.data?.bookingId === 'string' ? n.data.bookingId : null;
    if (!bookingId) return null;
    return role === 'TECHNICIAN' ? `/technician/jobs/${bookingId}` : `/bookings/${bookingId}`;
  };

  return (
    <MobileShell>
      <PageHeader title="Notifications" backTo={homeFor(role)} />
      <main className="px-4 pb-10">
        {list.isPending && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mb-3 h-20" />)}
        {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
        {list.isSuccess && list.data.length === 0 && (
          <EmptyState art={<Bell className="size-10 text-slate-300" />} title="No notifications yet" body="Booking updates and offers will appear here." />
        )}
        <ul className="flex flex-col gap-2">
          {list.data?.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            const to = linkFor(n);
            const body = (
              <>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-900">{n.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                </span>
              </>
            );
            const cls = cx('flex gap-3 rounded-2xl p-3.5', n.readAt ? 'bg-white' : 'bg-fixora-blue-soft/60');
            return <li key={n.id}>{to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      </main>
    </MobileShell>
  );
}
