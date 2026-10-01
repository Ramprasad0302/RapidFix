import { Link } from 'react-router';
import { ChevronRight, Clock, MapPin } from 'lucide-react';
import type { TechnicianJobDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { ServiceArt } from '../../../components/ServiceArt';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatScheduleTime } from '../../../lib/format';

/** Compact row (dashboard schedule) or full card (bookings list with location + amount). */
export function JobCard({ job: j, compact = false }: { job: TechnicianJobDto; compact?: boolean }) {
  return (
    <Link to={`/technician/jobs/${j.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-card hover:shadow-raised">
      <ServiceArt imageUrl={j.service.imageUrl} slug={j.service.slug} iconKey={j.service.iconKey} alt={j.service.name} className={compact ? 'size-16 shrink-0 rounded-xl' : 'size-20 shrink-0 rounded-xl'} artClassName="w-3/5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="text-[16px] leading-snug font-semibold text-slate-900">{j.service.name}</p>
          <StatusBadge status={j.status} audience="staff" className="shrink-0" />
        </div>
        <p className="text-sm text-slate-600">{j.customerName}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-600">
          <Clock className="size-3.5" aria-hidden />
          {formatScheduleTime(j.scheduledFor, j.timeSlot, j.scheduleType)}
        </p>
        {!compact && (
          <div className="mt-0.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[13px] text-slate-600">
              <MapPin className="size-3.5 text-fixora-blue" aria-hidden /> {j.locality}
            </p>
            <p className="text-[16px] font-bold text-slate-900">{formatINR(j.totalAmount)}</p>
          </div>
        )}
      </div>
      {compact && <ChevronRight className="size-5 text-fixora-blue" aria-hidden />}
    </Link>
  );
}
