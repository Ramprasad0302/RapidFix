import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock3, FileUp, Landmark, ShieldCheck, Star, Trash2, TrendingUp } from 'lucide-react';
import type { TechnicianDetailsDto, TechnicianDocumentDto } from '@fixora/shared-types';
import { Alert, Button, Spinner, TextField, cx } from '@fixora/ui';
import { PageHeader } from '../../../components/PageHeader';
import { CenteredSpinner, EmptyState, ErrorState } from '../../../components/States';
import { documentUploadApi, fetchPrivateFile, technicianApi } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { MobileShell } from '../../customer/CustomerTabsLayout';
import { Stars } from '../../customer/components/BookingExtras';
import { PartnerProfileForm, toPartnerPayload, type PartnerFormValues } from '../../partner/PartnerProfileForm';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <MobileShell>
      <PageHeader title={title} backTo="/technician/profile" />
      <main className="flex flex-col gap-4 px-4 pb-10">{children}</main>
    </MobileShell>
  );
}

// ─── Profile details & service area ──────────────────────────────────────

export function ProfileDetailsPage() {
  const details = useQuery({ queryKey: ['tech', 'details'], queryFn: technicianApi.details });
  return (
    <Shell title="Profile & Service Area">
      {details.isPending && <CenteredSpinner />}
      {details.isError && <ErrorState error={details.error} onRetry={() => void details.refetch()} />}
      {details.data && <ProfileForm d={details.data} />}
    </Shell>
  );
}

function ProfileForm({ d }: { d: TechnicianDetailsDto }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: (v: PartnerFormValues) => {
      const { skills: _skills, ...rest } = toPartnerPayload(v);
      return technicianApi.updateProfile(rest);
    },
    onSuccess: (updated) => {
      qc.setQueryData(['tech', 'details'], updated);
      void qc.invalidateQueries({ queryKey: ['tech', 'profile'] });
      toast('Profile updated');
      navigate('/technician/profile');
    },
  });
  const defaults: PartnerFormValues = {
    name: d.name,
    email: d.email ?? '',
    experienceYears: d.experienceYears,
    bio: d.bio ?? '',
    languages: d.languages,
    serviceRadiusKm: d.serviceRadiusKm,
    addressLine: d.addressLine ?? '',
    villageTown: d.villageTown,
    district: d.district,
    state: d.state,
    pincode: d.pincode,
    baseLatitude: d.baseLatitude,
    baseLongitude: d.baseLongitude,
    skills: d.skills.map((s) => s.id),
  };
  return (
    <>
      {d.verificationStatus !== 'VERIFIED' && (
        <Alert tone="info">
          {d.verificationStatus === 'PENDING'
            ? 'Your account is under verification. Upload your documents so FIXORA can approve you faster.'
            : `Account status: ${d.verificationStatus}.${d.rejectionReason ? ` ${d.rejectionReason}` : ''}`}
        </Alert>
      )}
      <PartnerProfileForm defaults={defaults} submitLabel="Save changes" pending={save.isPending} error={save.error?.message} onSubmit={(v) => save.mutate(v)} />
    </>
  );
}

// ─── Bank / UPI for payouts ──────────────────────────────────────────────

export function PayoutDetailsPage() {
  const qc = useQueryClient();
  const details = useQuery({ queryKey: ['tech', 'payout-details'], queryFn: technicianApi.payoutDetails });
  const [upi, setUpi] = useState<string | null>(null);
  const [holder, setHolder] = useState<string | null>(null);
  const [ifsc, setIfsc] = useState<string | null>(null);
  const [account, setAccount] = useState('');
  const [confirm, setConfirm] = useState('');

  const save = useMutation({
    mutationFn: () =>
      technicianApi.savePayoutDetails({
        payoutUpiId: (upi ?? details.data?.payoutUpiId ?? '').trim(),
        bankAccountHolder: (holder ?? details.data?.bankAccountHolder ?? '').trim(),
        bankIfsc: (ifsc ?? details.data?.bankIfsc ?? '').trim().toUpperCase(),
        ...(account && { bankAccountNumber: account }),
      }),
    onSuccess: (d) => {
      qc.setQueryData(['tech', 'payout-details'], d);
      setAccount('');
      setConfirm('');
      toast('Payout details saved');
    },
  });

  const d = details.data;
  const mismatch = account.length > 0 && confirm.length > 0 && account !== confirm;
  return (
    <Shell title="Bank & UPI Details">
      {details.isPending && <CenteredSpinner />}
      {details.isError && <ErrorState error={details.error} onRetry={() => void details.refetch()} />}
      {d && (
        <>
          <p className="flex items-start gap-2 rounded-xl bg-fixora-blue-soft px-3.5 py-3 text-sm text-slate-700">
            <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-fixora-blue" aria-hidden />
            Payouts are sent here. Your account number is encrypted and only the last 4 digits are ever shown.
          </p>
          <TextField label="UPI ID" placeholder="name@okbank" value={upi ?? d.payoutUpiId ?? ''} onChange={(e) => setUpi(e.target.value)} autoComplete="off" />
          <h3 className="mt-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Landmark className="size-5 text-fixora-blue" aria-hidden /> Bank account
          </h3>
          {d.bankAccountLast4 && (
            <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
              Saved account ending <b>•••• {d.bankAccountLast4}</b>
              {d.bankIfsc && ` · ${d.bankIfsc}`}
            </p>
          )}
          <TextField label="Account holder name" value={holder ?? d.bankAccountHolder ?? ''} onChange={(e) => setHolder(e.target.value)} autoComplete="name" />
          <TextField label="IFSC" value={ifsc ?? d.bankIfsc ?? ''} onChange={(e) => setIfsc(e.target.value.toUpperCase().slice(0, 11))} autoComplete="off" placeholder="SBIN0001234" />
          <TextField
            label={d.bankAccountLast4 ? 'New account number (leave empty to keep)' : 'Account number'}
            inputMode="numeric"
            value={account}
            onChange={(e) => setAccount(e.target.value.replace(/\D/g, '').slice(0, 18))}
            autoComplete="off"
          />
          {account && (
            <TextField
              label="Re-enter account number"
              inputMode="numeric"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 18))}
              error={mismatch ? 'Account numbers do not match' : undefined}
              autoComplete="off"
            />
          )}
          {save.isError && <Alert>{save.error.message}</Alert>}
          <Button size="lg" fullWidth disabled={!!account && account !== confirm} loading={save.isPending} onClick={() => save.mutate()}>
            Save details
          </Button>
        </>
      )}
    </Shell>
  );
}

// ─── KYC documents (private) ─────────────────────────────────────────────

const DOC_TYPES: { value: TechnicianDocumentDto['type']; label: string }[] = [
  { value: 'AADHAAR', label: 'Aadhaar card' },
  { value: 'PAN', label: 'PAN card' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'CERTIFICATE', label: 'Skill certificate' },
  { value: 'PROFILE_PHOTO', label: 'Profile photo' },
  { value: 'OTHER', label: 'Other' },
];
const DOC_STATUS = {
  PENDING: { icon: Clock3, label: 'Under review', cls: 'bg-warning-soft text-warning' },
  APPROVED: { icon: CircleCheck, label: 'Approved', cls: 'bg-success-soft text-success' },
  REJECTED: { icon: CircleX, label: 'Rejected', cls: 'bg-danger-soft text-danger' },
} as const;

export function DocumentsPage() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ['tech', 'documents'], queryFn: technicianApi.documents });
  const [type, setType] = useState<TechnicianDocumentDto['type']>('AADHAAR');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (f: File) => technicianApi.addDocument(type, (await documentUploadApi.upload(f)).path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tech', 'documents'] });
      toast('Document uploaded for review');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: technicianApi.deleteDocument,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tech', 'documents'] }),
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <Shell title="My Documents">
      <p className="text-sm text-slate-600">Upload clear photos or PDFs. Documents are private — only you and the FIXORA verification team can see them.</p>
      <div className="flex gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TechnicianDocumentDto['type'])}
          aria-label="Document type"
          className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[15px] outline-none focus:border-fixora-blue"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) upload.mutate(f);
          }}
        />
        <Button size="lg" loading={upload.isPending} onClick={() => fileRef.current?.click()} leftIcon={<FileUp className="size-5" />}>
          Upload
        </Button>
      </div>
      {docs.isPending && <CenteredSpinner />}
      {docs.isError && <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />}
      {docs.data?.length === 0 && <EmptyState title="No documents yet" body="Start with your Aadhaar card and a skill certificate." />}
      <ul className="flex flex-col gap-2.5">
        {docs.data?.map((d) => {
          const st = DOC_STATUS[d.status];
          return (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 shadow-card">
              <PrivateThumb path={d.fileUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{DOC_TYPES.find((t) => t.value === d.type)?.label}</p>
                <span className={cx('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', st.cls)}>
                  <st.icon className="size-3" /> {st.label}
                </span>
                {d.remarks && <p className="mt-0.5 text-xs text-slate-500">{d.remarks}</p>}
                <p className="text-xs text-slate-400">{formatDate(d.createdAt)}</p>
              </div>
              {d.status !== 'APPROVED' && (
                <button onClick={() => remove.mutate(d.id)} aria-label="Delete document" className="flex size-10 items-center justify-center rounded-full text-slate-400 hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="size-4.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}

/** Private files need the access token, so they're fetched as blobs, never linked directly. */
export function PrivateThumb({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const pdf = path.toLowerCase().endsWith('.pdf');
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    fetchPrivateFile(path)
      .then((u) => {
        objectUrl = u;
        if (revoked) URL.revokeObjectURL(u);
        else setUrl(u);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  const box = cx('flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-semibold text-slate-500', className);
  if (failed) return <span className={box}>—</span>;
  if (!url) return <span className={box}><Spinner className="size-4" /></span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={box} aria-label="Open document">
      {pdf ? 'PDF' : <img src={url} alt="" className="size-full object-cover" />}
    </a>
  );
}

// ─── Reviews & performance ───────────────────────────────────────────────

export function ReviewsPage() {
  const reviews = useQuery({ queryKey: ['tech', 'reviews'], queryFn: technicianApi.reviews });
  return (
    <Shell title="My Reviews">
      {reviews.isPending && <CenteredSpinner />}
      {reviews.isError && <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />}
      {reviews.data?.length === 0 && <EmptyState art={<Star className="size-10 text-slate-300" />} title="No reviews yet" body="Customers can rate you after each paid job." />}
      <ul className="flex flex-col gap-3">
        {reviews.data?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-slate-100 p-3.5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <Stars value={r.rating} />
              <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
            </div>
            {r.comment && <p className="mt-2 text-[15px] text-slate-800">“{r.comment}”</p>}
            <p className="mt-1.5 text-xs text-slate-500">
              {r.customerName} · {r.service}
              {r.bookingCode && ` · ${r.bookingCode}`}
            </p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

export function PerformancePage() {
  const perf = useQuery({ queryKey: ['tech', 'performance'], queryFn: technicianApi.performance });
  const p = perf.data;
  const maxCount = Math.max(1, ...(p?.ratingBreakdown.map((b) => b.count) ?? [1]));
  return (
    <Shell title="Performance">
      {perf.isPending && <CenteredSpinner />}
      {perf.isError && <ErrorState error={perf.error} onRetry={() => void perf.refetch()} />}
      {p && (
        <>
          <section className="grid grid-cols-2 gap-2.5">
            <Tile label="Acceptance rate" value={p.acceptanceRate == null ? '—' : `${p.acceptanceRate}%`} hint={`${p.offersAccepted} of ${p.offersReceived} requests`} />
            <Tile label="Rating" value={p.ratingCount ? p.ratingAvg.toFixed(1) : '—'} hint={`${p.ratingCount} reviews`} />
            <Tile label="Jobs completed" value={String(p.jobsCompleted)} />
            <Tile label="Jobs you cancelled" value={String(p.jobsCancelled)} tone={p.jobsCancelled > 0 ? 'warn' : undefined} />
          </section>
          <section className="rounded-2xl border border-slate-100 p-4 shadow-card">
            <h3 className="font-semibold text-slate-900">Rating breakdown</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = p.ratingBreakdown.find((b) => b.stars === stars)?.count ?? 0;
                return (
                  <li key={stars} className="flex items-center gap-2.5 text-sm">
                    <span className="flex w-8 items-center gap-0.5 text-slate-700">
                      {stars} <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right text-slate-500">{count}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="flex items-start gap-2 rounded-xl bg-fixora-blue-soft px-3.5 py-3 text-sm text-slate-700">
            <TrendingUp className="mt-0.5 size-4.5 shrink-0 text-fixora-blue" aria-hidden />
            Accepting requests quickly and keeping a high rating puts you first in line for new jobs nearby.
          </p>
        </>
      )}
    </Shell>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold', tone === 'warn' ? 'text-warning' : 'text-slate-900')}>{value}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
