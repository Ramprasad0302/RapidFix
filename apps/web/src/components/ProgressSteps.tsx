import { Check, CircleCheckBig, MapPin, Truck, UserCheck, Wrench, type LucideIcon } from 'lucide-react';
import type { TimelineStepDto } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { formatTime } from '../lib/format';

const ICON: Record<string, LucideIcon> = {
  BOOKED: Check,
  ASSIGNED: UserCheck,
  EN_ROUTE: Truck,
  ARRIVED: MapPin,
  IN_PROGRESS: Wrench,
  COMPLETED: CircleCheckBig,
};

/** Horizontal booking tracker: ✓ done · highlighted current · grey upcoming, with the time each step happened. */
export function ProgressSteps({ steps, showTimes = false }: { steps: TimelineStepDto[]; showTimes?: boolean }) {
  return (
    <ol className="flex items-start" aria-label="Booking progress">
      {steps.map((step, i) => {
        const Icon = step.state === 'done' ? Check : (ICON[step.key] ?? Check);
        const next = steps[i + 1];
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center" aria-current={step.state === 'current' ? 'step' : undefined}>
            {next && (
              <span
                aria-hidden
                className={cx(
                  'absolute top-[15px] left-1/2 h-0.5 w-full',
                  step.state === 'done' && next.state !== 'upcoming' ? 'bg-fixora-blue' : 'bg-slate-200',
                )}
              />
            )}
            <span
              className={cx(
                'relative z-10 flex size-8 items-center justify-center rounded-full',
                step.state === 'done' && 'bg-fixora-blue text-white',
                step.state === 'current' && 'bg-fixora-blue text-white ring-4 ring-fixora-blue/15',
                step.state === 'upcoming' && 'border border-slate-200 bg-slate-100 text-slate-400',
              )}
            >
              <Icon className={step.state === 'done' ? 'size-4' : 'size-[15px]'} strokeWidth={step.state === 'done' ? 3 : 2.2} aria-hidden />
            </span>
            <span className={cx('mt-1.5 text-[11px] leading-tight', step.state === 'upcoming' ? 'text-slate-400' : 'font-medium text-slate-800')}>
              {step.label}
            </span>
            {showTimes && step.at && <span className="text-[10.5px] text-slate-500">{formatTime(step.at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
