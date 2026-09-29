import { ArrowUp, Star } from 'lucide-react';
import type { TechnicianEarningsDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { formatMonth } from '../../../lib/format';

/** Last 6 months as YYYY-MM (IST), newest first. */
export function monthOptions() {
  const ist = new Date(Date.now() + 330 * 60_000);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - i, 15));
    const value = d.toISOString().slice(0, 7);
    return { value, label: formatMonth(d) };
  });
}

/** Navy "Total Earnings" card with month selector (profile + earnings screens). */
export function EarningsCard({ e, month, onMonth }: { e: TechnicianEarningsDto; month: string; onMonth(m: string): void }) {
  return (
    <section className="rounded-2xl bg-fixora-navy p-4 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/75">Total Earnings</p>
          <p className="mt-1 flex items-center gap-2 text-[30px] font-bold">
            {formatINR(e.month)}
            {e.monthGrowthPct != null && (
              <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${e.monthGrowthPct >= 0 ? 'bg-success/20 text-emerald-300' : 'bg-danger/20 text-red-300'}`}>
                <ArrowUp className={`size-3 ${e.monthGrowthPct < 0 ? 'rotate-180' : ''}`} aria-hidden /> {Math.abs(e.monthGrowthPct)}%
              </span>
            )}
          </p>
        </div>
        <select
          value={month}
          onChange={(ev) => onMonth(ev.target.value)}
          aria-label="Month"
          className="rounded-lg border border-white/25 bg-white/10 px-2.5 py-1.5 text-sm text-white outline-none"
        >
          {monthOptions().map((m) => (
            <option key={m.value} value={m.value} className="text-slate-900">
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-white/15 border-t border-white/15 pt-3">
        <div className="pr-2">
          <p className="text-xs text-white/70">Completed Jobs</p>
          <p className="text-xl font-bold">{e.completedJobs}</p>
        </div>
        <div className="px-3">
          <p className="text-xs text-white/70">Cancelled</p>
          <p className="text-xl font-bold">{e.cancelledJobs}</p>
        </div>
        <div className="pl-3">
          <p className="text-xs text-white/70">Average Rating</p>
          <p className="flex items-center gap-1 text-xl font-bold">
            <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> {e.ratingAvg.toFixed(1)}
          </p>
        </div>
      </div>
    </section>
  );
}
