import { useEffect, type ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Check } from 'lucide-react';
import { cx } from '@fixora/ui';
import { PageHeader } from '../../../components/PageHeader';
import { useBookingDraft } from '../../../store/bookingDraft';
import { MobileShell } from '../CustomerTabsLayout';
import { BookingSummaryAside } from './BookingSummaryAside';

const STEPS = ['Service', 'Details', 'Address', 'Schedule', 'Summary'];

/** 1 · 2 · 3 · 4 · 5 progress header of the booking flow. */
export function BookingStepper({ current }: { current: number }) {
  return (
    <ol className="flex items-start px-2" aria-label={`Step ${current} of ${STEPS.length}`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'upcoming';
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center" aria-current={state === 'current' ? 'step' : undefined}>
            {n < STEPS.length && <span aria-hidden className={cx('absolute top-4 left-1/2 h-0.5 w-full', n < current ? 'bg-fixora-blue' : 'bg-slate-200')} />}
            <span
              className={cx(
                'relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold',
                state === 'current' && 'border-fixora-blue bg-fixora-blue text-white shadow-[0_0_0_4px_rgb(37_99_235/0.15)]',
                state === 'done' && 'border-fixora-blue bg-white text-fixora-blue',
                state === 'upcoming' && 'border-slate-300 bg-white text-slate-400',
              )}
            >
              {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : n}
            </span>
            <span className={cx('mt-1 text-[11px]', state === 'current' ? 'font-semibold text-fixora-blue' : 'text-slate-400')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Header ("Book a Service"), optional stepper, scrolling content and a
 * sticky primary action. Steps 2+ require a chosen service.
 */
export function BookingShell({
  step,
  children,
  action,
  requireService = true,
  backTo = '/',
}: {
  step?: number;
  children: ReactNode;
  action?: ReactNode;
  requireService?: boolean;
  backTo?: string;
}) {
  const hasService = useBookingDraft((s) => !!s.serviceId);
  const [params] = useSearchParams();
  const setCoupon = useBookingDraft((s) => s.update);
  const coupon = params.get('coupon');

  // Offers deep-link: /book…?coupon=FIXAC20 carries the code into the draft.
  useEffect(() => {
    if (coupon) setCoupon({ couponCode: coupon.toUpperCase() });
  }, [coupon, setCoupon]);

  if (requireService && !hasService) return <Navigate to="/book" replace />;
  // Desktop: live "Your booking" summary beside the steps once a service is chosen.
  const showSummary = hasService && requireService;
  return (
    <MobileShell
      wide
      className={cx(
        'lg:bg-transparent lg:px-8 lg:py-8',
        showSummary ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8' : 'lg:max-w-5xl',
      )}
    >
      <div className="flex min-h-dvh flex-col lg:min-h-[calc(100dvh-9.5rem)] lg:overflow-clip lg:rounded-3xl lg:border lg:border-slate-200/70 lg:bg-white lg:shadow-card">
        <PageHeader title="Book a Service" backTo={backTo} />
        {step && (
          <div className="px-2 pb-2">
            <BookingStepper current={step} />
          </div>
        )}
        <main className="flex-1 px-5 pt-3 pb-6">{children}</main>
        {action && (
          <div className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">{action}</div>
        )}
      </div>
      {showSummary && <BookingSummaryAside />}
    </MobileShell>
  );
}

export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[24px] font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[15px] text-slate-500">{subtitle}</p>}
    </div>
  );
}
