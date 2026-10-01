import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { ServiceArt } from '../../../components/ServiceArt';
import { Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { formatSchedule } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { useBookingDraft } from '../../../store/bookingDraft';

/** Desktop booking flow: live summary of what's being booked (service, price, schedule, address). */
export function BookingSummaryAside() {
  const draft = useBookingDraft();
  const authed = useAuth((s) => s.status === 'authenticated');
  const service = useQuery({ queryKey: ['service', draft.serviceSlug], queryFn: () => catalogApi.service(draft.serviceSlug!), enabled: !!draft.serviceSlug });
  const estimate = useQuery({
    queryKey: ['estimate', draft.serviceId, draft.couponCode, authed],
    queryFn: () => catalogApi.estimate(draft.serviceId!, draft.couponCode ?? undefined),
    enabled: !!draft.serviceId,
  });
  const s = service.data;
  const e = estimate.data;
  const when =
    draft.scheduleType === 'NOW' ? 'As soon as possible' : draft.date && draft.timeSlot ? formatSchedule(`${draft.date}T12:00:00+05:30`, draft.timeSlot, 'SCHEDULED') : null;
  const where = draft.address ? [draft.address.houseNo, draft.address.area, draft.address.villageTown].filter(Boolean).join(', ') : draft.addressId ? 'Saved address' : null;

  return (
    <aside className="sticky top-24 hidden flex-col gap-4 lg:flex">
      <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-card">
        <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Your booking</p>
        {!s ? (
          <Skeleton className="mt-3 h-20" />
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt="" className="size-16 shrink-0 rounded-2xl" artClassName="w-3/5" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{s.name}</p>
              <p className="text-sm text-slate-500">{s.category.name}</p>
            </div>
          </div>
        )}
        <dl className="mt-4 flex flex-col gap-2.5 border-t border-slate-100 pt-4 text-sm">
          <Line icon={<CalendarDays className="size-4" />} label="When" value={when ?? 'Choose a time'} muted={!when} />
          <Line icon={<MapPin className="size-4" />} label="Where" value={where ?? 'Add your address'} muted={!where} />
          <Line icon={<Wallet className="size-4" />} label="Pay" value="After the service (cash, UPI or online)" />
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
          {!e ? (
            <Skeleton className="h-16" />
          ) : (
            <dl className="flex flex-col gap-1.5 text-slate-600">
              <Money label="Service" value={e.serviceCharge} />
              {e.visitCharge > 0 && <Money label="Visit charge" value={e.visitCharge} />}
              {e.discount > 0 && <Money label={`Discount${e.coupon?.code ? ` (${e.coupon.code})` : ''}`} value={-e.discount} />}
              {e.tax > 0 && <Money label={`GST (${e.taxPercent}%)`} value={e.tax} />}
              <div className="mt-2 flex justify-between border-t border-slate-100 pt-3 text-lg font-bold text-slate-900">
                <dt>Estimated total</dt>
                <dd>{formatINR(e.total)}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>
      <p className="flex items-start gap-2.5 rounded-2xl bg-fixora-blue-soft p-4 text-sm text-slate-700">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-fixora-blue" aria-hidden />
        Verified professionals, transparent pricing — extra work always needs your approval first.
      </p>
    </aside>
  );
}

function Line({ icon, label, value, muted }: { icon: React.ReactNode; label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-fixora-blue">{icon}</span>
      <dt className="w-12 shrink-0 text-slate-500">{label}</dt>
      <dd className={muted ? 'text-slate-400' : 'text-slate-900'}>{value}</dd>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className={value < 0 ? 'text-success' : 'text-slate-900'}>{value < 0 ? `− ${formatINR(-value)}` : formatINR(value)}</dd>
    </div>
  );
}
