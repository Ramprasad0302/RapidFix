import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import type { AdminCustomerRowDto, UserStatus } from '@fixora/shared-types';
import { formatINR, formatIndianPhone } from '@fixora/shared-utils';
import { Button } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { ErrorState, Skeleton } from '../../../components/States';
import { Pill, StatusBadge } from '../../../components/StatusBadge';
import { adminModulesApi } from '../../../lib/endpoints';
import { formatDate, timeAgo } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { Card } from '../components/Card';
import { BookingDrawer } from './BookingsPage';
import { DataTable, Facts, FilterSelect, humanize, PageTitle, Pager, ReasonDialog, SearchBox, Section, useUrlParams, type Column, useFranchiseColumn } from '../components/kit';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BLOCKED', label: 'Blocked' },
];

export const userStatusPill = (s: UserStatus) => <Pill tone={s === 'ACTIVE' ? 'green' : s === 'SUSPENDED' ? 'amber' : 'red'}>{humanize(s)}</Pill>;

const COLUMNS: Column<AdminCustomerRowDto>[] = [
  {
    header: 'Customer',
    cell: (c) => (
      <span className="flex items-center gap-2.5">
        <Avatar name={c.name ?? c.phone} size={32} />
        <span>
          <span className="block font-medium text-slate-900">{c.name ?? '—'}</span>
          <span className="text-xs text-slate-500">{c.city ?? ''}</span>
        </span>
      </span>
    ),
  },
  { header: 'Phone', className: 'whitespace-nowrap', cell: (c) => (c.phone ? formatIndianPhone(c.phone) : '—') },
  { header: 'Email', className: 'max-w-[200px] truncate', cell: (c) => c.email ?? '—' },
  { header: 'Bookings', className: 'text-right', cell: (c) => c.bookings },
  { header: 'Spent', className: 'text-right whitespace-nowrap', cell: (c) => formatINR(c.spent) },
  { header: 'Status', cell: (c) => userStatusPill(c.status) },
  { header: 'Joined', className: 'whitespace-nowrap', cell: (c) => formatDate(c.createdAt) },
  { header: 'Last login', className: 'whitespace-nowrap text-slate-500', cell: (c) => (c.lastLoginAt ? timeAgo(c.lastLoginAt) : 'Never') },
];

export function CustomersPage() {
  const columns = useFranchiseColumn(COLUMNS, 'Email');
  const { get, set, page } = useUrlParams();
  const q = get('q');
  const status = get('status') as UserStatus | undefined;
  const openId = get('id');
  const list = useQuery({
    queryKey: ['admin', 'customers', { q, status, page }],
    queryFn: () => adminModulesApi.customers({ q, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={UserRound} title="Customers" subtitle="Profiles, bookings, payments and complaints. Suspend or block abusive accounts." />
      <Card className="mt-6">
        <div className="flex flex-wrap gap-3">
          <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Search by name, phone or email" />
          <FilterSelect label="All statuses" value={status} options={STATUS_OPTIONS} onChange={(v) => set({ status: v })} />
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(c) => c.id}
          onRowClick={(c) => set({ id: c.id, page: String(page) })}
          loading={list.isPending}
          fetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty="No customers found"
        />
        {list.data && <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} noun="customers" />}
      </Card>
      <Dialog variant="drawer" open={!!openId} onClose={() => set({ id: undefined, page: String(page) })} title="Customer">
        {openId && <CustomerDrawer id={openId} />}
      </Dialog>
    </div>
  );
}

function CustomerDrawer({ id }: { id: string }) {
  const qc = useQueryClient();
  const [bookingId, setBookingId] = useState<string | null>(null);
  const detail = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => adminModulesApi.customer(id) });
  const [target, setTarget] = useState<UserStatus | null>(null);
  const change = useMutation({
    mutationFn: (reason: string) => adminModulesApi.setUserStatus(detail.data!.userId, target!, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`Account ${humanize(target!).toLowerCase()}`);
      setTarget(null);
    },
  });

  if (detail.isPending) return <Skeleton className="h-96" />;
  if (detail.isError && !detail.data) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const c = detail.data;
  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar name={c.name ?? c.phone} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold text-slate-900">{c.name ?? 'Unnamed customer'}</p>
          <p className="text-sm text-slate-500">{c.phone ? formatIndianPhone(c.phone) : ''}</p>
        </div>
        {userStatusPill(c.status)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {c.status !== 'ACTIVE' && (
          <Button size="sm" onClick={() => setTarget('ACTIVE')}>
            Reactivate
          </Button>
        )}
        {c.status === 'ACTIVE' && (
          <Button size="sm" variant="outline" onClick={() => setTarget('SUSPENDED')}>
            Suspend
          </Button>
        )}
        {c.status !== 'BLOCKED' && (
          <Button size="sm" variant="outline" className="border-danger text-danger hover:bg-danger-soft" onClick={() => setTarget('BLOCKED')}>
            Block
          </Button>
        )}
      </div>

      <Section title="Profile">
        <Facts
          items={[
            ['Email', c.email ?? '—'],
            ['City', c.city ?? '—'],
            ['Referral code', c.referralCode],
            ['Saved addresses', c.addresses],
            ['Bookings', c.bookings],
            ['Total spent', formatINR(c.spent)],
            ['Joined', formatDate(c.createdAt)],
            ['Last login', c.lastLoginAt ? timeAgo(c.lastLoginAt) : 'Never'],
          ]}
        />
      </Section>

      <Section title={`Bookings (${c.bookingsList.length})`}>
        <ul className="divide-y divide-slate-100 text-sm">
          {c.bookingsList.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <button onClick={() => setBookingId(b.id)} className="min-w-0 text-left">
                <span className="block font-medium text-fixora-blue">{b.code}</span>
                <span className="text-xs text-slate-500">
                  {b.service} · {formatDate(b.scheduledFor)}
                </span>
              </button>
              <span className="flex items-center gap-2">
                <StatusBadge status={b.status} audience="staff" />
                <span className="font-semibold">{formatINR(b.totalAmount)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {c.payments.length > 0 && (
        <Section title="Payments">
          <ul className="divide-y divide-slate-100 text-sm">
            {c.payments.map((p, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  {p.bookingCode} · {p.method} · {humanize(p.status)}
                </span>
                <span className="font-semibold">{formatINR(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.reviews.length > 0 && (
        <Section title="Reviews given">
          <ul className="flex flex-col gap-2 text-sm">
            {c.reviews.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                <b>{r.rating}★</b> {r.service} · {r.technician}
                {r.comment && <p className="text-slate-600">“{r.comment}”</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.complaints.length > 0 && (
        <Section title="Complaints">
          <ul className="flex flex-col gap-2 text-sm">
            {c.complaints.map((x) => (
              <li key={x.id} className="rounded-xl bg-slate-50 p-3">
                <p className="font-medium">
                  {x.subject} <Pill tone={x.status === 'RESOLVED' || x.status === 'CLOSED' ? 'green' : 'amber'}>{humanize(x.status)}</Pill>
                </p>
                <p className="text-slate-600">{x.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Dialog variant="drawer" open={!!bookingId} onClose={() => setBookingId(null)} title="Booking details">
        {bookingId && <BookingDrawer id={bookingId} />}
      </Dialog>
      <ReasonDialog
        open={!!target}
        title={target === 'ACTIVE' ? 'Reactivate account?' : `${humanize(target ?? 'SUSPENDED')} this customer?`}
        body={target === 'ACTIVE' ? 'They can sign in and book again.' : 'They are signed out everywhere and cannot sign in until reactivated.'}
        confirmLabel={target === 'ACTIVE' ? 'Reactivate' : humanize(target ?? '')}
        danger={target !== 'ACTIVE'}
        pending={change.isPending}
        error={change.error?.message}
        onConfirm={(r) => change.mutate(r)}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}
