import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, WalletCards } from 'lucide-react';
import type { AdminPaymentsDto, AdminPayoutDto, AdminWalletRowDto } from '@fixora/shared-types';
import { formatINR, formatIndianPhone, rupeesToPaise } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { Pill } from '../../../components/StatusBadge';
import { adminModulesApi } from '../../../lib/endpoints';
import { formatDate, formatTime } from '../../../lib/format';
import { toast } from '../../../store/toast';
import { Card } from '../components/Card';
import { DataTable, Field, FilterSelect, humanize, inputCls, PageTitle, Pager, SearchBox, StatTile, useUrlParams, type Column } from '../components/kit';
import { BookingDrawer } from './BookingsPage';

const PAGE_SIZE = 25;
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', RAZORPAY: 'Razorpay' };
type Txn = AdminPaymentsDto['transactions'][number];

const TXN_COLUMNS: Column<Txn>[] = [
  { header: 'Date', className: 'whitespace-nowrap', cell: (t) => `${formatDate(t.createdAt)}, ${formatTime(t.createdAt)}` },
  { header: 'Booking', cell: (t) => <span className="font-semibold text-slate-900">{t.bookingCode}</span> },
  { header: 'Customer', cell: (t) => t.customerName },
  { header: 'Type', cell: (t) => <Pill tone={t.type === 'REFUND' ? 'purple' : 'blue'}>{humanize(t.type)}</Pill> },
  { header: 'Method', cell: (t) => METHOD_LABEL[t.method] ?? t.method },
  { header: 'Status', cell: (t) => <Pill tone={t.status === 'SUCCESS' ? 'green' : t.status === 'FAILED' ? 'red' : 'amber'}>{humanize(t.status)}</Pill> },
  { header: 'Reference', className: 'max-w-[180px] truncate font-mono text-xs', cell: (t) => t.providerRef ?? '—' },
  { header: 'Amount', className: 'text-right whitespace-nowrap font-semibold', cell: (t) => (t.type === 'REFUND' ? `− ${formatINR(t.amount)}` : formatINR(t.amount)) },
];

export function PaymentsPage() {
  const { get, set, page } = useUrlParams();
  const from = get('from');
  const to = get('to');
  const method = get('method');
  const status = get('status');
  const openId = get('id');
  const data = useQuery({
    queryKey: ['admin', 'payments', { from, to, method, status, page }],
    queryFn: () => adminModulesApi.payments({ from, to: to ? `${to}T23:59:59+05:30` : undefined, method, status, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const s = data.data?.summary;
  const maxMethod = Math.max(1, ...(s?.byMethod.map((m) => m.amount) ?? [1]));

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={CreditCard} title="Payments" subtitle="Collections, refunds and reconciliation across cash, UPI and Razorpay." />
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          From <input type="date" value={from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          To <input type="date" value={to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} className={cx(inputCls, 'w-auto')} />
        </label>
        <FilterSelect label="All methods" value={method} options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} onChange={(v) => set({ method: v })} />
        <FilterSelect
          label="All statuses"
          value={status}
          options={['SUCCESS', 'PENDING', 'FAILED'].map((v) => ({ value: v, label: humanize(v) }))}
          onChange={(v) => set({ status: v })}
        />
      </div>

      {s && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatTile label="Collected" value={formatINR(s.revenue)} />
          <StatTile label="RapidFix commission" value={formatINR(s.commission)} tone="success" />
          <StatTile label="Technician earnings" value={formatINR(s.technicianEarnings)} />
          <StatTile label="GST collected" value={formatINR(s.tax)} />
          <StatTile label="Refunded" value={formatINR(s.refunds)} />
          <StatTile label="Awaiting payment" value={s.pending} hint="bookings" tone={s.pending ? 'warning' : undefined} />
          <StatTile label="Failed attempts" value={s.failed} tone={s.failed ? 'danger' : undefined} />
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card title="Transactions">
          <DataTable
            columns={TXN_COLUMNS}
            rows={data.data?.transactions}
            rowKey={(t) => t.id}
            onRowClick={(t) => set({ id: t.bookingId, page: String(page) })}
            loading={data.isPending}
            fetching={data.isFetching}
            error={data.error}
            onRetry={() => void data.refetch()}
            empty="No transactions in this period"
          />
          {data.data && <Pager page={page} total={data.data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} noun="transactions" />}
        </Card>
        <Card title="By method">
          {s?.byMethod.length === 0 && <p className="text-sm text-slate-500">No payments yet.</p>}
          <ul className="flex flex-col gap-3">
            {s?.byMethod.map((m) => (
              <li key={m.method} className="text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-900">{METHOD_LABEL[m.method] ?? m.method}</span>
                  <span className="text-slate-600">
                    {formatINR(m.amount)} · {m.count}
                  </span>
                </div>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-[#2563EB]" style={{ width: `${(m.amount / maxMethod) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Dialog variant="drawer" open={!!openId} onClose={() => set({ id: undefined, page: String(page) })} title="Booking details">
        {openId && <BookingDrawer id={openId} />}
      </Dialog>
    </div>
  );
}

// ─── Payouts ─────────────────────────────────────────────────────────────

export function PayoutsPage() {
  const { get, set } = useUrlParams();
  const q = get('q');
  const wallets = useQuery({ queryKey: ['admin', 'wallets', q], queryFn: () => adminModulesApi.wallets(q) });
  const payouts = useQuery({ queryKey: ['admin', 'payouts'], queryFn: adminModulesApi.payouts });
  const [paying, setPaying] = useState<AdminWalletRowDto | null>(null);

  const walletColumns: Column<AdminWalletRowDto>[] = [
    {
      header: 'Technician',
      cell: (w) => (
        <span>
          <span className="block font-medium text-slate-900">{w.name}</span>
          <span className="text-xs text-slate-500">{w.phone ? formatIndianPhone(w.phone) : ''}</span>
        </span>
      ),
    },
    { header: 'Total earned', className: 'text-right whitespace-nowrap', cell: (w) => formatINR(w.totalEarned) },
    { header: 'Paid out', className: 'text-right whitespace-nowrap', cell: (w) => formatINR(w.totalPaidOut) },
    {
      header: 'Balance',
      className: 'text-right whitespace-nowrap',
      cell: (w) => <span className={cx('font-semibold', w.balance < 0 ? 'text-danger' : w.balance > 0 ? 'text-success' : '')}>{formatINR(w.balance)}</span>,
    },
    { header: 'Payout to', cell: (w) => w.upiId ?? (w.bankAccountLast4 ? `A/c •••• ${w.bankAccountLast4}` : <span className="text-slate-400">Not added</span>) },
    {
      header: '',
      className: 'text-right',
      cell: (w) =>
        w.balance > 0 ? (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setPaying(w);
            }}
          >
            Pay out
          </Button>
        ) : w.balance < 0 ? (
          <span className="text-xs text-slate-500">Owes RapidFix</span>
        ) : null,
    },
  ];
  const payoutColumns: Column<AdminPayoutDto>[] = [
    { header: 'Date', className: 'whitespace-nowrap', cell: (p) => formatDate(p.processedAt ?? p.createdAt) },
    { header: 'Technician', cell: (p) => p.technicianName },
    { header: 'Method', cell: (p) => humanize(p.method) },
    { header: 'Reference', className: 'font-mono text-xs', cell: (p) => p.reference ?? '—' },
    { header: 'Status', cell: (p) => <Pill tone={p.status === 'PAID' ? 'green' : p.status === 'FAILED' ? 'red' : 'amber'}>{humanize(p.status)}</Pill> },
    { header: 'Amount', className: 'text-right font-semibold whitespace-nowrap', cell: (p) => formatINR(p.amount) },
  ];

  const due = wallets.data?.filter((w) => w.balance > 0).reduce((s, w) => s + w.balance, 0) ?? 0;
  const owed = wallets.data?.filter((w) => w.balance < 0).reduce((s, w) => s - w.balance, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[1440px]">
      <PageTitle icon={WalletCards} title="Payouts" subtitle="Technician wallets: online earnings are credited, cash-job commission is debited." />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Due to technicians" value={formatINR(due)} tone="success" />
        <StatTile label="Owed to RapidFix (cash jobs)" value={formatINR(owed)} tone={owed ? 'warning' : undefined} />
        <StatTile label="Payouts recorded" value={payouts.data?.length ?? '—'} />
      </div>
      <Card className="mt-4" title="Wallets">
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="Search technician" className="max-w-md" />
        <DataTable columns={walletColumns} rows={wallets.data} rowKey={(w) => w.technicianId} loading={wallets.isPending} error={wallets.error} onRetry={() => void wallets.refetch()} empty="No wallets" />
      </Card>
      <Card className="mt-4" title="Payout history">
        <DataTable columns={payoutColumns} rows={payouts.data} rowKey={(p) => p.id} loading={payouts.isPending} error={payouts.error} onRetry={() => void payouts.refetch()} empty="No payouts yet" minWidth={720} />
      </Card>
      {paying && <PayoutDialog wallet={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayoutDialog({ wallet, onClose }: { wallet: AdminWalletRowDto; onClose(): void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(wallet.balance / 100));
  const [method, setMethod] = useState<'UPI' | 'BANK_TRANSFER' | 'CASH'>(wallet.upiId ? 'UPI' : 'BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const paise = rupeesToPaise(Number(amount) || 0);
  const pay = useMutation({
    mutationFn: () => adminModulesApi.createPayout({ technicianId: wallet.technicianId, amount: paise, method, reference: reference.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast(`Payout of ${formatINR(paise)} recorded`);
      onClose();
    },
  });
  const valid = paise >= 100 && paise <= wallet.balance && reference.trim().length >= 3;
  return (
    <Dialog
      variant="center"
      open
      onClose={onClose}
      title={`Pay ${wallet.name}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} loading={pay.isPending} onClick={() => pay.mutate()}>
            Record payout
          </Button>
        </div>
      }
    >
      <p className="text-sm text-slate-600">
        Send the money from the company account first, then record it here with the transaction reference. Available: <b>{formatINR(wallet.balance)}</b>
      </p>
      <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {wallet.upiId && (
          <>
            UPI: <b>{wallet.upiId}</b>
            <br />
          </>
        )}
        {wallet.bankAccountLast4 ? (
          <>
            Bank: •••• {wallet.bankAccountLast4} · {wallet.bankIfsc}
          </>
        ) : (
          !wallet.upiId && 'No payout details added by the technician yet.'
        )}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Amount (₹)">
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className={inputCls} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={inputCls}>
            <option value="UPI">UPI</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="CASH">Cash</option>
          </select>
        </Field>
        <Field label="Transaction reference / UTR" className="sm:col-span-2">
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} />
        </Field>
      </div>
      {paise > wallet.balance && <Alert className="mt-3">Amount is more than the wallet balance.</Alert>}
      {pay.isError && <Alert className="mt-3">{pay.error.message}</Alert>}
    </Dialog>
  );
}
