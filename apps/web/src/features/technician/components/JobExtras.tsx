import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleCheck, FileText, Loader2, Plus, QrCode, Wrench } from 'lucide-react';
import { encode } from 'uqr';
import type { TechnicianJobDetailDto } from '@fixora/shared-types';
import { formatINR, rupeesToPaise } from '@fixora/shared-utils';
import { Alert, Button, TextField, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { technicianApi } from '../../../lib/endpoints';
import { toast } from '../../../store/toast';

const STATUS_TONE = { PENDING: 'bg-warning-soft text-warning', APPROVED: 'bg-success-soft text-success', REJECTED: 'bg-slate-100 text-slate-500' } as const;
const STATUS_LABEL = { PENDING: 'Waiting for customer', APPROVED: 'Approved', REJECTED: 'Declined' } as const;

/** Extra work: request customer approval before doing anything not in the booking. */
export function ExtraWorkSection({ j }: { j: TechnicianJobDetailDto }) {
  const [open, setOpen] = useState(false);
  if (!j.canRequestAdditionalCharge && !j.additionalChargeItems.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Wrench className="size-5 text-fixora-blue" aria-hidden /> Extra work
        </h3>
        {j.canRequestAdditionalCharge && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-fixora-blue">
            <Plus className="size-4" /> Add
          </button>
        )}
      </div>
      {j.additionalChargeItems.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Found more work? Ask the customer to approve it before you start.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {j.additionalChargeItems.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-slate-900">{c.title}</span>
                <span className={cx('mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[c.status])}>{STATUS_LABEL[c.status]}</span>
              </span>
              <span className="font-semibold text-slate-900">{formatINR(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <RequestChargeDialog j={j} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function RequestChargeDialog({ j, open, onClose }: { j: TechnicianJobDetailDto; open: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const rupees = Number(amount);
  const valid = title.trim().length >= 2 && Number.isFinite(rupees) && rupees >= 1;
  const send = useMutation({
    mutationFn: () => technicianApi.requestCharge(j.id, { title: title.trim(), description: description.trim() || undefined, amount: rupeesToPaise(rupees) }),
    onSuccess: (d) => {
      qc.setQueryData(['tech', 'job', j.id], d);
      setTitle('');
      setDescription('');
      setAmount('');
      onClose();
      toast('Sent to the customer for approval');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request extra work"
      footer={
        <Button size="lg" fullWidth disabled={!valid} loading={send.isPending} onClick={() => send.mutate()}>
          Send for approval
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField label="Work needed" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Replace capacitor" />
        <TextField
          label="Amount (₹)"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          placeholder="850"
        />
        <label className="text-sm font-medium text-slate-700" htmlFor="xw-desc">
          Why is it needed? <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="xw-desc"
          rows={3}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          className="-mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-[15px] outline-none focus:border-fixora-blue"
        />
        {send.isError && <Alert>{send.error.message}</Alert>}
      </div>
    </Dialog>
  );
}

/** A QR code drawn as SVG (no network, no images). */
function QrSvg({ value, size = 220 }: { value: string; size?: number }) {
  const { data } = encode(value, { ecc: 'M', border: 2 });
  const n = data.length;
  let path = '';
  data.forEach((row, y) => row.forEach((on, x) => on && (path += `M${x} ${y}h1v1h-1z`)));
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="Payment QR code" className="rounded-lg bg-white">
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}

/**
 * After the job: collect what's left. Opens by itself when the job is completed —
 * a Razorpay QR the customer scans (UPI / card), also texted to their phone; the
 * job closes automatically the moment they pay. Cash / UPI-to-you stay as options.
 */
export function CollectPaymentCard({ j }: { j: TechnicianJobDetailDto }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<'CASH' | 'UPI' | null>(null);
  const done = (d?: TechnicianJobDetailDto) => {
    if (d) qc.setQueryData(['tech', 'job', j.id], d);
    void qc.invalidateQueries({ queryKey: ['tech'] });
  };
  const collect = useMutation({
    mutationFn: (m: 'CASH' | 'UPI') => technicianApi.collectPayment(j.id, m),
    onSuccess: (d) => {
      done(d);
      setMethod(null);
      toast('Payment recorded. Job closed ✓');
    },
  });

  const wantsQr = j.canCollectPayment && j.onlinePaymentAvailable && j.amountDue > 0;
  // One link per amount; re-opening the screen re-uses it.
  const link = useQuery({
    queryKey: ['tech', 'job', j.id, 'payment-link', j.amountDue],
    queryFn: () => technicianApi.paymentLink(j.id),
    enabled: wantsQr,
    staleTime: Infinity,
    retry: 1,
  });
  // Watch for the customer's payment (the socket also refreshes the job).
  const linkId = link.data?.linkId;
  const status = useQuery({
    queryKey: ['tech', 'job', j.id, 'payment-link-status', linkId],
    queryFn: () => technicianApi.checkPaymentLink(j.id, linkId!),
    enabled: wantsQr && !!linkId,
    refetchInterval: 4000,
  });
  const paidOnline = status.data?.paid === true;
  useEffect(() => {
    if (!paidOnline) return;
    toast('Customer paid online. Job closed ✓');
    void qc.invalidateQueries({ queryKey: ['tech'] });
  }, [paidOnline, qc]);

  if (j.payment?.status === 'SUCCESS' && !j.canCollectPayment) {
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-success-soft p-4">
        <CircleCheck className="size-7 shrink-0 text-success" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {formatINR(j.payment.status === 'SUCCESS' && j.status === 'PAYMENT_COMPLETED' ? j.payment.amount : j.payment.paidOnline)}{' '}
            {j.status === 'PAYMENT_COMPLETED' ? 'received' : 'paid online in advance'} · {j.payment.method === 'RAZORPAY' ? 'Online' : j.payment.method}
          </p>
          {j.payment.invoiceNumber ? (
            <p className="text-slate-600">Invoice {j.payment.invoiceNumber}</p>
          ) : (
            <p className="text-slate-600">Nothing to collect for the booked work.</p>
          )}
        </div>
        {j.status === 'PAYMENT_COMPLETED' && <InvoiceButton id={j.id} />}
      </section>
    );
  }
  if (!j.canCollectPayment) return null;

  const advance = j.payment?.paidOnline ?? 0;
  return (
    <section className="rounded-2xl border-2 border-fixora-blue/30 bg-fixora-blue-soft/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">Collect from customer</p>
          <p className="text-3xl font-bold text-slate-900">{formatINR(j.amountDue)}</p>
          {advance > 0 && <p className="text-xs font-medium text-success">{formatINR(advance)} already paid online</p>}
        </div>
        <InvoiceButton id={j.id} />
      </div>

      {wantsQr && (
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-white p-4 text-center shadow-card">
          <p className="text-sm font-semibold text-slate-900">Customer scans to pay — UPI, card or net banking</p>
          <div className="mt-3 flex size-[236px] items-center justify-center">
            {link.data ? <QrSvg value={link.data.shortUrl} /> : link.isError ? null : <Loader2 className="size-8 animate-spin text-fixora-blue" aria-label="Loading QR" />}
          </div>
          {link.isError ? (
            <Alert className="mt-2 w-full">{link.error.message}</Alert>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Waiting for payment — the job closes automatically. A payment link was also sent to the customer by SMS.
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs font-medium text-slate-600">{wantsQr ? 'Customer paid you directly instead?' : 'How did the customer pay?'}</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="bg-white" leftIcon={<Banknote className="size-5" />} onClick={() => setMethod('CASH')}>
          Cash
        </Button>
        <Button variant="outline" size="lg" className="bg-white" leftIcon={<QrCode className="size-5" />} onClick={() => setMethod('UPI')}>
          UPI to me
        </Button>
      </div>
      <Dialog
        open={!!method}
        onClose={() => setMethod(null)}
        title={`Received ${formatINR(j.amountDue)} by ${method === 'CASH' ? 'cash' : 'UPI'}?`}
        footer={
          <Button size="lg" fullWidth loading={collect.isPending} onClick={() => method && collect.mutate(method)}>
            Yes, I received it
          </Button>
        }
      >
        <p className="text-[15px] text-slate-600">
          Confirm only after the money is in your hand or account. RapidFix's commission for this job will be adjusted from your wallet.
        </p>
        {collect.isError && <Alert className="mt-3">{collect.error.message}</Alert>}
      </Dialog>
    </section>
  );
}

function InvoiceButton({ id }: { id: string }) {
  return (
    <Link to={`/technician/jobs/${id}/invoice`} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-fixora-blue">
      <FileText className="size-4" /> Bill
    </Link>
  );
}
