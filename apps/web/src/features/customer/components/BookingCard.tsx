import { Link } from 'react-router';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import type { BookingListItemDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { ProgressSteps } from '../../../components/ProgressSteps';
import { ServiceArt } from '../../../components/ServiceArt';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatSchedule } from '../../../lib/format';
import { TRACKED } from '../../../lib/status';

/** Booking row from the My Bookings screen, with the live tracker for active jobs. */
export function BookingCard({ booking: b }: { booking: BookingListItemDto }) {
  const cancelled = ['CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW'].includes(b.status);
  return (
    <Link
      to={`/bookings/${b.id}`}
      className="block rounded-2xl border border-slate-100 bg-white p-3.5 shadow-card transition-shadow hover:shadow-raised"
    >
      <div className="flex gap-3 min-[380px]:gap-3.5">
        <ServiceArt imageUrl={b.service.imageUrl} slug={b.service.slug} iconKey={b.service.iconKey} alt={b.service.name} className="size-[68px] shrink-0 rounded-xl min-[380px]:size-[92px]" artClassName="w-3/5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h3 className="text-[16px] leading-snug font-semibold text-slate-900 min-[380px]:text-[17px]">{b.service.name}</h3>
            <StatusBadge status={b.status} className="shrink-0" />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{b.code}</p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-700">
            <CalendarDays className="size-4 shrink-0 self-start text-fixora-blue" aria-hidden />
            <span>{formatSchedule(b.scheduledFor, b.timeSlot, b.scheduleType)}</span>
          </p>
          <div className="mt-1 flex items-center justify-between">
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-700">
              <MapPin className="size-4 shrink-0 text-fixora-blue" aria-hidden />
              <span className="truncate">{b.locality}</span>
            </p>
            <p className="flex items-center gap-1 text-[17px] font-bold text-slate-900">
              {formatINR(cancelled ? 0 : b.totalAmount)}
              <ChevronRight className="size-4.5 text-slate-400" aria-hidden />
            </p>
          </div>
        </div>
      </div>
      {TRACKED.includes(b.status) && (
        <div className="mt-4">
          <ProgressSteps steps={b.timeline} />
        </div>
      )}
    </Link>
  );
}
