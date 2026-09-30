import { Fragment, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bell, ChartColumn, CircleAlert, CircleCheck, CircleX, Download, Eye, EyeOff, FileText, Send, Settings, Settings2, Star } from 'lucide-react';
import type { AdminReviewDto, AuditLogDto, ComplaintDto, ReportDto, SettingDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { ErrorState, Skeleton } from '../../../components/States';
import { Pill } from '../../../components/StatusBadge';
import { adminModulesApi } from '../../../lib/endpoints';
import { formatDate, formatTime, timeAgo } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { ROLE_LABEL } from '../AdminLayout';
import { Card } from '../components/Card';
import { axis, ChartTooltip, compactINR, Legend } from '../components/charts';
import { DataTable, Field, FilterSelect, humanize, inputCls, isoDay, PageTitle, Pager, SearchBox, StatTile, useUrlParams, type Column } from '../components/kit';
import { BookingDrawer } from './BookingsPage';

const PAGE_SIZE = 20;

// ─── Reviews ─────────────────────────────────────────────────────────────

export function ReviewsPage() {
  const { get, set, page } = useUrlParams();
  const rating = get('rating');
  const visible = get('visible');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['admin', 'reviews', { rating, visible, page }],
    queryFn: () => adminModulesApi.reviews({ rating: rating ? Number(rating) : undefined, visible: visible ? visible === 'true' : undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: (r: AdminReviewDto) => adminModulesApi.setReviewVisibility(r.id, !r.isVisible),
    onSuccess: (_d, r) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast(r.isVisible ? 'Review hidden — technician rating recalculated' : 'Review visible again');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const columns: Column<AdminReviewDto>[] = [
    { header: 'Date', className: 'whitespace-nowrap', cell: (r) => formatDate(r.createdAt) },
    {
      header: 'Rating',
      className: 'whitespace-nowrap',
      cell: (r) => (
        <span className="flex items-center gap-1 font-semibold">
          {r.rating} <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
        </span>
      ),
    },
    { header: 'Comment', className: 'max-w-[360px]', cell: (r) => (r.comment ? <span className="line-clamp-2">“{r.comment}”</span> : <span className="text-slate-400">No comment</span>) },
    {
      header: 'Booking',
      cell: (r) => (
        <span>
          <span className="block font-medium">{r.bookingCode}</span>
          <span className="text-xs text-slate-500">{r.service}</span>
        </span>
      ),
    },
    { header: 'Customer', cell: (r) => r.customerName ?? '—' },
    { header: 'Technician', cell: (r) => r.technicianName ?? '—' },
    {
      header: 'Visibility',
      cell: (r) => (
        <Button size="sm" variant="outline" loading={toggle.isPending && toggle.variables?.id === r.id} onClick={() => toggle.mutate(r)} leftIcon={r.isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}>
          {r.isVisible ? 'Hide' : 'Show'}
        </Button>
      ),
    },
  ];
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={Star} title="Reviews" subtitle="Hide abusive or fake reviews. Ratings are recalculated from visible reviews only." />
      <Card className="mt-6">
        <div className="flex flex-wrap gap-3">
          <FilterSelect label="All ratings" value={rating} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? 's' : ''}` }))} onChange={(v) => set({ rating: v })} />
          <FilterSelect
            label="Visible & hidden"
            value={visible}
            options={[
              { value: 'true', label: 'Visible' },
              { value: 'false', label: 'Hidden' },
            ]}
            onChange={(v) => set({ visible: v })}
          />
        </div>
        <DataTable columns={columns} rows={list.data?.items} rowKey={(r) => r.id} loading={list.isPending} fetching={list.isFetching} error={list.error} onRetry={() => void list.refetch()} empty="No reviews" minWidth={1000} />
        {list.data && <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} noun="reviews" />}
      </Card>
    </div>
  );
}

// ─── Complaints ──────────────────────────────────────────────────────────

const COMPLAINT_TONE = { OPEN: 'red', IN_PROGRESS: 'amber', RESOLVED: 'green', CLOSED: 'gray' } as const;

export function ComplaintsPage() {
  const { get, set, page } = useUrlParams();
  const status = get('status') as ComplaintDto['status'] | undefined;
  const [open, setOpen] = useState<ComplaintDto | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'complaints', { status, page }],
    queryFn: () => adminModulesApi.complaints({ status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<ComplaintDto>[] = [
    { header: 'Raised', className: 'whitespace-nowrap', cell: (c) => timeAgo(c.createdAt) },
    { header: 'Status', cell: (c) => <Pill tone={COMPLAINT_TONE[c.status]}>{humanize(c.status)}</Pill> },
    {
      header: 'Subject',
      className: 'max-w-[360px]',
      cell: (c) => (
        <span>
          <span className="block font-medium text-slate-900">{c.subject}</span>
          <span className="text-xs text-slate-500">{c.category}</span>
        </span>
      ),
    },
    {
      header: 'From',
      cell: (c) => (
        <span>
          {c.raisedBy.name ?? '—'} <span className="text-xs text-slate-500">({ROLE_LABEL[c.raisedBy.role]})</span>
        </span>
      ),
    },
    { header: 'Booking', cell: (c) => c.bookingCode ?? '—' },
    { header: 'Assigned to', cell: (c) => c.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span> },
  ];
  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={CircleAlert} title="Complaints" subtitle="Customer and partner complaints. Open items are listed first." />
      <Card className="mt-6">
        <FilterSelect
          label="All statuses"
          value={status}
          options={(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const).map((s) => ({ value: s, label: humanize(s) }))}
          onChange={(v) => set({ status: v })}
        />
        <DataTable columns={columns} rows={list.data?.items} rowKey={(c) => c.id} onRowClick={(c) => setOpen(c)} loading={list.isPending} fetching={list.isFetching} error={list.error} onRetry={() => void list.refetch()} empty="No complaints — nice!" />
        {list.data && <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} noun="complaints" />}
      </Card>
      {open && <ComplaintDialog key={open.id} c={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ComplaintDialog({ c, onClose }: { c: ComplaintDto; onClose(): void }) {
  const qc = useQueryClient();
  const [resolution, setResolution] = useState(c.resolution ?? '');
  const [showBooking, setShowBooking] = useState(false);
  const update = useMutation({
    mutationFn: (body: { status?: ComplaintDto['status']; resolution?: string; assignToMe?: boolean }) => adminModulesApi.updateComplaint(c.id, body),
    onSuccess: (_d, body) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'complaints'] });
      toast(body.assignToMe ? 'Assigned to you' : 'Complaint updated');
      if (body.status === 'RESOLVED' || body.status === 'CLOSED') onClose();
    },
  });
  return (
    <Dialog
      variant="wide"
      open
      onClose={onClose}
      title={c.subject}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {!c.assignedTo && (
            <Button variant="outline" loading={update.isPending && update.variables?.assignToMe} onClick={() => update.mutate({ assignToMe: true, status: 'IN_PROGRESS' })}>
              Assign to me
            </Button>
          )}
          <Button variant="outline" disabled={!resolution.trim()} onClick={() => update.mutate({ status: 'CLOSED', resolution: resolution.trim() })}>
            Close
          </Button>
          <Button disabled={!resolution.trim()} loading={update.isPending && update.variables?.status === 'RESOLVED'} onClick={() => update.mutate({ status: 'RESOLVED', resolution: resolution.trim() })}>
            Mark resolved
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Pill tone={COMPLAINT_TONE[c.status]}>{humanize(c.status)}</Pill>
        <span className="text-slate-500">
          {c.category} · {c.raisedBy.name} ({ROLE_LABEL[c.raisedBy.role]}) · {formatDate(c.createdAt)}, {formatTime(c.createdAt)}
        </span>
      </div>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[15px] whitespace-pre-wrap text-slate-800">{c.description}</p>
      {c.bookingId && (
        <button onClick={() => setShowBooking((v) => !v)} className="mt-3 text-sm font-medium text-fixora-blue">
          {showBooking ? 'Hide' : 'Show'} booking {c.bookingCode}
        </button>
      )}
      {showBooking && c.bookingId && (
        <div className="mt-3 rounded-xl border border-slate-100 p-4">
          <BookingDrawer id={c.bookingId} />
        </div>
      )}
      <Field label="Resolution (shared with the person who raised it)" className="mt-4">
        <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} maxLength={2000} className={cx(inputCls, 'h-auto py-2')} />
      </Field>
      {update.isError && <Alert className="mt-3">{update.error.message}</Alert>}
    </Dialog>
  );
}

// ─── Notifications (broadcast) ───────────────────────────────────────────

const AUDIENCE = { CUSTOMERS: 'All customers', TECHNICIANS: 'All technicians', ALL: 'Everyone' } as const;

export function NotificationsPage() {
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ['admin', 'broadcasts'], queryFn: adminModulesApi.broadcasts });
  const [audience, setAudience] = useState<keyof typeof AUDIENCE>('CUSTOMERS');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState(false);
  const send = useMutation({
    mutationFn: () => adminModulesApi.broadcast({ audience, title: title.trim(), body: body.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'broadcasts'] });
      toast('Announcement sent');
      setTitle('');
      setBody('');
      setConfirm(false);
    },
  });
  const valid = title.trim().length >= 3 && body.trim().length >= 3;
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageTitle icon={Bell} title="Notifications" subtitle="Send an in-app + push announcement to customers or partners." />
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="New announcement">
          <div className="flex flex-col gap-3">
            <Field label="Send to">
              <select value={audience} onChange={(e) => setAudience(e.target.value as keyof typeof AUDIENCE)} className={inputCls}>
                {Object.entries(AUDIENCE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className={inputCls} placeholder="Diwali offer: 20% off AC service" />
            </Field>
            <Field label="Message" hint={`${body.length}/500`}>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={4} className={cx(inputCls, 'h-auto py-2')} />
            </Field>
            <Button disabled={!valid} onClick={() => setConfirm(true)} leftIcon={<Send className="size-4" />}>
              Review & send
            </Button>
          </div>
        </Card>
        <Card title="Sent">
          {history.isPending && <Skeleton className="h-40" />}
          {history.isError && <ErrorState error={history.error} onRetry={() => void history.refetch()} />}
          {history.data?.length === 0 && <p className="text-sm text-slate-500">Nothing sent yet.</p>}
          <ul className="flex flex-col gap-3">
            {history.data?.map((b) => (
              <li key={b.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                <p className="font-semibold text-slate-900">{b.title}</p>
                <p className="text-slate-600">{b.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {AUDIENCE[b.audience]} · {b.recipients} recipients · {b.sentBy ?? 'Admin'} · {formatDate(b.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Dialog
        variant="center"
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send this announcement?"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button loading={send.isPending} onClick={() => send.mutate()}>
              Send to {AUDIENCE[audience].toLowerCase()}
            </Button>
          </div>
        }
      >
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-slate-600">{body}</p>
        </div>
        <p className="mt-3 text-sm text-slate-500">This can't be unsent. It is recorded in the audit log.</p>
        {send.isError && <Alert className="mt-3">{send.error.message}</Alert>}
      </Dialog>
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────

const SERIES = { bookings: '#2563EB', completed: '#EB6834' } as const;

function csvCell(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(r: ReportDto) {
  const rupees = (p: number) => (p / 100).toFixed(2);
  const rows: unknown[][] = [
    ['FIXORA report', `${formatDate(r.from)} – ${formatDate(r.to)}`],
    [],
    ['Summary'],
    ['Bookings', r.bookings],
    ['Completed', r.completed],
    ['Cancelled', r.cancelled],
    ['Cancellation rate %', r.cancellationRate],
    ['Revenue (INR)', rupees(r.revenue)],
    ['Commission (INR)', rupees(r.commission)],
    ['Technician earnings (INR)', rupees(r.technicianEarnings)],
    ['Average booking value (INR)', rupees(r.averageBookingValue)],
    ['New customers', r.newCustomers],
    ['Repeat customers', r.repeatCustomers],
    ['New technicians', r.newTechnicians],
    ['Average rating', r.averageRating],
    [],
    ['Date', 'Bookings', 'Completed', 'Revenue (INR)'],
    ...r.daily.map((d) => [d.date, d.bookings, d.completed, rupees(d.revenue)]),
    [],
    ['Service', 'Bookings', 'Revenue (INR)'],
    ...r.topServices.map((s) => [s.name, s.bookings, rupees(s.revenue)]),
    [],
    ['Location', 'Bookings', 'Revenue (INR)'],
    ...r.topLocations.map((s) => [s.name, s.bookings, rupees(s.revenue)]),
    [],
    ['Technician', 'Jobs', 'Earnings (INR)', 'Rating', 'Acceptance %'],
    ...r.technicianPerformance.map((t) => [t.name, t.jobs, rupees(t.earnings), t.rating, t.acceptanceRate ?? '']),
  ];
  const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fixora-report-${isoDay(new Date(r.from))}-to-${isoDay(new Date(r.to))}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ReportsPage() {
  const { get, set } = useUrlParams();
  const [defaults] = useState(() => ({ from: isoDay(new Date(Date.now() - 29 * 86_400_000)), to: isoDay(new Date()) }));
  const from = get('from') ?? defaults.from;
  const to = get('to') ?? defaults.to;
  const report = useQuery({
    queryKey: ['admin', 'report', from, to],
    queryFn: () => adminModulesApi.report(`${from}T00:00:00+05:30`, `${to}T23:59:59+05:30`),
    placeholderData: keepPreviousData,
  });
  const r = report.data;

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle
        icon={ChartColumn}
        title="Reports"
        subtitle="Bookings, revenue, commission and partner performance for any date range (IST)."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              From <input type="date" value={from} max={to} onChange={(e) => set({ from: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              To <input type="date" value={to} min={from} onChange={(e) => set({ to: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
            </label>
            <Button variant="outline" disabled={!r} onClick={() => r && downloadCsv(r)} leftIcon={<Download className="size-4" />}>
              CSV
            </Button>
          </>
        }
      />
      {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}
      {report.isPending && <Skeleton className="mt-6 h-96" />}
      {r && (
        <div className={cx('mt-6 flex flex-col gap-4', report.isFetching && 'opacity-70')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Bookings" value={r.bookings} hint={`${r.completed} completed · ${r.cancelled} cancelled`} />
            <StatTile label="Revenue" value={formatINR(r.revenue)} hint={`Avg ${formatINR(r.averageBookingValue)} per booking`} />
            <StatTile label="FIXORA commission" value={formatINR(r.commission)} tone="success" hint={`Partners earned ${formatINR(r.technicianEarnings)}`} />
            <StatTile label="Cancellation rate" value={`${r.cancellationRate}%`} tone={r.cancellationRate > 15 ? 'warning' : undefined} />
            <StatTile label="New customers" value={r.newCustomers} hint={`${r.repeatCustomers} repeat customers`} />
            <StatTile label="New technicians" value={r.newTechnicians} />
            <StatTile label="Average rating" value={r.ratings ? r.averageRating.toFixed(2) : '—'} hint={`${r.ratings} reviews`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Bookings per day">
              <Legend
                items={[
                  { label: 'Booked', color: SERIES.bookings },
                  { label: 'Completed', color: SERIES.completed },
                ]}
              />
              <div className="mt-3 h-64" role="img" aria-label="Bar chart of bookings and completed jobs per day">
                <ResponsiveContainer>
                  <BarChart data={r.daily} barCategoryGap="24%" barGap={2} margin={{ left: -18, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="#EEF2F7" />
                    <XAxis dataKey="date" {...axis} tickFormatter={(v: string) => formatDate(`${v}T12:00:00+05:30`).slice(0, 6)} interval="preserveStartEnd" />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip />} />
                    <Bar dataKey="bookings" name="Booked" fill={SERIES.bookings} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill={SERIES.completed} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="Revenue per day">
              <div className="h-[276px]" role="img" aria-label="Bar chart of revenue per day">
                <ResponsiveContainer>
                  <BarChart data={r.daily} barCategoryGap="24%" margin={{ left: -6, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="#EEF2F7" />
                    <XAxis dataKey="date" {...axis} tickFormatter={(v: string) => formatDate(`${v}T12:00:00+05:30`).slice(0, 6)} interval="preserveStartEnd" />
                    <YAxis {...axis} tickFormatter={compactINR} width={52} />
                    <Tooltip cursor={{ fill: '#F1F5F9' }} content={<ChartTooltip money />} />
                    <Bar dataKey="revenue" name="Revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankCard title="Top services" rows={r.topServices} />
            <RankCard title="Top locations" rows={r.topLocations} />
          </div>

          <Card title="Technician performance">
            <DataTable
              columns={[
                { header: 'Technician', cell: (t) => <span className="font-medium text-slate-900">{t.name}</span> },
                { header: 'Jobs', className: 'text-right', cell: (t) => t.jobs },
                { header: 'Earnings', className: 'text-right whitespace-nowrap', cell: (t) => formatINR(t.earnings) },
                { header: 'Rating', className: 'text-right', cell: (t) => (t.rating ? t.rating.toFixed(1) : '—') },
                { header: 'Acceptance', className: 'text-right', cell: (t) => (t.acceptanceRate == null ? '—' : `${t.acceptanceRate}%`) },
              ]}
              rows={r.technicianPerformance}
              rowKey={(t) => t.name}
              empty="No technician activity in this range"
              minWidth={600}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: { name: string; bookings: number; revenue: number }[] }) {
  const max = Math.max(1, ...rows.map((x) => x.bookings));
  return (
    <Card title={title}>
      {rows.length === 0 && <p className="text-sm text-slate-500">No bookings in this range.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((x) => (
          <li key={x.name} className="text-sm">
            <div className="flex justify-between gap-3">
              <span className="truncate font-medium text-slate-900">{x.name}</span>
              <span className="shrink-0 text-slate-600 tabular-nums">
                {x.bookings} · {formatINR(x.revenue)}
              </span>
            </div>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-[#2563EB]" style={{ width: `${(x.bookings / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────

const SETTING_LABEL: Record<string, { label: string; unit?: string }> = {
  'pricing.taxPercent': { label: 'GST', unit: '%' },
  'commission.globalPercent': { label: 'Default commission', unit: '%' },
  'dispatch.requestTimeoutSeconds': { label: 'Offer timeout', unit: 'seconds' },
  'dispatch.maxAttempts': { label: 'Automatic offers per booking' },
  'dispatch.searchRadiusKm': { label: 'Search radius', unit: 'km' },
  'dispatch.weights': { label: 'Ranking weights' },
  'support.phone': { label: 'Support phone' },
  'support.email': { label: 'Support email' },
};

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminModulesApi.settings });
  const groups = [
    { title: 'Pricing & commission', prefix: ['pricing.', 'commission.'] },
    { title: 'Dispatch', prefix: ['dispatch.'] },
    { title: 'Support contacts', prefix: ['support.'] },
  ];
  return (
    <div className="mx-auto max-w-[900px]">
      <PageTitle icon={Settings} title="Settings" subtitle="Platform rules. Every change applies immediately and is recorded in the audit log." />
      {settings.isPending && <Skeleton className="mt-6 h-96" />}
      {settings.isError && <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />}
      {settings.data &&
        groups.map((g) => (
          <Card key={g.title} title={g.title} className="mt-5">
            <ul className="divide-y divide-slate-100">
              {settings.data
                .filter((s) => g.prefix.some((p) => s.key.startsWith(p)))
                .map((s) => (
                  <SettingRow key={`${s.key}:${JSON.stringify(s.value)}`} s={s} />
                ))}
            </ul>
          </Card>
        ))}
    </div>
  );
}

function SettingRow({ s }: { s: SettingDto }) {
  const qc = useQueryClient();
  const meta = SETTING_LABEL[s.key] ?? { label: s.key };
  const [draft, setDraft] = useState<unknown>(s.value);
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.value);
  const save = useMutation({
    mutationFn: () => adminModulesApi.updateSetting(s.key, draft),
    onSuccess: (all) => {
      qc.setQueryData(['admin', 'settings'], all);
      toast(`${meta.label} saved`);
    },
  });

  let editor;
  if (typeof s.value === 'number') {
    editor = (
      <span className="flex items-center gap-2">
        <input type="number" step="any" value={draft as number} onChange={(e) => setDraft(e.target.value === '' ? '' : Number(e.target.value))} className={cx(inputCls, 'w-28')} aria-label={meta.label} />
        {meta.unit && <span className="text-sm text-slate-500">{meta.unit}</span>}
      </span>
    );
  } else if (typeof s.value === 'string') {
    editor = <input value={draft as string} onChange={(e) => setDraft(e.target.value)} className={cx(inputCls, 'w-64')} aria-label={meta.label} />;
  } else {
    const obj = draft as Record<string, number>;
    editor = (
      <span className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.keys(s.value as object).map((k) => (
          <label key={k} className="text-xs text-slate-500">
            {humanize(k)}
            <input type="number" step="0.1" min={0} max={5} value={obj[k]} onChange={(e) => setDraft({ ...obj, [k]: Number(e.target.value) })} className={cx(inputCls, 'mt-0.5 w-24')} />
          </label>
        ))}
      </span>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-[220px] flex-1">
        <p className="font-medium text-slate-900">{meta.label}</p>
        <p className="text-sm text-slate-500">{s.description}</p>
        {s.updatedAt && <p className="text-xs text-slate-400">Updated {timeAgo(s.updatedAt)}</p>}
        {save.isError && <p className="mt-1 text-sm text-danger">{save.error.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        {editor}
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </li>
  );
}

// ─── Audit logs ──────────────────────────────────────────────────────────

export function AuditLogsPage() {
  const { get, set, page } = useUrlParams();
  const action = get('action');
  const q = get('q');
  const [expanded, setExpanded] = useState<string | null>(null);
  const actions = useQuery({ queryKey: ['admin', 'audit-actions'], queryFn: adminModulesApi.auditActions, staleTime: 5 * 60_000 });
  const logs = useQuery({
    queryKey: ['admin', 'audit', { action, q, page }],
    queryFn: () => adminModulesApi.auditLogs({ action, q, page, pageSize: 30 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={FileText} title="Audit Logs" subtitle="Every sensitive admin action: who, what, when and from where. Read-only." />
      <Card className="mt-6">
        <div className="flex flex-wrap gap-3">
          <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Search by person or record id" />
          <FilterSelect label="All actions" value={action} options={(actions.data ?? []).map((a) => ({ value: a, label: humanize(a) }))} onChange={(v) => set({ action: v })} />
        </div>
        {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
        {logs.isPending && <Skeleton className="mt-4 h-72" />}
        {logs.data && (
          <div className="-mx-5 mt-4 overflow-x-auto">
            <table className={cx('w-full min-w-[900px] text-left text-sm', logs.isFetching && 'opacity-70')}>
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-[13px] text-slate-500">
                  {['When', 'Who', 'Action', 'Record', 'IP', ''].map((h) => (
                    <th key={h} scope="col" className="px-5 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.data.items.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="text-slate-700">
                      <td className="px-5 py-3 whitespace-nowrap">
                        {formatDate(l.createdAt)}, {formatTime(l.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        {l.actorName ?? 'System'} {l.actorRole && <span className="text-xs text-slate-500">({ROLE_LABEL[l.actorRole]})</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Pill tone="blue">{humanize(l.action)}</Pill>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {l.entity}
                        {l.entityId && ` · ${l.entityId.slice(0, 18)}`}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.ip ?? '—'}</td>
                      <td className="px-5 py-3 text-right">
                        {(l.oldValue != null || l.newValue != null) && (
                          <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="text-sm font-medium text-fixora-blue" aria-expanded={expanded === l.id}>
                            {expanded === l.id ? 'Hide' : 'Details'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === l.id && <AuditDiff l={l} />}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {logs.data.items.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No audit entries match.</p>}
          </div>
        )}
        {logs.data && <Pager page={page} total={logs.data.total} pageSize={30} onPage={(p) => set({ page: String(p) })} noun="entries" />}
      </Card>
    </div>
  );
}

function AuditDiff({ l }: { l: AuditLogDto }) {
  const block = (label: string, v: unknown) => (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      <pre className="max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{v == null ? '—' : JSON.stringify(v, null, 2)}</pre>
    </div>
  );
  return (
    <tr>
      <td colSpan={6} className="bg-slate-50 px-5 py-3">
        <div className="flex flex-col gap-3 md:flex-row">
          {block('Before', l.oldValue)}
          {block('After', l.newValue)}
        </div>
      </td>
    </tr>
  );
}

// ─── System settings ─────────────────────────────────────────────────────

export function SystemSettingsPage() {
  const status = useQuery({ queryKey: ['admin', 'system'], queryFn: adminModulesApi.system, refetchInterval: 30_000 });
  const s = status.data;
  return (
    <div className="mx-auto max-w-[1000px]">
      <PageTitle icon={Settings2} title="System Settings" subtitle="Integration health. Keys and secrets live in the server environment and are never shown here." />
      {status.isPending && <Skeleton className="mt-6 h-72" />}
      {status.isError && <ErrorState error={status.error} onRetry={() => void status.refetch()} />}
      {s && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatTile label="Environment" value={humanize(s.environment)} />
            <StatTile label="Version" value={s.version} />
            <StatTile label="Database" value={s.database.ok ? 'Healthy' : 'Down'} hint={`${s.database.latencyMs} ms`} tone={s.database.ok ? 'success' : 'danger'} />
          </div>
          <Card title="Integrations" className="mt-4">
            <ul className="divide-y divide-slate-100">
              {s.integrations.map((i) => (
                <li key={i.name} className="flex items-center gap-3 py-3">
                  {i.configured ? <CircleCheck className="size-5 shrink-0 text-success" aria-hidden /> : <CircleX className="size-5 shrink-0 text-slate-400" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">{i.name}</span>
                    <span className="text-sm text-slate-500">{i.detail}</span>
                  </span>
                  <Pill tone={i.configured ? 'green' : 'gray'}>{i.configured ? 'Configured' : 'Not configured'}</Pill>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Background workers" className="mt-4">
            <ul className="divide-y divide-slate-100 text-sm">
              {s.workers.map((w) => (
                <li key={w.name} className="flex justify-between gap-3 py-2.5">
                  <span className="font-medium text-slate-900">{w.name}</span>
                  <span className="text-slate-500">{w.detail}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
