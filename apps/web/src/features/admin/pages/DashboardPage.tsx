import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck2,
  CalendarDays,
  CircleCheck,
  CircleX,
  Copy,
  HardHat,
  IndianRupee,
  Star,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { AdminDashboardDto, DashboardRange, KpiDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { CategoryArt } from '../../../components/art/CategoryArt';
import { ErrorState, Skeleton } from '../../../components/States';
import { StatusBadge } from '../../../components/StatusBadge';
import { adminApi } from '../../../lib/endpoints';
import { firstName, formatDate, formatShortDate, formatTime, timeAgo } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { copyText } from '../../../store/toast';
import { BOOKING_SERIES, Card, CATEGORY_COLORS, OTHERS_COLOR } from '../components/Card';

const RANGES: { value: DashboardRange; label: string; days: number }[] = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: 'Last 7 Days', days: 7 },
  { value: '30d', label: 'Last 30 Days', days: 30 },
];

const compactINR = (paise: number) => {
  const r = paise / 100;
  return r >= 100_000 ? `₹${(r / 100_000).toFixed(1)}L` : r >= 1000 ? `₹${Math.round(r / 1000)}K` : `₹${Math.round(r)}`;
};

export function DashboardPage() {
  const name = useAuth((s) => s.user?.name);
  const [range, setRange] = useState<DashboardRange>('7d');
  const dash = useQuery({ queryKey: ['admin', 'dashboard', range], queryFn: () => adminApi.dashboard(range), refetchInterval: 60_000, placeholderData: (p) => p });
  const [now] = useState(() => Date.now());
  const r = RANGES.find((x) => x.value === range)!;
  const from = new Date(now - (r.days - 1) * 86_400_000);

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-[15px] text-slate-500">Welcome back{name ? `, ${firstName(name)}` : ''}! Here’s what’s happening with FIXORA.</p>
        </div>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-card">
          <CalendarDays className="size-4.5 text-slate-600" aria-hidden />
          <span className="hidden sm:inline">
            {formatDate(from)} – {formatDate(new Date(now))}
          </span>
          <select value={range} onChange={(e) => setRange(e.target.value as DashboardRange)} aria-label="Date range" className="bg-transparent font-semibold text-fixora-blue outline-none">
            {RANGES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {dash.isError && <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />}
      {dash.isPending && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      )}
      {dash.data && <Dashboard d={dash.data} rangeLabel={r.label} />}
    </div>
  );
}

function Dashboard({ d, rangeLabel }: { d: AdminDashboardDto; rangeLabel: string }) {
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Total Customers" kpi={d.kpis.customers} icon={<UsersRound className="size-7" />} tone="bg-blue-50 text-fixora-blue" />
        <Kpi label="Total Technicians" kpi={d.kpis.technicians} icon={<HardHat className="size-7" />} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Total Bookings" kpi={d.kpis.bookings} icon={<CalendarCheck2 className="size-7" />} tone="bg-orange-50 text-orange-500" />
        <Kpi label="Total Revenue" kpi={d.kpis.revenue} money icon={<IndianRupee className="size-7" />} tone="bg-violet-50 text-violet-600" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr_0.85fr]">
        <BookingsOverview d={d} />
        <CategoryDonut d={d} rangeLabel={rangeLabel} />
        <Summary d={d} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[2.3fr_0.85fr]">
        <RecentBookings d={d} />
        <LiveTechnicians d={d} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr_0.85fr]">
        <RevenueOverview d={d} rangeLabel={rangeLabel} />
        <TopServices d={d} />
        <RecentReviews d={d} />
      </div>
    </div>
  );
}

function Growth({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-sm font-semibold', up ? 'text-success' : 'text-danger')}>
      {up ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
      {Math.abs(pct)}%<span className="sr-only"> vs last month</span>
    </span>
  );
}

function Kpi({ label, kpi, icon, tone, money }: { label: string; kpi: KpiDto; icon: ReactNode; tone: string; money?: boolean }) {
  const fmt = (n: number) => (money ? formatINR(n) : n.toLocaleString('en-IN'));
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <span className={cx('flex size-16 shrink-0 items-center justify-center rounded-2xl', tone)}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-[26px] font-bold text-slate-900 tabular-nums">{fmt(kpi.total)}</span>
          <Growth pct={kpi.growthPct} />
        </p>
        <p className="text-[13px] text-slate-500">+{fmt(kpi.thisMonth)} this month</p>
      </div>
    </section>
  );
}

// ─── Charts ──────────────────────────────────────────────────────────────

const axis = { stroke: '#94A3B8', fontSize: 12, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
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

function Legend({ items }: { items: { label: string; color: string }[] }) {
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

function BookingsOverview({ d }: { d: AdminDashboardDto }) {
  const data = d.bookingsOverview;
  return (
    <Card title="Bookings Overview" action={<span className="text-sm text-slate-500">Last {data.length} days</span>}>
      <Legend
        items={[
          { label: 'Completed', color: BOOKING_SERIES.completed },
          { label: 'Active', color: BOOKING_SERIES.active },
          { label: 'Cancelled', color: BOOKING_SERIES.cancelled },
        ]}
      />
      <div className="mt-3 h-60" role="img" aria-label="Stacked bar chart of completed, active and cancelled bookings per day">
        <ResponsiveContainer>
          <BarChart data={data} barCategoryGap="28%" margin={{ left: -18, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} stroke="#EEF2F7" />
            <XAxis dataKey="date" {...axis} tickFormatter={(v: string) => formatShortDate(`${v}T12:00:00+05:30`)} interval="preserveStartEnd" />
            <YAxis {...axis} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip />} />
            {/* 1px surface stroke = the 2px gap between stacked segments. */}
            <Bar dataKey="completed" stackId="b" fill={BOOKING_SERIES.completed} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="active" stackId="b" fill={BOOKING_SERIES.active} stroke="#fff" strokeWidth={1} />
            <Bar dataKey="cancelled" stackId="b" fill={BOOKING_SERIES.cancelled} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function CategoryDonut({ d, rangeLabel }: { d: AdminDashboardDto; rangeLabel: string }) {
  // Fixed colour per category; categories without a slot fold into "Others".
  const named = d.categoryShare.filter((c) => CATEGORY_COLORS[c.iconKey]);
  const rest = d.categoryShare.filter((c) => !CATEGORY_COLORS[c.iconKey]);
  const total = d.categoryShare.reduce((n, c) => n + c.count, 0);
  const slices = [
    ...named.map((c) => ({ name: c.name, value: c.count, pct: c.pct, color: CATEGORY_COLORS[c.iconKey]! })),
    ...(rest.length ? [{ name: 'Others', value: rest.reduce((n, c) => n + c.count, 0), pct: rest.reduce((n, c) => n + c.pct, 0), color: OTHERS_COLOR }] : []),
  ];
  return (
    <Card title="Service Categories" action={<span className="text-sm text-slate-500">{rangeLabel}</span>}>
      {total === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">No bookings in this period.</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative size-44 shrink-0" role="img" aria-label="Donut chart of bookings by category">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={1.5} stroke="#fff" strokeWidth={2}>
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900">{total}</span>
              <span className="text-xs text-slate-500">Total Bookings</span>
            </div>
          </div>
          <ul className="w-full flex-1 space-y-2 text-[13px]">
            {slices.map((s) => (
              <li key={s.name} className="flex items-center gap-2 text-slate-700">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto font-semibold text-slate-900 tabular-nums">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Summary({ d }: { d: AdminDashboardDto }) {
  const rows = [
    { label: 'New Bookings', value: d.summary.newBookings, icon: <CalendarCheck2 className="size-5 text-fixora-blue" /> },
    { label: 'Active Services', value: d.summary.activeServices, icon: <Wrench className="size-5 text-fixora-blue" /> },
    { label: 'Completed', value: d.summary.completed, icon: <CircleCheck className="size-5 fill-success text-white" /> },
    { label: 'Cancelled', value: d.summary.cancelled, icon: <CircleX className="size-5 fill-danger text-white" /> },
  ];
  return (
    <Card title={d.range === 'today' ? 'Today’s Summary' : 'Summary'} action={<span className="text-sm text-slate-500">{formatShortDate(new Date())}</span>}>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 py-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-50">{r.icon}</span>
            <span className="flex-1 text-[15px] text-slate-700">{r.label}</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentBookings({ d }: { d: AdminDashboardDto }) {
  return (
    <Card title="Recent Bookings" className="overflow-hidden">
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/70 text-[13px] text-slate-500">
              {['#', 'Customer', 'Service', 'Technician', 'Date & Time', 'Status', 'Amount', ''].map((h) => (
                <th key={h} scope="col" className="px-5 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {d.recentBookings.map((b) => (
              <tr key={b.id} className="text-slate-700 hover:bg-slate-50/60">
                <td className="px-5 py-3 font-medium whitespace-nowrap text-slate-900">{b.code.replace(/^FX-\d{4}-/, 'FX-')}</td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={b.customerName} src={b.customerAvatarUrl} size={28} /> {b.customerName}
                  </span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap">{b.service}</td>
                <td className="px-5 py-3">
                  {b.technicianName ? (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={b.technicianName} src={b.technicianAvatarUrl} size={28} /> {b.technicianName}
                    </span>
                  ) : (
                    <span className="text-slate-400">Unassigned</span>
                  )}
                </td>
                <td className="px-5 py-3 whitespace-nowrap">
                  {formatShortDate(b.scheduledFor)}, {formatTime(b.scheduledFor)}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={b.status} audience="staff" />
                </td>
                <td className="px-5 py-3 font-semibold whitespace-nowrap text-slate-900 tabular-nums">{formatINR(b.amount)}</td>
                <td className="px-3 py-3">
                  <button onClick={() => void copyText(b.code, 'Booking ID copied')} aria-label={`Copy booking ID ${b.code}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Copy className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LiveTechnicians({ d }: { d: AdminDashboardDto }) {
  return (
    <Card title="Live Technicians">
      <ul className="flex flex-col gap-3.5">
        {d.liveTechnicians.map((t) => (
          <li key={t.id} className="flex items-center gap-3">
            <Avatar name={t.name} src={t.avatarUrl} size={40} online={t.isOnline} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{t.name}</span>
              <span className="block truncate text-xs text-slate-500">{t.title}</span>
            </span>
            <span className={cx('flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium', t.isOnline ? 'bg-success-soft text-success' : 'bg-slate-100 text-slate-500')}>
              <span className={cx('size-1.5 rounded-full', t.isOnline ? 'bg-success' : 'bg-slate-400')} aria-hidden />
              {t.isOnline ? 'Online' : 'Offline'}
            </span>
          </li>
        ))}
        {d.liveTechnicians.length === 0 && <p className="text-sm text-slate-500">No verified technicians yet.</p>}
      </ul>
    </Card>
  );
}

function RevenueOverview({ d, rangeLabel }: { d: AdminDashboardDto; rangeLabel: string }) {
  const v = d.revenue;
  return (
    <Card title="Revenue Overview" action={<span className="text-sm text-slate-500">{rangeLabel}</span>}>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-52" role="img" aria-label="Area chart of daily revenue">
          <ResponsiveContainer>
            <AreaChart data={v.points} margin={{ left: -6, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2563EB" stopOpacity={0.22} />
                  <stop offset="1" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EEF2F7" />
              <XAxis dataKey="date" {...axis} tickFormatter={(x: string) => formatShortDate(`${x}T12:00:00+05:30`)} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={compactINR} width={52} />
              <Tooltip cursor={{ stroke: '#94A3B8', strokeDasharray: '4 4' }} content={<ChartTooltip money />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#2563EB" strokeWidth={2} fill="url(#rev)" dot={false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col justify-center gap-5">
          <div>
            <p className="text-sm text-slate-500">Total Revenue</p>
            <p className="flex items-baseline gap-2 text-[26px] font-bold text-slate-900 tabular-nums">
              {formatINR(v.total)} <Growth pct={v.growthPct} />
            </p>
            <p className="text-[13px] text-slate-500">+{formatINR(v.thisPeriod)} {rangeLabel.toLowerCase()}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Total Payouts</p>
            <p className="flex items-baseline gap-2 text-[22px] font-bold text-slate-900 tabular-nums">
              {formatINR(v.payouts)} <Growth pct={v.payoutsGrowthPct} />
            </p>
            <p className="text-[13px] text-slate-500">+{formatINR(v.payoutsThisPeriod)} {rangeLabel.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TopServices({ d }: { d: AdminDashboardDto }) {
  const max = Math.max(1, ...d.topServices.map((s) => s.count));
  return (
    <Card title="Top Services">
      {d.topServices.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No bookings in this period.</p>}
      <ol className="flex flex-col gap-3.5">
        {d.topServices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-3">
            <span className="w-4 text-sm font-semibold text-slate-500">{i + 1}</span>
            <CategoryArt iconKey={s.iconKey} className="size-8 shrink-0" />
            <span className="w-32 min-w-0 shrink-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
              <span className="block text-xs text-slate-500">{s.count} bookings</span>
            </span>
            {/* One series (booking count) → one hue; the label carries identity. */}
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.pct}% of bookings`}>
              <span className="block h-full rounded-full bg-fixora-blue" style={{ width: `${(s.count / max) * 100}%` }} />
            </span>
            <span className="w-10 text-right text-sm font-semibold text-slate-900 tabular-nums">{s.pct}%</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RecentReviews({ d }: { d: AdminDashboardDto }) {
  return (
    <Card title="Recent Reviews" action={<Link to="/admin/reviews" className="text-sm font-medium text-fixora-blue">View All</Link>}>
      <ul className="flex flex-col gap-4">
        {d.recentReviews.map((r) => (
          <li key={r.id}>
            <div className="flex items-center gap-3">
              <Avatar name={r.customerName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{r.customerName}</p>
                <p className="text-xs text-slate-500">{r.service}</p>
              </div>
              <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
            </div>
            <p className="mt-1.5 flex items-center gap-0.5" aria-label={`${r.rating} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className={cx('size-4', i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} aria-hidden />
              ))}
              <span className="ml-1 text-xs font-semibold text-slate-700">{r.rating.toFixed(1)}</span>
            </p>
            {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
          </li>
        ))}
        {d.recentReviews.length === 0 && <p className="text-sm text-slate-500">No reviews yet.</p>}
      </ul>
    </Card>
  );
}
