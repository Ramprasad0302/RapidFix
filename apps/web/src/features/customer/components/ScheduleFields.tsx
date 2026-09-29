import { CalendarClock, Info, Zap } from 'lucide-react';
import { TIME_SLOTS } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { formatShortDate, formatWeekday, nextDays, slotRange } from '../../../lib/format';

export interface ScheduleValue {
  scheduleType: 'NOW' | 'SCHEDULED';
  date: string | null;
  timeSlot: string | null;
}

/** Slots whose window has already ended today are hidden. */
function slotAvailable(date: string | null, slotId: string) {
  const today = nextDays(1)[0];
  if (date !== today) return true;
  const slot = TIME_SLOTS.find((s) => s.id === slotId)!;
  const istHour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  return istHour < slot.endHour - 1;
}

/** Book Now / Schedule for Later + date chips + time-slot grid (booking step 4 and reschedule). */
export function ScheduleFields({ value, onChange }: { value: ScheduleValue; onChange(v: ScheduleValue): void }) {
  const days = nextDays(7);
  const now = value.scheduleType === 'NOW';
  const date = value.date ?? days[0]!;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="When">
        {[
          { type: 'NOW' as const, icon: Zap, label: 'Book Now' },
          { type: 'SCHEDULED' as const, icon: CalendarClock, label: 'Schedule for Later' },
        ].map(({ type, icon: Icon, label }) => {
          const active = value.scheduleType === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ scheduleType: type, date: type === 'NOW' ? null : date, timeSlot: type === 'NOW' ? value.timeSlot : null })}
              className={cx(
                'flex h-24 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition-colors',
                active ? 'border-fixora-blue bg-fixora-blue text-white shadow-[0_8px_20px_rgb(37_99_235/0.3)]' : 'border-slate-200 bg-white text-slate-800',
              )}
            >
              <Icon className="size-6" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {now ? (
        <div className="flex gap-3 rounded-2xl bg-fixora-blue-soft p-4">
          <Zap className="mt-0.5 size-6 shrink-0 fill-fixora-blue text-fixora-blue" aria-hidden />
          <div>
            <p className="font-semibold text-slate-900">Book Now</p>
            <p className="text-sm text-slate-600">Get a professional as soon as possible based on availability.</p>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Select Date</p>
          <div className="scroll-row -mx-5 gap-2 px-5">
            {days.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...value, date: d, timeSlot: slotAvailable(d, value.timeSlot ?? '') ? value.timeSlot : null })}
                aria-pressed={date === d}
                className={cx(
                  'flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border text-sm',
                  date === d ? 'border-fixora-blue bg-fixora-blue text-white' : 'border-slate-200 text-slate-800',
                )}
              >
                <span className="text-xs opacity-80">{i === 0 ? 'Today' : formatWeekday(`${d}T12:00:00+05:30`)}</span>
                <span className="font-semibold">{formatShortDate(`${d}T12:00:00+05:30`)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-3 text-[15px] font-semibold text-slate-900">Preferred Time Slot {now && <span className="font-normal text-slate-500">(Optional)</span>}</p>
        <div className="grid grid-cols-2 gap-3">
          {TIME_SLOTS.map((s) => {
            const available = slotAvailable(now ? nextDays(1)[0]! : date, s.id);
            const active = value.timeSlot === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!available}
                aria-pressed={active}
                onClick={() => onChange({ ...value, date: now ? null : date, timeSlot: active && now ? null : s.id })}
                className={cx(
                  'h-12 rounded-xl border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  active ? 'border-fixora-blue bg-fixora-blue text-white' : 'border-slate-200 bg-white text-slate-800',
                )}
              >
                {slotRange(s.id)?.replace(':00', '').replace(':00', '')}
              </button>
            );
          })}
        </div>
      </div>

      <p className="flex gap-2.5 rounded-2xl bg-fixora-blue-soft p-4 text-sm text-slate-700">
        <Info className="mt-0.5 size-4.5 shrink-0 text-fixora-blue" aria-hidden />
        {now ? 'We will try to assign a professional in your preferred time slot.' : 'A verified professional will be assigned before your slot.'}
      </p>
    </div>
  );
}
