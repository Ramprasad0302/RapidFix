import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, List, Map as MapIcon, Star, UsersRound } from 'lucide-react';
import { SocketEvent, type AdminTechnicianDetailDto, type AdminTechnicianRowDto, type TechnicianVerificationStatus, type UserStatus } from '@fixora/shared-types';
import { formatINR, formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { FixoraMap, type MapMarker } from '../../../components/map/FixoraMap';
import { ErrorState, Skeleton } from '../../../components/States';
import { Pill, StatusBadge } from '../../../components/StatusBadge';
import { adminModulesApi } from '../../../lib/endpoints';
import { formatDate, timeAgo } from '../../../lib/format';
import { useSocketEvent } from '../../../lib/socket';
import { toast } from '../../../store/toast';
import { useCategories } from '../../customer/queries';
import { PrivateThumb } from '../../technician/pages/AccountPages';
import { Card } from '../components/Card';
import { DataTable, Facts, FilterSelect, humanize, PageTitle, Pager, ReasonDialog, SearchBox, Section, useUrlParams, type Column } from '../components/kit';
import { userStatusPill } from './CustomersPage';

const PAGE_SIZE = 20;
const VERIFICATION: { value: TechnicianVerificationStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending verification' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BLOCKED', label: 'Blocked' },
];
const VERIFY_TONE = { PENDING: 'amber', VERIFIED: 'green', REJECTED: 'red', SUSPENDED: 'amber', BLOCKED: 'red' } as const;
const DOC_LABEL: Record<string, string> = { AADHAAR: 'Aadhaar', PAN: 'PAN', DRIVING_LICENSE: 'Driving licence', CERTIFICATE: 'Certificate', PROFILE_PHOTO: 'Photo', OTHER: 'Other' };

const COLUMNS: Column<AdminTechnicianRowDto>[] = [
  {
    header: 'Technician',
    cell: (t) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={t.name ?? t.phone} size={34} online={t.isOnline} />
        <span>
          <span className="block font-medium text-slate-900">{t.name ?? '—'}</span>
          <span className="text-xs text-slate-500">{t.title}</span>
        </span>
      </span>
    ),
  },
  { header: 'Phone', className: 'whitespace-nowrap', cell: (t) => (t.phone ? formatIndianPhone(t.phone) : '—') },
  { header: 'Area', cell: (t) => `${t.villageTown}, ${t.district}` },
  { header: 'Skills', className: 'max-w-[220px]', cell: (t) => <span className="line-clamp-2 text-xs">{t.skills.join(', ') || '—'}</span> },
  {
    header: 'Rating',
    className: 'whitespace-nowrap',
    cell: (t) => (
      <span className="flex items-center gap-1">
        <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden /> {t.ratingAvg.toFixed(1)} <span className="text-xs text-slate-400">({t.ratingCount})</span>
      </span>
    ),
  },
  { header: 'Jobs', className: 'text-right whitespace-nowrap', cell: (t) => `${t.completedJobs} done · ${t.activeJobs} active` },
  { header: 'Wallet', className: 'text-right whitespace-nowrap', cell: (t) => <span className={t.walletBalance < 0 ? 'text-danger' : ''}>{formatINR(t.walletBalance)}</span> },
  {
    header: 'Status',
    cell: (t) => (
      <span className="flex flex-col items-start gap-1">
        <Pill tone={VERIFY_TONE[t.verificationStatus]}>{humanize(t.verificationStatus)}</Pill>
        {t.userStatus !== 'ACTIVE' && userStatusPill(t.userStatus)}
      </span>
    ),
  },
];

export function TechniciansPage() {
  const { get, set, page } = useUrlParams();
  const q = get('q');
  const verification = get('verification') as TechnicianVerificationStatus | undefined;
  const online = get('online');
  const view = get('view') === 'map' ? 'map' : 'list';
  const openId = get('id');

  const list = useQuery({
    queryKey: ['admin', 'technicians', { q, verification, online, page }],
    queryFn: () => adminModulesApi.technicians({ q, verification, online: online ? online === 'true' : undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: view === 'list',
  });

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle
        icon={UsersRound}
        title="Technicians"
        subtitle="Approve documents, verify, suspend or block partners. See who's online right now."
        actions={
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="View">
            {(
              [
                ['list', 'List', List],
                ['map', 'Live map', MapIcon],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => set({ view: v === 'list' ? undefined : v })}
                className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600')}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        }
      />
      {view === 'map' ? (
        <LiveMap onOpen={(id) => set({ id, view: 'map' })} />
      ) : (
        <Card className="mt-6">
          <div className="flex flex-wrap gap-3">
            <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Search by name or phone" />
            <FilterSelect label="All verification states" value={verification} options={VERIFICATION} onChange={(v) => set({ verification: v })} />
            <FilterSelect
              label="Online & offline"
              value={online as 'true' | 'false' | undefined}
              options={[
                { value: 'true', label: 'Online now' },
                { value: 'false', label: 'Offline' },
              ]}
              onChange={(v) => set({ online: v })}
            />
          </div>
          <DataTable
            columns={COLUMNS}
            rows={list.data?.items}
            rowKey={(t) => t.id}
            onRowClick={(t) => set({ id: t.id, page: String(page) })}
            loading={list.isPending}
            fetching={list.isFetching}
            error={list.error}
            onRetry={() => void list.refetch()}
            empty="No technicians found"
            minWidth={1080}
          />
          {list.data && <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} noun="technicians" />}
        </Card>
      )}
      <Dialog variant="drawer" open={!!openId} onClose={() => set({ id: undefined, ...(view === 'map' ? { view: 'map' } : { page: String(page) }) })} title="Technician">
        {openId && <TechnicianDrawer id={openId} />}
      </Dialog>
    </div>
  );
}

/** Online technicians, moved live by location pings over Socket.IO. */
function LiveMap({ onOpen }: { onOpen(id: string): void }) {
  const live = useQuery({ queryKey: ['admin', 'technicians', 'live'], queryFn: adminModulesApi.liveTechnicians, refetchInterval: 60_000 });
  const [moves, setMoves] = useState<Record<string, { lat: number; lng: number }>>({});
  useSocketEvent(SocketEvent.TECHNICIAN_LOCATION_UPDATED, (p) => {
    if (typeof p.technicianId === 'string' && typeof p.lat === 'number' && typeof p.lng === 'number') {
      setMoves((m) => ({ ...m, [p.technicianId as string]: { lat: p.lat as number, lng: p.lng as number } }));
    }
  });

  const techs = useMemo(
    () =>
      (live.data ?? [])
        .filter((t) => t.lastLatitude != null && t.lastLongitude != null)
        .map((t) => ({ ...t, lat: moves[t.id]?.lat ?? t.lastLatitude!, lng: moves[t.id]?.lng ?? t.lastLongitude! })),
    [live.data, moves],
  );
  const markers: MapMarker[] = useMemo(() => techs.map((t) => ({ lat: t.lat, lng: t.lng, kind: 'tech', title: `${t.name ?? 'Technician'} · ${t.title}` })), [techs]);
  const center = useMemo(
    () => (techs.length ? { lat: techs.reduce((s, t) => s + t.lat, 0) / techs.length, lng: techs.reduce((s, t) => s + t.lng, 0) / techs.length } : { lat: 16.5, lng: 81.5 }),
    [techs],
  );

  if (live.isError) return <ErrorState error={live.error} onRetry={() => void live.refetch()} />;
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden p-0">
        {live.isPending ? <Skeleton className="h-[560px]" /> : <FixoraMap center={center} zoom={10} markers={markers} fit label="Live technician map" className="h-[560px] w-full" />}
      </Card>
      <Card title={`Online now (${techs.length})`} className="max-h-[560px] overflow-y-auto">
        {techs.length === 0 && !live.isPending && <p className="text-sm text-slate-500">No technician is sharing their location right now.</p>}
        <ul className="flex flex-col gap-1">
          {techs.map((t) => (
            <li key={t.id}>
              <button onClick={() => onOpen(t.id)} className="flex w-full items-center gap-2.5 rounded-xl p-2 text-left hover:bg-slate-50">
                <Avatar name={t.name} size={34} online />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{t.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {t.activeJobs} active · {t.lastLocationAt ? timeAgo(t.lastLocationAt) : 'no ping yet'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function TechnicianDrawer({ id }: { id: string }) {
  const qc = useQueryClient();
  const detail = useQuery({ queryKey: ['admin', 'technician', id], queryFn: () => adminModulesApi.technician(id) });
  const [verifyTo, setVerifyTo] = useState<TechnicianVerificationStatus | null>(null);
  const [statusTo, setStatusTo] = useState<UserStatus | null>(null);
  const [editSkills, setEditSkills] = useState(false);

  const refresh = (d?: AdminTechnicianDetailDto) => {
    if (d) qc.setQueryData(['admin', 'technician', id], d);
    void qc.invalidateQueries({ queryKey: ['admin', 'technicians'] });
  };
  const verify = useMutation({
    mutationFn: (reason: string) => adminModulesApi.setVerification(id, verifyTo!, reason),
    onSuccess: (d) => {
      refresh(d);
      toast(`Marked ${humanize(verifyTo!).toLowerCase()}`);
      setVerifyTo(null);
    },
  });
  const status = useMutation({
    mutationFn: (reason: string) => adminModulesApi.setUserStatus(detail.data!.userId, statusTo!, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`Account ${humanize(statusTo!).toLowerCase()}`);
      setStatusTo(null);
    },
  });
  const reviewDoc = useMutation({
    mutationFn: ({ docId, ok }: { docId: string; ok: boolean }) => adminModulesApi.reviewDocument(docId, ok ? 'APPROVED' : 'REJECTED', ok ? undefined : 'Please upload a clearer copy'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'technician', id] });
      toast('Document reviewed');
    },
    onError: (e) => toast(e.message, 'error'),
  });

  if (detail.isPending) return <Skeleton className="h-96" />;
  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const t = detail.data;
  const pendingDocs = t.documents.filter((d) => d.status === 'PENDING').length;

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={t.name ?? t.phone} size={56} online={t.isOnline} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold text-slate-900">{t.name}</p>
          <p className="text-sm text-slate-500">
            {t.title} · {t.phone ? formatIndianPhone(t.phone) : ''}
          </p>
        </div>
        <span className="flex flex-col items-end gap-1">
          <Pill tone={VERIFY_TONE[t.verificationStatus]}>{humanize(t.verificationStatus)}</Pill>
          {userStatusPill(t.userStatus)}
        </span>
      </div>
      {t.rejectionReason && t.verificationStatus !== 'VERIFIED' && <Alert tone="info" className="mt-3">{t.rejectionReason}</Alert>}

      <div className="mt-4 flex flex-wrap gap-2">
        {t.verificationStatus !== 'VERIFIED' && (
          <Button size="sm" leftIcon={<CircleCheck className="size-4" />} onClick={() => setVerifyTo('VERIFIED')}>
            Verify
          </Button>
        )}
        {t.verificationStatus === 'PENDING' && (
          <Button size="sm" variant="outline" onClick={() => setVerifyTo('REJECTED')}>
            Reject
          </Button>
        )}
        {t.userStatus === 'ACTIVE' ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setStatusTo('SUSPENDED')}>
              Suspend
            </Button>
            <Button size="sm" variant="outline" className="border-danger text-danger hover:bg-danger-soft" onClick={() => setStatusTo('BLOCKED')}>
              Block
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setStatusTo('ACTIVE')}>
            Reactivate account
          </Button>
        )}
      </div>

      <Section title="Profile & service area">
        <Facts
          items={[
            ['Email', t.email ?? '—'],
            ['Date of birth', t.dateOfBirth ? formatDate(t.dateOfBirth) : '—'],
            ['Alternate contact', t.alternatePhone ?? '—'],
            ['Experience', `${t.experienceYears} years`],
            ['Own tools', t.hasOwnTools ? 'Yes' : 'No'],
            ['Own vehicle', t.hasVehicle ? 'Yes' : 'No'],
            ['About', t.bio || '—'],
            ['Languages', t.languages.join(', ') || '—'],
            ['Radius', `${t.serviceRadiusKm} km`],
            ['Base', [t.addressLine, t.villageTown, t.district, t.state, t.pincode].filter(Boolean).join(', ')],
            ['Online', t.isOnline ? `Yes · ${t.lastLocationAt ? timeAgo(t.lastLocationAt) : ''}` : 'No'],
            ['Rating', `${t.ratingAvg.toFixed(1)} (${t.ratingCount})`],
            ['Joined', formatDate(t.createdAt)],
          ]}
        />
      </Section>

      <Section
        title="Skills"
        action={
          <button onClick={() => setEditSkills(true)} className="text-sm font-medium text-fixora-blue">
            Edit
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {t.skills.map((s) => (
            <span key={s} className="rounded-lg bg-fixora-blue-soft px-2.5 py-1 text-sm font-medium text-fixora-blue">
              {s}
            </span>
          ))}
        </div>
      </Section>

      <Section title={`Documents${pendingDocs ? ` · ${pendingDocs} to review` : ''}`}>
        {t.documents.length === 0 && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
        <ul className="flex flex-col gap-2">
          {t.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
              <PrivateThumb path={d.fileUrl} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">{DOC_LABEL[d.type] ?? d.type}</p>
                <Pill tone={d.status === 'APPROVED' ? 'green' : d.status === 'PENDING' ? 'amber' : 'red'}>{humanize(d.status)}</Pill>
                {d.remarks && <p className="text-xs text-slate-500">{d.remarks}</p>}
              </div>
              {d.status === 'PENDING' && (
                <span className="flex gap-1">
                  <button aria-label="Approve document" onClick={() => reviewDoc.mutate({ docId: d.id, ok: true })} className="flex size-9 items-center justify-center rounded-full text-success hover:bg-success-soft">
                    <CircleCheck className="size-5" />
                  </button>
                  <button aria-label="Reject document" onClick={() => reviewDoc.mutate({ docId: d.id, ok: false })} className="flex size-9 items-center justify-center rounded-full text-danger hover:bg-danger-soft">
                    <CircleX className="size-5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Earnings & payout">
        <Facts
          items={[
            ['This month', formatINR(t.earnings.month)],
            ['All time', formatINR(t.earnings.total)],
            ['Paid out', formatINR(t.earnings.totalPaidOut)],
            ['Wallet balance', <span key="b" className={t.earnings.balance < 0 ? 'text-danger' : ''}>{formatINR(t.earnings.balance)}</span>],
            ['UPI', t.payout.upiId ?? '—'],
            ['Bank', t.payout.bankAccountLast4 ? `•••• ${t.payout.bankAccountLast4} · ${t.payout.bankIfsc ?? ''}` : '—'],
          ]}
        />
      </Section>

      <Section title={`Recent bookings (${t.bookings.length})`}>
        <ul className="divide-y divide-slate-100 text-sm">
          {t.bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <Link to={`/admin/bookings?id=${b.id}`} className="min-w-0">
                <span className="block font-medium text-fixora-blue">{b.code}</span>
                <span className="text-xs text-slate-500">
                  {b.service} · {formatDate(b.scheduledFor)}
                </span>
              </Link>
              <StatusBadge status={b.status} audience="staff" />
            </li>
          ))}
        </ul>
      </Section>

      {t.reviews.length > 0 && (
        <Section title="Reviews">
          <ul className="flex flex-col gap-2 text-sm">
            {t.reviews.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                <b>{r.rating}★</b> {r.customer} · {formatDate(r.createdAt)}
                {r.comment && <p className="text-slate-600">“{r.comment}”</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ReasonDialog
        open={!!verifyTo}
        title={verifyTo === 'VERIFIED' ? `Verify ${t.name}?` : `Reject ${t.name}?`}
        body={verifyTo === 'VERIFIED' ? 'They can go online and receive job requests straight away.' : 'They will see this reason in the partner app.'}
        label={verifyTo === 'VERIFIED' ? 'Note (e.g. documents checked)' : 'Reason'}
        confirmLabel={verifyTo === 'VERIFIED' ? 'Verify' : 'Reject'}
        danger={verifyTo !== 'VERIFIED'}
        pending={verify.isPending}
        error={verify.error?.message}
        onConfirm={(r) => verify.mutate(r)}
        onClose={() => setVerifyTo(null)}
      />
      <ReasonDialog
        open={!!statusTo}
        title={statusTo === 'ACTIVE' ? 'Reactivate account?' : `${humanize(statusTo ?? 'SUSPENDED')} this technician?`}
        body={statusTo === 'ACTIVE' ? 'They can sign in again.' : 'They are taken offline and signed out everywhere.'}
        confirmLabel={statusTo === 'ACTIVE' ? 'Reactivate' : humanize(statusTo ?? '')}
        danger={statusTo !== 'ACTIVE'}
        pending={status.isPending}
        error={status.error?.message}
        onConfirm={(r) => status.mutate(r)}
        onClose={() => setStatusTo(null)}
      />
      <SkillsDialog t={t} open={editSkills} onClose={() => setEditSkills(false)} onSaved={(d) => refresh(d)} />
    </div>
  );
}

function SkillsDialog({ t, open, onClose, onSaved }: { t: AdminTechnicianDetailDto; open: boolean; onClose(): void; onSaved(d: AdminTechnicianDetailDto): void }) {
  const categories = useCategories();
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? t.skillIds;
  const save = useMutation({
    mutationFn: () => adminModulesApi.setSkills(t.id, selected),
    onSuccess: (d) => {
      onSaved(d);
      toast('Skills updated');
      setPicked(null);
      onClose();
    },
  });
  return (
    <Dialog
      variant="center"
      open={open}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      title="Skills"
      footer={
        <div className="flex justify-end">
          <Button disabled={!selected.length} loading={save.isPending} onClick={() => save.mutate()}>
            Save skills
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {categories.data?.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              aria-pressed={on}
              onClick={() => setPicked(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])}
              className={cx('rounded-lg border px-3 py-2 text-sm font-medium', on ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700')}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      {save.isError && <Alert className="mt-3">{save.error.message}</Alert>}
    </Dialog>
  );
}
