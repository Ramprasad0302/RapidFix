import { formatINR } from '@fixora/shared-utils';
import { formatShortDate } from '../../../lib/format';

/** Chart helpers shared by the dashboard and reports (recessive axes, text-token tooltips). */

export const compactINR = (paise: number) => {
  const r = paise / 100;
  return r >= 100_000 ? `₹${(r / 100_000).toFixed(1)}L` : r >= 1000 ? `₹${Math.round(r / 1000)}K` : `₹${Math.round(r)}`;
};

export const axis = { stroke: '#94A3B8', fontSize: 12, tickLine: false, axisLine: false } as const;

export function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm shadow-raised">
      {label && <p className="mb-1 font-semibold text-slate-900">{formatShortDate(`${label}T12:00:00+05:30`)}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-slate-900 tabular-nums">{money ? formatINR(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-4 text-[13px] text-slate-600">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} aria-hidden /> {i.label}
        </li>
      ))}
    </ul>
  );
}

