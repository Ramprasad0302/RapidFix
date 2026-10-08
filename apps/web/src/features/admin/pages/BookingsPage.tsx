import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Gavel, MessageSquareText, RotateCcw, UserPlus, XCircle } from 'lucide-react';
import { BookingStatus, canTransition, hasPermission, Permission, type AdminBookingDetailDto, type AdminBookingRowDto } from '@fixora/shared-types';
import { formatINR, formatIndianPhone, rupeesToPaise } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { PinMap } from '../../../components/PinMap';
import { Dialog } from '../../../components/Dialog';
import { ErrorState, Skeleton } from '../../../components/States';
import { Pill, StatusBadge } from '../../../components/StatusBadge';
import { mediaUrl } from '../../../lib/api';
import { adminModulesApi, bookingApi, type BookingGroup } from '../../../lib/endpoints';
import { addressLines, formatDate, formatSchedule, formatTime } from '../../../lib/format';
import { useBookingRoom } from '../../../lib/socket';
import { useAuth } from '../../../store/auth';
import { toast } from '../../../store/toast';
import { AssignDialog } from '../components/AssignDialog';
import { Card } from '../components/Card';
import { DataTable, Facts, Field, humanize, inputCls, PageTitle, Pager, ReasonDialog, SearchBox, Section, useUrlParams, type Column, useFranchiseColumn } from '../components/kit';

/** Same statuses the server issues an invoice for. */
const INVOICE_READY: string[] = [BookingStatus.SERVICE_COMPLETED, BookingStatus.PAYMENT_PENDING, BookingStatus.PAYMENT_COMPLETED, BookingStatus.REFUNDED, BookingStatus.DISPUTED];

const GROUPS: { value: BookingGroup; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'searching', label: 'Unassigned' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'inProgress', label: 'In progress' },
  { value: 'awaitingPayment', label: 'Awaiting payment' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'disputed', label: 'Disputed' },
];
const PAGE_SIZE = 20;

const COLUMNS: Column<AdminBookingRowDto>[] = [
  { header: 'Booking', cell: (b) => <span className="font-semibold whitespace-nowrap text-slate-900">{b.code}</span> },
  {
    header: 'Service',
    cell: (b) => (
      <span>
        <span className="block font-medium text-slate-900">{b.service}</span>
        <span className="text-xs text-slate-500">{b.category}</span>
      </span>
    ),
  },
  {
    header: 'Customer',
    cell: (b) => (
      <span className="whitespace-nowrap">
        <span className="block">{b.customerName}</span>
        <span className="text-xs text-slate-500">{b.locality}</span>
      </span>
    ),
  },
  { header: 'Technician', cell: (b) => b.technicianName ?? <span className="text-slate-400">Unassigned</span> },
  { header: 'Schedule', className: 'whitespace-nowrap', cell: (b) => formatSchedule(b.scheduledFor, b.timeSlot, b.scheduleType) },
  { header: 'Status', cell: (b) => <StatusBadge status={b.status} audience="staff" /> },
  {
    header: 'Amount',
    className: 'text-right',
    cell: (b) => (
      <span className="whitespace-nowrap">
        <span className="block font-semibold text-slate-900">{formatINR(b.totalAmount)}</span>
        <span className="text-xs text-slate-500">
          {b.paymentMethod} · {humanize(b.paymentStatus)}
        </span>
      </span>
    ),
  },
];

export function BookingsPage() {
  const columns = useFranchiseColumn(COLUMNS, 'Technician');
  const { get, set, page } = useUrlParams();
  const group = (get('group') as BookingGroup | undefined) ?? 'all';
  const q = get('q');
  const from = get('from');
  const to = get('to');
  const openId = get('id');

  const list = useQuery({
    queryKey: ['admin', 'bookings', { group, q, from, to, page }],
    queryFn: () => adminModulesApi.bookings({ group, q, from, to: to ? `${to}T23:59:59+05:30` : undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={CalendarCheck2} title="Bookings" subtitle="Search, assign or reassign technicians, cancel and resolve disputes." />
      <Card className="mt-6">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Booking status">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              role="tab"
              aria-selected={group === g.value}
              onClick={() => set({ group: g.value === 'all' ? undefined : g.value })}
              className={cx(
                'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                group === g.value ? 'bg-fixora-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Booking code, customer name or phone" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            From <input type="date" value={from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            To <input type="date" value={to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.items}
          rowKey={(b) => b.id}
          onRowClick={(b) => set({ id: b.id, page: String(page) })}
          loading={list.isPending}
          fetching={list.isFetching}
          error={list.error}
          onRetry={() => void list.refetch()}
          empty="No bookings match these filters"
        />
        {list.data && <Pager page={page} total={list.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p), id: undefined })} noun="bookings" />}
      </Card>
      <Dialog variant="drawer" open={!!openId} onClose={() => set({ id: undefined, page: String(page) })} title="Booking details">
        {openId && <BookingDrawer id={openId} />}
      </Dialog>
    </div>
  );
}

export function BookingDrawer({ id }: { id: string }) {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  useBookingRoom(id);
  const detail = useQuery({ queryKey: ['admin', 'booking', id], queryFn: () => adminModulesApi.booking(id) });
  const [dialog, setDialog] = useState<'assign' | 'cancel' | 'dispute' | 'resolve' | 'refund' | null>(null);

  const done = (d: AdminBookingDetailDto | unknown, message: string) => {
    if (d && typeof d === 'object' && 'code' in d) qc.setQueryData(['admin', 'booking', id], d);
    void qc.invalidateQueries({ queryKey: ['admin'] });
    setDialog(null);
    toast(message);
  };
  const cancel = useMutation({ mutationFn: (reason: string) => adminModulesApi.cancelBooking(id, reason), onSuccess: (d) => done(d, 'Booking cancelled') });
  const dispute = useMutation({ mutationFn: (note: string) => adminModulesApi.openDispute(id, note), onSuccess: (d) => done(d, 'Marked as disputed') });

  if (detail.isPending) return <Skeleton className="h-96" />;
  if (detail.isError && !detail.data) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  const b = detail.data;
  const canRefund = b.canRefund && !!role && hasPermission(role, Permission.PAYMENTS_MANAGE);
  // Finance / support open this drawer read-only; booking actions belong to operations.
  const canManage = !!role && hasPermission(role, Permission.BOOKINGS_MANAGE);
  const canDispute = canTransition(b.status, BookingStatus.DISPUTED);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xl font-bold text-slate-900">{b.code}</p>
          <p className="text-sm text-slate-500">
            {b.service} · {b.category}
          </p>
        </div>
        <StatusBadge status={b.status} audience="staff" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canManage && b.canAssign && (
          <Button size="sm" leftIcon={<UserPlus className="size-4" />} onClick={() => setDialog('assign')}>
            {b.technician ? 'Reassign' : 'Assign technician'}
          </Button>
        )}
        {canManage && b.canCancel && (
          <Button size="sm" variant="outline" className="border-danger text-danger hover:bg-danger-soft" leftIcon={<XCircle className="size-4" />} onClick={() => setDialog('cancel')}>
            Cancel booking
          </Button>
        )}
        {canManage && canDispute && (
          <Button size="sm" variant="outline" leftIcon={<Gavel className="size-4" />} onClick={() => setDialog('dispute')}>
            Open dispute
          </Button>
        )}
        {canManage && b.canResolveDispute && (
          <Button size="sm" leftIcon={<Gavel className="size-4" />} onClick={() => setDialog('resolve')}>
            Resolve dispute
          </Button>
        )}
        {canRefund && (
          <Button size="sm" variant="outline" leftIcon={<RotateCcw className="size-4" />} onClick={() => setDialog('refund')}>
            Refund
          </Button>
        )}
      </div>

      <Section title="Schedule & address">
        <Facts
          items={[
            ['Schedule', formatSchedule(b.scheduledFor, b.timeSlot, b.scheduleType)],
            ['Booked', `${formatDate(b.createdAt)}, ${formatTime(b.createdAt)}`],
            ['Address', addressLines(b.address).join(', ')],
            ['Problem', b.description || '—'],
          ]}
        />
        {b.address.latitude != null && b.address.longitude != null && (
          <div className="mt-3">
            <PinMap lat={b.address.latitude} lng={b.address.longitude} label={`${b.customer.name ?? 'Customer'}'s location`} />
          </div>
        )}
      </Section>

      <Section title="People">
        <Facts
          items={[
            ['Customer', b.customer.name ?? '—'],
            ['Customer phone', b.customer.phone ? formatIndianPhone(b.customer.phone) : '—'],
            ['Technician', b.technician?.name ?? 'Unassigned'],
            ['Technician phone', b.technician?.phone ? formatIndianPhone(b.technician.phone) : '—'],
          ]}
        />
      </Section>

      <Section
        title="Money"
        action={
          INVOICE_READY.includes(b.status) && (
            <Link to={`/admin/bookings/${b.id}/invoice`} className="text-sm font-medium text-fixora-blue">
              View invoice
            </Link>
          )
        }
      >
        <Facts
          items={[
            ['Service charge', formatINR(b.price.serviceCharge)],
            ['Visit charge', formatINR(b.price.visitCharge)],
            ['Extra work', formatINR(b.price.additionalCharges)],
            ...(b.price.spareParts > 0 ? [['Spare parts (no commission)', formatINR(b.price.spareParts)] as [string, string]] : []),
            [`Discount${b.couponCode ? ` (${b.couponCode})` : ''}`, `− ${formatINR(b.price.discount)}`],
            ...(b.price.tax > 0 ? [['GST', formatINR(b.price.tax)] as [string, string]] : []),
            ['Total', <b key="t">{formatINR(b.price.total)}</b>],
            ['RapidFix commission', b.commissionAmount == null ? '—' : formatINR(b.commissionAmount)],
            ['Technician earning', b.technicianEarning == null ? '—' : formatINR(b.technicianEarning)],
            ['Payment', b.payment ? `${b.payment.method} · ${humanize(b.payment.status)}` : `${b.paymentMethod} · ${humanize(b.paymentStatus)}`],
            ['Invoice', b.payment?.invoiceNumber ?? '—'],
            ...(b.payment?.refundedAmount ? ([['Refunded', formatINR(b.payment.refundedAmount)]] as [string, string][]) : []),
          ]}
        />
      </Section>

      {b.transactions.length > 0 && (
        <Section title="Transactions">
          <ul className="divide-y divide-slate-100 text-sm">
            {b.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{humanize(t.type)}</span> · {t.provider} · {humanize(t.status)}
                  {t.providerRef && <span className="block text-xs text-slate-500">{t.providerRef}</span>}
                </span>
                <span className="text-right">
                  <span className="block font-semibold">{formatINR(t.amount)}</span>
                  <span className="text-xs text-slate-500">{formatDate(t.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.sparePartItems.length > 0 && (
        <Section title="Spare parts bought by the technician">
          <ul className="divide-y divide-slate-100 text-sm">
            {b.sparePartItems.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{p.name}</span> · {p.quantity} × {formatINR(p.unitPrice)}
                  <span className="block text-xs text-slate-500">
                    Added {formatDate(p.createdAt)}, {formatTime(p.createdAt)}
                    {p.billPhotoUrl && (
                      <>
                        {' · '}
                        <a href={mediaUrl(p.billPhotoUrl)!} target="_blank" rel="noopener noreferrer" className="font-medium text-fixora-blue">
                          Shop bill photo
                        </a>
                      </>
                    )}
                  </span>
                </span>
                <span className="font-semibold">{formatINR(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.additionalChargeItems.length > 0 && (
        <Section title="Extra work requests">
          <ul className="divide-y divide-slate-100 text-sm">
            {b.additionalChargeItems.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2">
                <span>
                  {c.title} <Pill tone={c.status === 'APPROVED' ? 'green' : c.status === 'PENDING' ? 'amber' : 'gray'}>{humanize(c.status)}</Pill>
                </span>
                <span className="font-semibold">{formatINR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Status history">
        <ol className="relative ml-2 border-l border-slate-200 text-sm">
          {b.history.map((h, i) => (
            <li key={i} className="mb-3 ml-4">
              <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-fixora-blue" aria-hidden />
              <p className="font-medium text-slate-900">
                {humanize(h.to)} <span className="font-normal text-slate-500">· {formatDate(h.at)}, {formatTime(h.at)}</span>
              </p>
              {(h.note || h.by) && (
                <p className="text-xs text-slate-500">
                  {h.note}
                  {h.by && ` — ${h.by}`}
                </p>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {b.assignments.length > 0 && (
        <Section title="Dispatch attempts">
          <ul className="divide-y divide-slate-100 text-sm">
            {b.assignments.map((a, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  <span className="font-medium text-slate-900">{a.technicianName}</span> {a.isManual && <Pill tone="purple">Manual</Pill>}
                  <span className="block text-xs text-slate-500">
                    Offered {formatTime(a.offeredAt)}
                    {a.distanceKm != null && ` · ${a.distanceKm} km`}
                  </span>
                </span>
                <Pill tone={a.status === 'ACCEPTED' ? 'green' : a.status === 'OFFERED' ? 'amber' : 'gray'}>{humanize(a.status)}</Pill>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.complaints.length > 0 && (
        <Section title="Complaints">
          <ul className="flex flex-col gap-2 text-sm">
            {b.complaints.map((c) => (
              <li key={c.id} className="rounded-xl bg-slate-50 p-3">
                <p className="font-medium text-slate-900">
                  {c.subject} <Pill tone={c.status === 'RESOLVED' || c.status === 'CLOSED' ? 'green' : 'amber'}>{humanize(c.status)}</Pill>
                </p>
                <p className="text-slate-600">{c.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.review && (
        <Section title="Customer review">
          <p className="text-sm">
            <b>{b.review.rating}★</b> {b.review.comment && `“${b.review.comment}”`}
          </p>
        </Section>
      )}

      {b.technician && <ChatTranscript bookingId={b.id} />}

      <AssignDialog booking={dialog === 'assign' ? { id: b.id, code: b.code, service: b.service } : null} onClose={() => setDialog(null)} />
      <ReasonDialog
        open={dialog === 'cancel'}
        title={`Cancel ${b.code}?`}
        body="The customer and technician are notified. Online payments must be refunded separately."
        confirmLabel="Cancel booking"
        danger
        pending={cancel.isPending}
        error={cancel.error?.message}
        onConfirm={(r) => cancel.mutate(r)}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === 'dispute'}
        title="Open a dispute?"
        body="The booking is frozen until support resolves it."
        label="What is disputed?"
        confirmLabel="Open dispute"
        pending={dispute.isPending}
        error={dispute.error?.message}
        onConfirm={(r) => dispute.mutate(r)}
        onClose={() => setDialog(null)}
      />
      <ResolveDialog b={b} open={dialog === 'resolve'} onClose={() => setDialog(null)} onDone={(d) => done(d, 'Dispute resolved')} />
      <RefundDialog b={b} open={dialog === 'refund'} onClose={() => setDialog(null)} onDone={() => done(null, 'Refund processed')} />
    </div>
  );
}

function ResolveDialog({ b, open, onClose, onDone }: { b: AdminBookingDetailDto; open: boolean; onClose(): void; onDone(d: AdminBookingDetailDto): void }) {
  const paid = b.payment?.status === 'SUCCESS';
  const options = [
    ...(paid ? [{ value: 'PAYMENT_COMPLETED', label: 'Close in favour of technician (keep payment)' }] : [{ value: 'PAYMENT_PENDING', label: 'Continue — customer to pay' }]),
    ...(paid ? [{ value: 'REFUND', label: 'Refund the customer in full' }] : []),
    ...(!paid ? [{ value: 'CANCEL', label: 'Cancel the booking' }] : []),
  ] as { value: 'PAYMENT_PENDING' | 'PAYMENT_COMPLETED' | 'REFUND' | 'CANCEL'; label: string }[];
  const [resolution, setResolution] = useState(options[0]!.value);
  const resolve = useMutation({ mutationFn: (note: string) => adminModulesApi.resolveDispute(b.id, resolution, note), onSuccess: onDone });
  return (
    <ReasonDialog open={open} title="Resolve dispute" label="Resolution note" confirmLabel="Resolve" pending={resolve.isPending} error={resolve.error?.message} onConfirm={(n) => resolve.mutate(n)} onClose={onClose}>
      <fieldset className="mb-3 flex flex-col gap-2">
        {options.map((o) => (
          <label key={o.value} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm', resolution === o.value ? 'border-fixora-blue bg-fixora-blue-soft' : 'border-slate-200')}>
            <input type="radio" name="resolution" checked={resolution === o.value} onChange={() => setResolution(o.value)} className="accent-fixora-blue" />
            {o.label}
          </label>
        ))}
      </fieldset>
    </ReasonDialog>
  );
}

function RefundDialog({ b, open, onClose, onDone }: { b: AdminBookingDetailDto; open: boolean; onClose(): void; onDone(): void }) {
  const refundable = (b.payment?.amount ?? 0) - (b.payment?.refundedAmount ?? 0);
  const [amount, setAmount] = useState('');
  const paise = amount ? rupeesToPaise(Number(amount)) : refundable;
  const refund = useMutation({ mutationFn: (reason: string) => adminModulesApi.refund(b.id, { amount: amount ? paise : undefined, reason }), onSuccess: onDone });
  return (
    <ReasonDialog
      open={open}
      title={`Refund ${b.code}`}
      body={
        <>
          Up to <b>{formatINR(refundable)}</b> can be refunded. {b.payment?.method === 'RAZORPAY' ? 'Razorpay sends it to the original payment method.' : 'Record a cash/UPI refund you have handed back.'} The
          technician's share is clawed back proportionally.
        </>
      }
      confirmLabel={`Refund ${formatINR(Math.min(paise, refundable))}`}
      danger
      pending={refund.isPending}
      error={refund.error?.message ?? (paise > refundable ? 'Amount is more than the refundable balance.' : null)}
      onConfirm={(r) => paise <= refundable && refund.mutate(r)}
      onClose={onClose}
    >
      <Field label="Amount in ₹ (leave empty for full refund)" className="mb-3">
        <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={inputCls} placeholder={String(refundable / 100)} />
      </Field>
    </ReasonDialog>
  );
}

/** Staff can read (not write) the customer ↔ technician chat for support. */
function ChatTranscript({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  const messages = useQuery({ queryKey: ['chat', bookingId, 'messages'], queryFn: () => bookingApi.messages(bookingId), enabled: open });
  return (
    <Section
      title="Chat"
      action={
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-fixora-blue">
          <MessageSquareText className="size-4" /> {open ? 'Hide' : 'Show transcript'}
        </button>
      }
    >
      {open && (
        <>
          {messages.isPending && <Skeleton className="h-24" />}
          {messages.isError && <Alert>{messages.error.message}</Alert>}
          {messages.data?.length === 0 && <p className="text-sm text-slate-500">No messages.</p>}
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm">
            {messages.data?.map((m) => (
              <li key={m.id}>
                <span className="font-semibold text-slate-900">{m.senderName}</span> <span className="text-xs text-slate-400">{formatTime(m.createdAt)}</span>
                <p className="text-slate-700">{m.body ?? (m.imageUrl ? '📷 Photo' : '')}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
