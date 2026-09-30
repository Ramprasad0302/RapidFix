import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleCheck, FileText, Plus, QrCode, Wrench } from 'lucide-react';
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
          label="Amount (₹, before GST)"
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

/** After completion: record cash / UPI received (online payments settle on their own). */
export function CollectPaymentCard({ j }: { j: TechnicianJobDetailDto }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<'CASH' | 'UPI' | null>(null);
  const collect = useMutation({
    mutationFn: (m: 'CASH' | 'UPI') => technicianApi.collectPayment(j.id, m),
    onSuccess: (d) => {
      qc.setQueryData(['tech', 'job', j.id], d);
      void qc.invalidateQueries({ queryKey: ['tech'] });
      setMethod(null);
      toast('Payment recorded. Job closed ✓');
    },
  });

  if (j.payment?.status === 'SUCCESS') {
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-success-soft p-4">
        <CircleCheck className="size-7 shrink-0 text-success" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {formatINR(j.payment.amount)} received · {j.payment.method === 'RAZORPAY' ? 'Online' : j.payment.method}
          </p>
          {j.payment.invoiceNumber && <p className="text-slate-600">Invoice {j.payment.invoiceNumber}</p>}
        </div>
        <InvoiceButton id={j.id} />
      </section>
    );
  }
  if (!j.canCollectPayment) return null;

  return (
    <section className="rounded-2xl border-2 border-fixora-blue/30 bg-fixora-blue-soft/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">Collect from customer</p>
          <p className="text-3xl font-bold text-slate-900">{formatINR(j.price.total)}</p>
        </div>
        <InvoiceButton id={j.id} />
      </div>
      <p className="mt-1 text-xs text-slate-500">If the customer pays online in the app, this job closes automatically.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" className="bg-white" leftIcon={<Banknote className="size-5" />} onClick={() => setMethod('CASH')}>
          Cash
        </Button>
        <Button variant="outline" size="lg" className="bg-white" leftIcon={<QrCode className="size-5" />} onClick={() => setMethod('UPI')}>
          UPI
        </Button>
      </div>
      <Dialog
        open={!!method}
        onClose={() => setMethod(null)}
        title={`Received ${formatINR(j.price.total)} by ${method === 'CASH' ? 'cash' : 'UPI'}?`}
        footer={
          <Button size="lg" fullWidth loading={collect.isPending} onClick={() => method && collect.mutate(method)}>
            Yes, I received it
          </Button>
        }
      >
        <p className="text-[15px] text-slate-600">
          Confirm only after the money is in your hand or account. FIXORA's commission for this job will be adjusted from your wallet.
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
