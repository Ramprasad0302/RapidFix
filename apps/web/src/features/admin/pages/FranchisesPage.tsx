import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Download, Eye, FileUp, MapPinPlus, Pencil, Plus, Store } from 'lucide-react';
import { hasPermission, Permission, type FranchiseDetailDto, type FranchiseRowDto, type FranchiseStatsDto, type FranchiseStatus } from '@fixora/shared-types';
import { formatINR, formatIndianPhone, franchiseSchema, type FranchiseFormInput } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { ErrorState, Skeleton } from '../../../components/States';
import { Pill } from '../../../components/StatusBadge';
import { adminModulesApi, documentUploadApi, downloadExport, franchiseApi, type ExportKind } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { toast } from '../../../store/toast';
import { STATES } from '../../customer/components/AddressForm';
import { PrivateThumb } from '../../technician/pages/AccountPages';
import { AddLocalityDialog } from '../components/AddLocalityDialog';
import { Card } from '../components/Card';
import { Facts, Field, inputCls, isoDay, PageTitle, ReasonDialog, Section, StatTile } from '../components/kit';

const STATUS_TONE: Record<FranchiseStatus, 'green' | 'amber' | 'red'> = { ACTIVE: 'green', SUSPENDED: 'amber', TERMINATED: 'red' };
const STATUS_LABEL: Record<FranchiseStatus, string> = { ACTIVE: 'Active', SUSPENDED: 'Suspended', TERMINATED: 'Terminated' };

/** CSV downloads (open in Excel / Google Sheets). Franchise managers get only their franchise. */
export function ExportButtons({ kinds, range }: { kinds: ExportKind[]; range?: { from?: string; to?: string } }) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const label: Record<ExportKind, string> = { franchises: 'Franchises', technicians: 'Technicians', customers: 'Customers', addresses: 'Addresses', bookings: 'Bookings' };
  return (
    <div className="flex flex-wrap gap-2">
      {kinds.map((k) => (
        <Button
          key={k}
          size="sm"
          variant="outline"
          loading={busy === k}
          leftIcon={<Download className="size-4" />}
          onClick={async () => {
            setBusy(k);
            try {
              await downloadExport(k, range);
            } catch (e) {
              toast((e as Error).message, 'error');
            } finally {
              setBusy(null);
            }
          }}
        >
          {label[k]}
        </Button>
      ))}
    </div>
  );
}

function StatsLine({ s, pct }: { s: FranchiseStatsDto; pct: number }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">Bookings</dt>
        <dd className="font-semibold text-slate-900">{s.bookings}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Revenue</dt>
        <dd className="font-semibold text-slate-900">{formatINR(s.revenue)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">RapidFix commission</dt>
        <dd className="font-semibold text-slate-900">{formatINR(s.commission)}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Franchise share ({pct}%)</dt>
        <dd className="font-semibold text-success">{formatINR(s.share)}</dd>
      </div>
    </dl>
  );
}

// ─── List + report ───────────────────────────────────────────────────────

export function FranchisesPage() {
  const list = useQuery({ queryKey: ['admin', 'franchises'], queryFn: franchiseApi.list });
  const rows = list.data ?? [];
  const active = rows.filter((f) => f.status === 'ACTIVE');
  const month = rows.reduce((t, f) => ({ bookings: t.bookings + f.month.bookings, revenue: t.revenue + f.month.revenue, share: t.share + f.month.share }), { bookings: 0, revenue: 0, share: 0 });

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageTitle
        icon={Store}
        title="Franchises"
        subtitle="Each franchise runs its town's bookings, technicians and customers. You see everything."
        actions={
          <Link to="/admin/franchises/new">
            <Button leftIcon={<Plus className="size-4.5" />}>New franchise</Button>
          </Link>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active franchises" value={list.data ? `${active.length} / ${rows.length}` : '—'} />
        <StatTile label="Franchise bookings (this month)" value={list.data ? month.bookings : '—'} />
        <StatTile label="Franchise revenue (this month)" value={list.data ? formatINR(month.revenue) : '—'} />
        <StatTile label="Owed to franchises (this month)" value={list.data ? formatINR(month.share) : '—'} tone="success" />
      </div>

      {list.isPending && <Skeleton className="mt-5 h-64" />}
      {list.isError && !list.data && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data && rows.length === 0 && (
        <Card className="mt-5">
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Building2 className="size-10 text-fixora-blue" aria-hidden />
            <p className="text-lg font-semibold text-slate-900">No franchises yet</p>
            <p className="max-w-md text-sm text-slate-500">Add a franchise for a town, e.g. Tadepalligudem. Its manager signs in with their mobile number and sees only that town.</p>
            <Link to="/admin/franchises/new">
              <Button leftIcon={<Plus className="size-4.5" />}>New franchise</Button>
            </Link>
          </div>
        </Card>
      )}

      <ul className="mt-5 flex flex-col gap-4">
        {rows.map((f) => (
          <li key={f.id}>
            <FranchiseCard f={f} />
          </li>
        ))}
      </ul>

      <FranchiseReport />

      <Card title="Download complete data" className="mt-5">
        <p className="mb-3 text-sm text-slate-500">Spreadsheets (CSV) with every franchise, technician, customer, saved address and booking. Each row shows its franchise.</p>
        <ExportButtons kinds={['franchises', 'technicians', 'customers', 'addresses', 'bookings']} />
      </Card>
    </div>
  );
}

function FranchiseCard({ f }: { f: FranchiseRowDto }) {
  return (
    <Link to={`/admin/franchises/${f.id}`} className="block rounded-2xl border border-slate-200/70 bg-white p-4 shadow-card transition hover:border-fixora-blue/40 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-500">{f.code}</p>
          <p className="text-lg font-semibold text-slate-900">{f.name}</p>
          <p className="text-sm text-slate-600">
            {f.ownerName} · {formatIndianPhone(f.ownerPhone)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="blue">{f.commissionPercent}% share</Pill>
          <Pill tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Pill>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {f.localities.length ? (
          f.localities.map((l) => (
            <span key={l.id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
              {l.name} · {l.radiusKm} km
            </span>
          ))
        ) : (
          <span className="text-xs text-warning">No localities attached — it gets no bookings yet.</span>
        )}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-1 text-xs font-medium text-slate-500">This month</p>
        <StatsLine s={f.month} pct={f.commissionPercent} />
      </div>
    </Link>
  );
}

function FranchiseReport() {
  const today = isoDay(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const report = useQuery({
    queryKey: ['admin', 'franchises', 'report', from, to],
    queryFn: () => franchiseApi.report(`${from}T00:00:00+05:30`, `${to}T23:59:59+05:30`),
    enabled: !!from && !!to && from <= to,
  });
  const cols = ['Franchise', 'Bookings', 'Completed', 'Cancelled', 'Revenue', 'Commission', 'Share %', 'Franchise share', 'Technicians', 'Customers'];
  return (
    <Card
      title="Franchise report"
      className="mt-5"
      action={
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="h-9 rounded-lg border border-slate-300 px-2" />
          <span className="text-slate-500">to</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} aria-label="To" className="h-9 rounded-lg border border-slate-300 px-2" />
        </div>
      }
    >
      {report.isPending && <Skeleton className="h-40" />}
      {report.isError && <ErrorState error={report.error} onRetry={() => void report.refetch()} />}
      {report.data && (
        <>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50/70 text-[13px] text-slate-500">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="px-4 py-2.5 font-medium whitespace-nowrap sm:px-5">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.data.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="px-4 py-2.5 sm:px-5">
                      <span className="font-medium text-slate-900">{r.name}</span> <span className="text-xs text-slate-500">{r.code}</span>
                    </td>
                    <td className="px-4 py-2.5 sm:px-5">{r.bookings}</td>
                    <td className="px-4 py-2.5 sm:px-5">{r.completed}</td>
                    <td className="px-4 py-2.5 sm:px-5">{r.cancelled}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap sm:px-5">{formatINR(r.revenue)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap sm:px-5">{formatINR(r.commission)}</td>
                    <td className="px-4 py-2.5 sm:px-5">{r.franchiseId ? `${r.commissionPercent}%` : '—'}</td>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap text-success sm:px-5">{r.franchiseId ? formatINR(r.share) : '—'}</td>
                    <td className="px-4 py-2.5 sm:px-5">{r.technicians}</td>
                    <td className="px-4 py-2.5 sm:px-5">{r.customers}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2.5 sm:px-5">Total</td>
                  <td className="px-4 py-2.5 sm:px-5">{report.data.totals.bookings}</td>
                  <td className="px-4 py-2.5 sm:px-5">{report.data.totals.completed}</td>
                  <td className="px-4 py-2.5 sm:px-5">{report.data.totals.cancelled}</td>
                  <td className="px-4 py-2.5 sm:px-5">{formatINR(report.data.totals.revenue)}</td>
                  <td className="px-4 py-2.5 sm:px-5">{formatINR(report.data.totals.commission)}</td>
                  <td className="px-4 py-2.5 sm:px-5" />
                  <td className="px-4 py-2.5 text-success sm:px-5">{formatINR(report.data.totals.share)}</td>
                  <td className="px-4 py-2.5 sm:px-5">{report.data.totals.technicians}</td>
                  <td className="px-4 py-2.5 sm:px-5">{report.data.totals.customers}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Revenue and commission count completed, paid bookings. Franchise share = RapidFix commission × the franchise's agreed %. Technicians and customers are current totals.
          </p>
          <div className="mt-3">
            <ExportButtons kinds={['bookings']} range={{ from: `${from}T00:00:00+05:30`, to: `${to}T23:59:59+05:30` }} />
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────

export function FranchiseDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const isSuper = !!role && hasPermission(role, Permission.ADMINS_MANAGE);
  const f = useQuery({ queryKey: ['admin', 'franchises', id], queryFn: () => franchiseApi.detail(id) });
  const [aadhaar, setAadhaar] = useState<string | null>(null);
  const [statusTo, setStatusTo] = useState<FranchiseStatus | null>(null);
  const reveal = useMutation({ mutationFn: () => franchiseApi.revealAadhaar(id), onSuccess: (r) => setAadhaar(r.aadhaar), onError: (e) => toast((e as Error).message, 'error') });
  const setStatus = useMutation({
    mutationFn: ({ status, reason }: { status: FranchiseStatus; reason: string }) => franchiseApi.setStatus(id, status, reason),
    onSuccess: (d) => {
      qc.setQueryData(['admin', 'franchises', id], d);
      void qc.invalidateQueries({ queryKey: ['admin', 'franchises'] });
      setStatusTo(null);
      toast(`Franchise ${STATUS_LABEL[d.status].toLowerCase()}`);
    },
  });

  if (f.isPending) return <Skeleton className="mx-auto h-96 max-w-[1100px]" />;
  if (f.isError) return <ErrorState error={f.error} onRetry={() => void f.refetch()} />;
  const d = f.data;
  const money = (p: number) => formatINR(p);

  return (
    <div className="mx-auto max-w-[1100px]">
      <Link to="/admin/franchises" className="text-sm font-medium text-fixora-blue">
        ← All franchises
      </Link>
      <PageTitle
        icon={Store}
        title={d.name}
        subtitle={`${d.code} · ${d.town}, ${d.district}`}
        actions={
          <>
            <Link to={`/admin/franchises/${d.id}/edit`}>
              <Button variant="outline" leftIcon={<Pencil className="size-4" />}>
                Edit
              </Button>
            </Link>
            {d.status === 'ACTIVE' ? (
              <Button variant="outline" onClick={() => setStatusTo('SUSPENDED')}>
                Suspend
              </Button>
            ) : (
              <Button onClick={() => setStatusTo('ACTIVE')}>Activate</Button>
            )}
            {d.status !== 'TERMINATED' && (
              <Button variant="danger" onClick={() => setStatusTo('TERMINATED')}>
                End agreement
              </Button>
            )}
          </>
        }
      />
      <div className="mt-2">
        <Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="This month">
          <StatsLine s={d.month} pct={d.commissionPercent} />
          <p className="mt-3 text-sm text-slate-600">
            {d.month.technicians} verified technicians · {d.month.customers} customers
          </p>
        </Card>
        <Card title="All time">
          <StatsLine s={d.total} pct={d.commissionPercent} />
          <p className="mt-3 text-sm text-slate-600">
            {d.total.completed} completed · {d.total.cancelled} cancelled
          </p>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card title="Franchise manager">
          <Facts
            items={[
              ['Name', d.ownerName],
              ['Mobile (sign-in)', formatIndianPhone(d.ownerPhone)],
              ['Email', d.ownerEmail ?? '—'],
              ['Date of birth', d.ownerDateOfBirth ? formatDate(d.ownerDateOfBirth) : '—'],
              ['Address', `${d.ownerAddress} - ${d.ownerPincode}`],
              ['Emergency contact', d.emergencyContact ? formatIndianPhone(d.emergencyContact) : '—'],
            ]}
          />
        </Card>
        <Card title="Agreement">
          <Facts
            items={[
              ['Commission share', `${d.commissionPercent}% of RapidFix commission`],
              ['Start', formatDate(d.agreementStart)],
              ['End', d.agreementEnd ? formatDate(d.agreementEnd) : 'Open-ended'],
              ['Security deposit', money(d.depositAmount)],
              ['Business', d.businessName ?? '—'],
              ['GSTIN', d.gstin ?? '—'],
            ]}
          />
          {d.agreementUrl && (
            <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
              <PrivateThumb path={d.agreementUrl} /> Agreement document
            </div>
          )}
        </Card>
        <Card title="KYC">
          <Facts
            items={[
              [
                'Aadhaar',
                <span key="a" className="flex items-center gap-2">
                  {aadhaar ?? d.aadhaarMasked}
                  {isSuper && !aadhaar && (
                    <button type="button" onClick={() => reveal.mutate()} className="inline-flex items-center gap-1 text-xs font-semibold text-fixora-blue">
                      <Eye className="size-3.5" aria-hidden /> Show
                    </button>
                  )}
                </span>,
              ],
              ['PAN', d.panNumber ?? '—'],
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span className="flex flex-col items-center gap-1">
              <PrivateThumb path={d.aadhaarFrontUrl} className="size-20" /> Aadhaar front
            </span>
            {d.aadhaarBackUrl && (
              <span className="flex flex-col items-center gap-1">
                <PrivateThumb path={d.aadhaarBackUrl} className="size-20" /> Aadhaar back
              </span>
            )}
            {d.panPhotoUrl && (
              <span className="flex flex-col items-center gap-1">
                <PrivateThumb path={d.panPhotoUrl} className="size-20" /> PAN
              </span>
            )}
          </div>
        </Card>
        <Card title="Payouts to franchise">
          <Facts
            items={[
              ['Account holder', d.bankAccountHolder ?? '—'],
              ['Account', d.bankAccountLast4 ? `XXXX${d.bankAccountLast4}` : '—'],
              ['IFSC', d.bankIfsc ?? '—'],
              ['UPI', d.upiId ?? '—'],
            ]}
          />
        </Card>
      </div>

      <Card title={`Localities (${d.localities.length})`} className="mt-5">
        {d.localities.length === 0 ? (
          <p className="text-sm text-warning">No localities yet — edit the franchise to attach towns. Until then it receives no bookings.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {d.localities.map((l) => (
              <li key={l.id} className={cx('rounded-xl border px-3 py-2 text-sm', l.isActive ? 'border-slate-200' : 'border-dashed border-slate-300 text-slate-500')}>
                <span className="font-medium">{l.name}</span> · {l.radiusKm} km {!l.isActive && '(off)'}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {d.notes && (
        <Card title="Notes" className="mt-5">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{d.notes}</p>
        </Card>
      )}

      <ReasonDialog
        open={!!statusTo}
        title={statusTo === 'ACTIVE' ? 'Activate franchise' : statusTo === 'SUSPENDED' ? 'Suspend franchise' : 'End the agreement'}
        body={
          statusTo === 'ACTIVE'
            ? 'The manager can sign in again and new bookings in its localities go to the franchise.'
            : 'The manager is signed out and can no longer sign in. New bookings in its localities go to RapidFix head office. History is kept.'
        }
        confirmLabel={statusTo === 'ACTIVE' ? 'Activate' : statusTo === 'SUSPENDED' ? 'Suspend' : 'End agreement'}
        danger={statusTo !== 'ACTIVE'}
        pending={setStatus.isPending}
        error={setStatus.error ? (setStatus.error as Error).message : null}
        onConfirm={(reason) => statusTo && setStatus.mutate({ status: statusTo, reason })}
        onClose={() => setStatusTo(null)}
      />
    </div>
  );
}

// ─── Create / edit ───────────────────────────────────────────────────────

type FormState = Record<Exclude<keyof FranchiseFormInput, 'localityIds'>, string> & { localityIds: string[] };

const EMPTY: FormState = {
  name: '',
  town: '',
  district: '',
  state: 'Andhra Pradesh',
  ownerName: '',
  ownerPhone: '',
  ownerEmail: '',
  ownerDateOfBirth: '',
  ownerAddress: '',
  ownerPincode: '',
  aadhaarNumber: '',
  aadhaarFrontUrl: '',
  aadhaarBackUrl: '',
  panNumber: '',
  panPhotoUrl: '',
  gstin: '',
  businessName: '',
  commissionPercent: '',
  agreementStart: '',
  agreementEnd: '',
  agreementUrl: '',
  depositAmount: '',
  bankAccountHolder: '',
  bankIfsc: '',
  bankAccountNumber: '',
  upiId: '',
  emergencyContact: '',
  notes: '',
  localityIds: [],
};

const fromDetail = (d: FranchiseDetailDto): FormState => ({
  ...EMPTY,
  name: d.name,
  town: d.town,
  district: d.district,
  state: d.state,
  ownerName: d.ownerName,
  ownerPhone: d.ownerPhone.replace(/^\+91/, ''),
  ownerEmail: d.ownerEmail ?? '',
  ownerDateOfBirth: d.ownerDateOfBirth ?? '',
  ownerAddress: d.ownerAddress,
  ownerPincode: d.ownerPincode,
  aadhaarFrontUrl: d.aadhaarFrontUrl,
  aadhaarBackUrl: d.aadhaarBackUrl ?? '',
  panNumber: d.panNumber ?? '',
  panPhotoUrl: d.panPhotoUrl ?? '',
  gstin: d.gstin ?? '',
  businessName: d.businessName ?? '',
  commissionPercent: String(d.commissionPercent),
  agreementStart: d.agreementStart,
  agreementEnd: d.agreementEnd ?? '',
  agreementUrl: d.agreementUrl ?? '',
  depositAmount: d.depositAmount ? String(d.depositAmount / 100) : '',
  bankAccountHolder: d.bankAccountHolder ?? '',
  bankIfsc: d.bankIfsc ?? '',
  upiId: d.upiId ?? '',
  emergencyContact: d.emergencyContact?.replace(/^\+91/, '') ?? '',
  notes: d.notes ?? '',
  localityIds: d.localities.map((l) => l.id),
});

export function FranchiseFormPage() {
  const { id } = useParams();
  const existing = useQuery({ queryKey: ['admin', 'franchises', id], queryFn: () => franchiseApi.detail(id!), enabled: !!id });
  if (id && existing.isPending) return <Skeleton className="mx-auto h-96 max-w-[900px]" />;
  if (id && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />;
  return <FranchiseForm key={id ?? 'new'} existing={existing.data ?? null} />;
}

function FranchiseForm({ existing }: { existing: FranchiseDetailDto | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = !!existing;
  const [v, setV] = useState<FormState>(existing ? fromDetail(existing) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [addLocality, setAddLocality] = useState(false);
  const areas = useQuery({ queryKey: ['admin', 'service-area'], queryFn: adminModulesApi.serviceArea });
  const set = (k: keyof FormState) => (value: string) => setV((s) => ({ ...s, [k]: value }));

  // Localities this franchise may take: unassigned ones, or its own.
  const available = useMemo(() => (areas.data?.locations ?? []).filter((l) => !l.franchiseId || l.franchiseId === existing?.id), [areas.data, existing?.id]);
  const taken = useMemo(() => (areas.data?.locations ?? []).filter((l) => l.franchiseId && l.franchiseId !== existing?.id), [areas.data, existing?.id]);

  const save = useMutation({
    mutationFn: (body: FranchiseFormInput) => (existing ? franchiseApi.update(existing.id, body) : franchiseApi.create(body)),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'franchises'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'service-area'] });
      qc.setQueryData(['admin', 'franchises', d.id], d);
      toast(editing ? 'Franchise saved' : `${d.name} created — ${d.ownerName} can sign in with ${formatIndianPhone(d.ownerPhone)}`);
      navigate(`/admin/franchises/${d.id}`, { replace: true });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const submit = () => {
    const body: FranchiseFormInput = { ...v, depositAmount: v.depositAmount ? Math.round(Number(v.depositAmount) * 100) : 0, commissionPercent: v.commissionPercent };
    const parsed = franchiseSchema.safeParse(body);
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof FormState] ??= i.message;
    if (!editing && !v.aadhaarNumber) errs.aadhaarNumber ??= 'Enter the 12-digit Aadhaar number';
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast('Please fix the highlighted fields', 'error');
      return;
    }
    save.mutate(body);
  };

  const text = (k: keyof FormState, label: string, opts: { type?: string; hint?: string; placeholder?: string; inputMode?: 'numeric' | 'email' | 'tel' | 'decimal'; maxLength?: number; disabled?: boolean } = {}) => (
    <Field label={label} hint={errors[k] ? undefined : opts.hint}>
      <input
        type={opts.type ?? 'text'}
        value={v[k] as string}
        onChange={(e) => set(k)(e.target.value)}
        placeholder={opts.placeholder}
        inputMode={opts.inputMode}
        maxLength={opts.maxLength}
        disabled={opts.disabled}
        aria-invalid={!!errors[k]}
        className={cx(inputCls, errors[k] && 'border-danger', opts.disabled && 'bg-slate-50 text-slate-500')}
      />
      {errors[k] && <span className="mt-1 block text-xs text-danger">{errors[k]}</span>}
    </Field>
  );

  return (
    <div className="mx-auto max-w-[900px] pb-24">
      <Link to={existing ? `/admin/franchises/${existing.id}` : '/admin/franchises'} className="text-sm font-medium text-fixora-blue">
        ← Back
      </Link>
      <PageTitle icon={Store} title={editing ? `Edit ${existing.name}` : 'New franchise'} subtitle="The manager signs in with the mobile number below and sees only this franchise's towns." />

      <Section title="Franchise">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('name', 'Franchise name', { placeholder: 'e.g. RapidFix Tadepalligudem' })}
          {text('town', 'Town / city of the franchise', { placeholder: 'e.g. Tadepalligudem' })}
          {text('district', 'District', { placeholder: 'e.g. West Godavari' })}
          <Field label="State">
            <select value={v.state} onChange={(e) => set('state')(e.target.value)} className={inputCls}>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Localities this franchise runs"
        action={
          <Button size="sm" variant="outline" leftIcon={<MapPinPlus className="size-4" />} onClick={() => setAddLocality(true)}>
            Add new locality
          </Button>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Bookings inside these localities go to this franchise, and attaching a switched-off (“off”) locality switches it on. A locality belongs to one franchise only.</p>
        {areas.isPending && <Skeleton className="h-20" />}
        <div className="flex flex-wrap gap-2">
          {available.map((l) => {
            const on = v.localityIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => setV((s) => ({ ...s, localityIds: on ? s.localityIds.filter((x) => x !== l.id) : [...s.localityIds, l.id] }))}
                className={cx('rounded-xl border px-3 py-2 text-sm', on ? 'border-fixora-blue bg-fixora-blue-soft font-semibold text-fixora-blue' : 'border-slate-200 text-slate-700')}
              >
                {l.name} <span className="text-xs font-normal text-slate-500">· {l.radiusKm} km{!l.isActive && ' · off'}</span>
              </button>
            );
          })}
          {areas.data && available.length === 0 && <p className="text-sm text-slate-500">No free localities. Add a new one.</p>}
        </div>
        {taken.length > 0 && <p className="mt-2 text-xs text-slate-500">Already with other franchises: {taken.map((l) => `${l.name} (${l.franchise})`).join(', ')}</p>}
      </Section>

      <Section title="Franchise manager (sub-admin)">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('ownerName', 'Full name (as on Aadhaar)')}
          {text('ownerPhone', 'Mobile number (used to sign in)', { inputMode: 'tel', maxLength: 10, placeholder: '10-digit mobile', disabled: editing, hint: editing ? "Can't be changed" : 'An OTP is sent here to sign in' })}
          {text('ownerEmail', 'Email', { type: 'email', inputMode: 'email' })}
          {text('ownerDateOfBirth', 'Date of birth', { type: 'date' })}
          <Field label="Residential address" className="sm:col-span-2">
            <textarea value={v.ownerAddress} onChange={(e) => set('ownerAddress')(e.target.value)} rows={2} className={cx(inputCls, 'h-auto py-2', errors.ownerAddress && 'border-danger')} />
            {errors.ownerAddress && <span className="mt-1 block text-xs text-danger">{errors.ownerAddress}</span>}
          </Field>
          {text('ownerPincode', 'Pincode', { inputMode: 'numeric', maxLength: 6 })}
          {text('emergencyContact', 'Emergency contact (optional)', { inputMode: 'tel', maxLength: 10 })}
        </div>
      </Section>

      <Section title="KYC">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('aadhaarNumber', editing ? `Aadhaar number (saved: ${existing.aadhaarMasked})` : 'Aadhaar number', {
            inputMode: 'numeric',
            maxLength: 14,
            placeholder: editing ? 'Leave blank to keep' : '12 digits',
            hint: 'Stored encrypted; only the last 4 digits are shown.',
          })}
          {text('panNumber', 'PAN (optional)', { maxLength: 10, placeholder: 'ABCDE1234F' })}
          <DocUpload label="Aadhaar photo — front" value={v.aadhaarFrontUrl} onChange={set('aadhaarFrontUrl')} error={errors.aadhaarFrontUrl} required />
          <DocUpload label="Aadhaar photo — back" value={v.aadhaarBackUrl} onChange={set('aadhaarBackUrl')} />
          <DocUpload label="PAN card photo (optional)" value={v.panPhotoUrl} onChange={set('panPhotoUrl')} />
          {text('businessName', 'Business / firm name (optional)')}
          {text('gstin', 'GSTIN (optional)', { maxLength: 15 })}
        </div>
      </Section>

      <Section title="Agreement">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('commissionPercent', 'Franchise share of RapidFix commission (%)', { inputMode: 'decimal', placeholder: 'e.g. 40', hint: 'From the agreement. Paid on completed bookings in its localities.' })}
          {text('depositAmount', 'Security deposit (₹, optional)', { inputMode: 'numeric' })}
          {text('agreementStart', 'Agreement start', { type: 'date' })}
          {text('agreementEnd', 'Agreement end (optional)', { type: 'date' })}
          <DocUpload label="Signed agreement (optional, photo or PDF)" value={v.agreementUrl} onChange={set('agreementUrl')} />
        </div>
      </Section>

      <Section title="Payouts to the franchise">
        <div className="grid gap-4 sm:grid-cols-2">
          {text('bankAccountHolder', 'Account holder name')}
          {text('bankAccountNumber', editing && existing.bankAccountLast4 ? `Account number (saved: XXXX${existing.bankAccountLast4})` : 'Account number', {
            inputMode: 'numeric',
            maxLength: 18,
            placeholder: editing ? 'Leave blank to keep' : '',
          })}
          {text('bankIfsc', 'IFSC', { maxLength: 11 })}
          {text('upiId', 'UPI ID', { placeholder: 'name@okaxis' })}
        </div>
      </Section>

      <Section title="Notes (only head office sees these)">
        <textarea value={v.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} maxLength={2000} className={cx(inputCls, 'h-auto py-2')} />
      </Section>

      {save.error && <Alert className="mt-4">{(save.error as Error).message}</Alert>}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Button fullWidth size="lg" loading={save.isPending} onClick={submit}>
          {editing ? 'Save changes' : 'Create franchise'}
        </Button>
      </div>

      <AddLocalityDialog
        open={addLocality}
        onClose={() => setAddLocality(false)}
        onCreated={(newId) => setV((s) => ({ ...s, localityIds: [...s.localityIds, newId] }))}
      />
    </div>
  );
}

function DocUpload({ label, value, onChange, error, required }: { label: string; value: string; onChange(v: string): void; error?: string; required?: boolean }) {
  const upload = useMutation({
    mutationFn: (f: File) => documentUploadApi.upload(f),
    onSuccess: (r) => onChange(r.path),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  return (
    <div>
      <span className="mb-1 block text-[13px] font-medium text-slate-700">
        {label} {required && <span className="text-danger">*</span>}
      </span>
      <div className={cx('flex items-center gap-3 rounded-xl border border-dashed p-2.5', error ? 'border-danger' : 'border-slate-300')}>
        {value ? <PrivateThumb path={value} /> : <span className="flex size-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><FileUp className="size-5" aria-hidden /></span>}
        <label className="cursor-pointer text-sm font-semibold text-fixora-blue">
          {upload.isPending ? 'Uploading…' : value ? 'Replace' : 'Upload photo / PDF'}
          <input
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) upload.mutate(f);
            }}
          />
        </label>
        {value && !required && (
          <button type="button" onClick={() => onChange('')} className="ml-auto text-xs text-slate-500">
            Remove
          </button>
        )}
      </div>
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Small "your franchise" header for franchise managers (dashboard). */
export function MyFranchiseBanner({ children }: { children?: ReactNode }) {
  const me = useQuery({ queryKey: ['admin', 'franchise', 'me'], queryFn: franchiseApi.mine, staleTime: 60_000 });
  if (!me.data) return null;
  const f = me.data;
  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-500">YOUR FRANCHISE · {f.code}</p>
          <p className="text-xl font-bold text-slate-900">{f.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {f.localities.map((l) => (
              <span key={l.id} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">
                {l.name} · {l.radiusKm} km
              </span>
            ))}
          </div>
        </div>
        <Pill tone="blue">{f.commissionPercent}% of RapidFix commission</Pill>
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="mb-1 text-xs font-medium text-slate-500">This month</p>
        <StatsLine s={f.month} pct={f.commissionPercent} />
      </div>
      {children && <div className="mt-4 border-t border-slate-100 pt-3">{children}</div>}
    </Card>
  );
}

/** Head office: guard for /admin/franchises/* (the API checks too). */
export function RequireFranchiseManage({ children }: { children: ReactNode }) {
  const role = useAuth((s) => s.user?.role);
  if (role && !hasPermission(role, Permission.FRANCHISES_MANAGE)) return <Navigate to="/admin" replace />;
  return children;
}
