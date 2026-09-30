import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleAlert, CreditCard, FileText, ReceiptText, Star, Wrench } from 'lucide-react';
import type { BookingDetailDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { COMPLAINT_CATEGORIES, complaintApi, customerApi } from '../../../lib/endpoints';
import { formatDate, formatTime } from '../../../lib/format';
import { payWithRazorpay } from '../../../lib/razorpay';
import { toast } from '../../../store/toast';

const INVOICE_STATUSES = ['SERVICE_COMPLETED', 'PAYMENT_PENDING', 'PAYMENT_COMPLETED', 'REFUNDED', 'DISPUTED'];

function useSetBooking(id: string) {
  const qc = useQueryClient();
  return (data: BookingDetailDto) => {
    qc.setQueryData(['customer', 'booking', id], data);
    void qc.invalidateQueries({ queryKey: ['customer', 'bookings'] });
  };
}

/** Extra work the technician found: nothing is billed until the customer approves. */
export function AdditionalChargesCard({ b }: { b: BookingDetailDto }) {
  const setBooking = useSetBooking(b.id);
  const respond = useMutation({
    mutationFn: ({ chargeId, decision }: { chargeId: string; decision: 'approve' | 'reject' }) => customerApi.respondCharge(b.id, chargeId, decision),
    onSuccess: (d, v) => {
      setBooking(d);
      toast(v.decision === 'approve' ? 'Extra work approved' : 'Extra work declined');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (!b.additionalChargeItems.length) return null;
  const pending = b.additionalChargeItems.filter((c) => c.status === 'PENDING');
  const answered = b.additionalChargeItems.filter((c) => c.status !== 'PENDING');

  return (
    <section className="flex flex-col gap-3">
      {pending.map((c) => (
        <div key={c.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" role="alert">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <Wrench className="size-5 text-amber-600" aria-hidden /> Approval needed
          </p>
          <p className="mt-2 text-[15px] text-slate-800">
            Your technician needs to do <b>{c.title}</b>
          </p>
          {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatINR(c.amount)} <span className="text-sm font-normal text-slate-500">+ GST</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">If you decline, the technician continues with the original work only.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" disabled={respond.isPending} loading={respond.isPending && respond.variables?.decision === 'reject'} onClick={() => respond.mutate({ chargeId: c.id, decision: 'reject' })}>
              Decline
            </Button>
            <Button size="lg" disabled={respond.isPending} loading={respond.isPending && respond.variables?.decision === 'approve'} onClick={() => respond.mutate({ chargeId: c.id, decision: 'approve' })}>
              Approve
            </Button>
          </div>
        </div>
      ))}
      {answered.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Extra work</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {answered.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{c.title}</span>
                  <span className={cx('text-xs font-medium', c.status === 'APPROVED' ? 'text-success' : 'text-slate-500')}>
                    {c.status === 'APPROVED' ? 'Approved' : 'Declined'}
                  </span>
                </span>
                <span className={cx('font-semibold', c.status === 'REJECTED' ? 'text-slate-400 line-through' : 'text-slate-900')}>{formatINR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Pay online (Razorpay) or settle with the technician in cash / UPI. */
export function PaymentCard({ b }: { b: BookingDetailDto }) {
  const setBooking = useSetBooking(b.id);
  const pay = useMutation({
    mutationFn: async () => {
      const order = await customerApi.razorpayOrder(b.id);
      const signed = await payWithRazorpay(order);
      return customerApi.razorpayVerify(b.id, signed);
    },
    onSuccess: (d) => {
      setBooking(d);
      toast('Payment successful. Thank you!');
    },
    onError: (e) => toast(e.message, e.message === 'Payment cancelled' ? 'default' : 'error'),
  });

  const p = b.payment;
  if (p?.status === 'SUCCESS' || p?.status === 'REFUNDED') {
    return (
      <section className="flex items-center gap-3 rounded-2xl bg-success-soft p-4">
        <ReceiptText className="size-7 shrink-0 text-success" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-slate-900">
            {formatINR(p.amount)} paid {p.method === 'RAZORPAY' ? 'online' : p.method === 'CASH' ? 'in cash' : 'by UPI'}
          </p>
          {p.paidAt && (
            <p className="text-slate-600">
              {formatDate(p.paidAt)}, {formatTime(p.paidAt)}
              {p.invoiceNumber && ` · ${p.invoiceNumber}`}
            </p>
          )}
          {p.refundedAmount > 0 && <p className="mt-0.5 font-medium text-fixora-blue">{formatINR(p.refundedAmount)} refunded to you</p>}
        </div>
      </section>
    );
  }
  if (b.status !== 'PAYMENT_PENDING') return null;

  return (
    <section className="rounded-2xl border border-slate-100 p-4 shadow-card">
      <p className="text-[15px] font-semibold text-slate-900">Amount to pay</p>
      <p className="mt-1 text-3xl font-bold text-slate-900">{formatINR(b.price.total)}</p>
      {b.onlinePaymentAvailable && (
        <Button size="lg" fullWidth className="mt-4" loading={pay.isPending} onClick={() => pay.mutate()} leftIcon={<CreditCard className="size-5" />}>
          Pay online (UPI, card, netbanking)
        </Button>
      )}
      <p className={cx('flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600', b.onlinePaymentAvailable ? 'mt-3' : 'mt-4')}>
        <Banknote className="mt-0.5 size-4.5 shrink-0 text-fixora-blue" aria-hidden />
        {b.onlinePaymentAvailable ? 'Or pay' : 'Please pay'} your technician in cash or by UPI. They'll mark it received and your invoice will be ready instantly.
      </p>
    </section>
  );
}

export function InvoiceLink({ b }: { b: BookingDetailDto }) {
  if (!INVOICE_STATUSES.includes(b.status)) return null;
  return (
    <Link
      to={`/bookings/${b.id}/invoice`}
      className="flex items-center gap-3 rounded-2xl border border-slate-100 p-4 text-[15px] font-medium text-slate-900 shadow-card hover:bg-slate-50"
    >
      <FileText className="size-5 text-fixora-blue" aria-hidden />
      <span className="flex-1">{b.payment?.status === 'SUCCESS' ? 'View invoice' : 'View bill'}</span>
      <span className="text-sm text-fixora-blue">Open</span>
    </Link>
  );
}

/** Rate the technician once the job is paid; shows the review afterwards. */
export function ReviewCard({ b }: { b: BookingDetailDto }) {
  const setBooking = useSetBooking(b.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const submit = useMutation({
    mutationFn: () => customerApi.review(b.id, { rating, comment: comment.trim() || undefined }),
    onSuccess: (d) => {
      setBooking(d);
      toast('Thanks for your feedback!');
    },
  });

  if (b.review) {
    return (
      <section className="rounded-2xl bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-600">Your rating</p>
        <Stars value={b.review.rating} className="mt-1" />
        {b.review.comment && <p className="mt-2 text-[15px] text-slate-800">“{b.review.comment}”</p>}
      </section>
    );
  }
  if (b.status !== 'PAYMENT_COMPLETED' || !b.technician) return null;

  return (
    <section className="rounded-2xl border border-slate-100 p-4 shadow-card">
      <p className="text-[15px] font-semibold text-slate-900">How was {b.technician.name.split(' ')[0]}'s service?</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className="p-1">
            <Star className={cx('size-8 transition', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            rows={3}
            value={comment}
            maxLength={1000}
            onChange={(e) => setComment(e.target.value)}
            placeholder={rating >= 4 ? 'What did you like? (optional)' : 'What could have been better? (optional)'}
            className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-[15px] outline-none focus:border-fixora-blue"
          />
          {submit.isError && <Alert className="mt-2">{submit.error.message}</Alert>}
          <Button size="lg" fullWidth className="mt-3" loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit rating
          </Button>
        </>
      )}
    </section>
  );
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('flex gap-0.5', className)} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cx('size-5', n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
      ))}
    </span>
  );
}

/** Complaint about this booking — goes to the support queue. */
export function ReportIssueButton({ bookingId }: { bookingId?: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof COMPLAINT_CATEGORIES)[number]>('Service quality');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const raise = useMutation({
    mutationFn: () => complaintApi.raise({ bookingId, category, subject: subject.trim(), description: description.trim() }),
    onSuccess: () => {
      setOpen(false);
      setSubject('');
      setDescription('');
      toast('Complaint submitted. Our support team will contact you.');
    },
  });
  const valid = subject.trim().length >= 4 && description.trim().length >= 10;

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-500 hover:text-danger">
        <CircleAlert className="size-4" aria-hidden /> Report an issue
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Report an issue"
        footer={
          <Button size="lg" fullWidth disabled={!valid} loading={raise.isPending} onClick={() => raise.mutate()}>
            Submit
          </Button>
        }
      >
        <label className="text-sm font-medium text-slate-700" htmlFor="c-cat">
          What went wrong?
        </label>
        <select
          id="c-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-fixora-blue"
        >
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="c-sub">
          Subject
        </label>
        <input
          id="c-sub"
          value={subject}
          maxLength={160}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. AC still not cooling"
          className="mt-1 h-12 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none focus:border-fixora-blue"
        />
        <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor="c-desc">
          Details
        </label>
        <textarea
          id="c-desc"
          rows={4}
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what happened (at least 10 characters)"
          className="mt-1 w-full resize-none rounded-xl border border-slate-200 p-3 text-[15px] outline-none focus:border-fixora-blue"
        />
        {raise.isError && <Alert className="mt-2">{raise.error.message}</Alert>}
      </Dialog>
    </>
  );
}
