import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Check, Copy } from 'lucide-react';
import { BookingStatus as B, type BookingStatus } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { customerApi } from '../../../lib/endpoints';
import { useBookingDraft } from '../../../store/bookingDraft';
import { copyText } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';

const STEPS: { label: string; hint?: string; reached: BookingStatus[] }[] = [
  { label: 'Searching for a professional', hint: 'This may take a few minutes', reached: [B.PENDING, B.SEARCHING] },
  { label: 'Assigning technician', reached: [B.TECHNICIAN_ASSIGNED, B.TECHNICIAN_ACCEPTED] },
  { label: 'Technician on the way', reached: [B.TECHNICIAN_EN_ROUTE, B.TECHNICIAN_ARRIVED] },
  { label: 'Service in progress', reached: [B.SERVICE_STARTED, B.ADDITIONAL_CHARGE_REQUESTED, B.ADDITIONAL_CHARGE_APPROVED] },
  { label: 'Service completed', reached: [B.SERVICE_COMPLETED, B.PAYMENT_PENDING, B.PAYMENT_COMPLETED] },
];

/** Final step: confirmation, booking ID and a live "what happens next" timeline. */
export function BookingConfirmedPage() {
  const { id = '' } = useParams();
  const booking = useQuery({ queryKey: ['customer', 'booking', id], queryFn: () => customerApi.booking(id), refetchInterval: 10_000 });
  const clearDraft = useBookingDraft((s) => s.clear);
  // The booking exists now — start the next one fresh.
  useEffect(() => clearDraft(), [clearDraft]);
  const b = booking.data;
  const current = b ? Math.max(0, STEPS.findIndex((s) => s.reached.includes(b.status))) : 0;

  return (
    <MobileShell>
      <PageHeader backTo="/bookings" />
      {booking.isPending && <CenteredSpinner />}
      {booking.isError && <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />}
      {b && (
        <main className="flex flex-col items-center px-5 pb-10 text-center">
          <div className="relative mt-2 flex size-28 items-center justify-center">
            {['-top-1 left-5 bg-amber-400', 'top-3 -right-1 bg-fixora-blue', 'bottom-2 -left-2 bg-fixora-cyan', '-bottom-1 right-6 bg-success', 'top-10 -left-4 bg-danger'].map((c) => (
              <span key={c} aria-hidden className={cx('absolute size-2 rounded-full', c)} />
            ))}
            <span className="flex size-20 items-center justify-center rounded-full bg-success shadow-[0_0_0_10px_rgb(22_163_74/0.12)]">
              <Check className="size-11 text-white" strokeWidth={3} aria-hidden />
            </span>
          </div>
          <h1 className="mt-4 text-[26px] font-bold text-slate-900">Booking Confirmed!</h1>
          <p className="mt-1 text-[15px] text-slate-500">We’re finding the right professional for you.</p>

          <div className="mt-6 w-full rounded-2xl bg-[#F3F7FD] px-5 py-4">
            <p className="text-sm text-slate-500">Booking ID</p>
            <div className="mt-1 flex items-center justify-center gap-3">
              <p className="text-2xl font-bold tracking-wide text-slate-900">{b.code}</p>
              <button onClick={() => void copyText(b.code, 'Booking ID copied')} aria-label="Copy booking ID" className="text-fixora-blue">
                <Copy className="size-5" />
              </button>
            </div>
          </div>

          <ol className="mt-7 w-full text-left">
            {STEPS.map((s, i) => {
              const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
              return (
                <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < STEPS.length - 1 && <span aria-hidden className={cx('absolute top-5 left-[9px] h-full w-0.5', i < current ? 'bg-fixora-blue' : 'bg-slate-200')} />}
                  <span
                    className={cx(
                      'relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                      state === 'upcoming' ? 'bg-slate-200' : 'bg-fixora-blue',
                      state === 'current' && 'ring-4 ring-fixora-blue/20',
                    )}
                  >
                    {state === 'done' && <Check className="size-3 text-white" strokeWidth={3} />}
                  </span>
                  <span>
                    <span className={cx('block text-[15px]', state === 'upcoming' ? 'text-slate-500' : 'font-semibold text-slate-900')}>{s.label}</span>
                    {state === 'current' && s.hint && <span className="block text-sm text-slate-500">{s.hint}</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-7 flex w-full items-center gap-3 rounded-2xl bg-fixora-blue-soft p-4 text-left text-sm text-slate-700">
            <BellRing className="size-6 shrink-0 fill-fixora-blue text-fixora-blue" aria-hidden />
            You will be notified once a technician accepts your request.
          </p>

          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <Link to="/" className="flex h-12 items-center justify-center rounded-xl border border-slate-300 font-semibold text-slate-800">
              Back to Home
            </Link>
            <Link to={`/bookings/${b.id}`} className="flex h-12 items-center justify-center rounded-xl bg-fixora-blue font-semibold text-white">
              View Booking
            </Link>
          </div>
        </main>
      )}
    </MobileShell>
  );
}
