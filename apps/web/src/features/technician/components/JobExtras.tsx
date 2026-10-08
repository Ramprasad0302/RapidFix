import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Camera, CircleCheck, FileText, Loader2, Package, Plus, QrCode, Trash2, Wrench } from 'lucide-react';
import { encode } from 'uqr';
import type { TechnicianJobDetailDto } from '@fixora/shared-types';
import { formatINR, rupeesToPaise } from '@fixora/shared-utils';
import { Alert, Button, TextField, cx } from '@fixora/ui';
import { Dialog } from '../../../components/Dialog';
import { mediaUrl } from '../../../lib/api';
import { technicianApi, uploadApi } from '../../../lib/endpoints';
import { compressImage } from '../../../lib/imageCompress';
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

/**
 * Spare parts the technician bought for this job: name, quantity, price per piece and
 * (optionally) a photo of the shop bill. They go straight onto the customer's bill and
 * invoice — the customer is notified — and RapidFix takes no commission on them.
 */
export function SparePartsSection({ j }: { j: TechnicianJobDetailDto }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (partId: string) => technicianApi.removeSparePart(j.id, partId),
    onSuccess: (d) => {
      qc.setQueryData(['tech', 'job', j.id], d);
      toast('Removed from the bill');
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (!j.canEditSpareParts && !j.sparePartItems.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Package className="size-5 text-fixora-blue" aria-hidden /> Spare parts
        </h3>
        {j.canEditSpareParts && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-fixora-blue">
            <Plus className="size-4" /> Add part
          </button>
        )}
      </div>
      {j.sparePartItems.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Bought a part for this job? Add it with its price — it’s added to the customer’s bill and paid back to you in full.</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-2">
            {j.sparePartItems.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-2.5">
                {p.billPhotoUrl ? (
                  <a href={mediaUrl(p.billPhotoUrl)!} target="_blank" rel="noopener noreferrer" aria-label="Shop bill photo" className="shrink-0">
                    <img src={mediaUrl(p.billPhotoUrl)!} alt="" className="size-11 rounded-lg object-cover" loading="lazy" />
                  </a>
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                    <Package className="size-5" aria-hidden />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-slate-900">{p.name}</span>
                  <span className="text-xs text-slate-500">
                    {p.quantity} × {formatINR(p.unitPrice)}
                  </span>
                </span>
                <span className="font-semibold text-slate-900">{formatINR(p.amount)}</span>
                {j.canEditSpareParts && (
                  <button
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                    aria-label={`Remove ${p.name}`}
                    className="flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between text-sm">
            <span className="text-slate-600">Spare parts total</span>
            <span className="font-semibold text-slate-900">{formatINR(j.price.spareParts)}</span>
          </p>
        </>
      )}
      <AddSparePartDialog j={j} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

function AddSparePartDialog({ j, open, onClose }: { j: TechnicianJobDetailDto; open: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const quantity = Number(qty);
  const rupees = Number(price);
  const valid = name.trim().length >= 2 && Number.isInteger(quantity) && quantity >= 1 && quantity <= 100 && Number.isFinite(rupees) && rupees >= 1;
  const reset = () => {
    setName('');
    setQty('1');
    setPrice('');
    setPhoto(null);
    setPreview(null);
  };
  const save = useMutation({
    mutationFn: async () => {
      const billPhotoUrl = photo ? (await uploadApi.upload(await compressImage(photo), 'image')).path : null;
      return technicianApi.addSparePart(j.id, { name: name.trim(), quantity, unitPrice: rupeesToPaise(rupees), billPhotoUrl });
    },
    onSuccess: (d) => {
      qc.setQueryData(['tech', 'job', j.id], d);
      reset();
      onClose();
      toast('Added to the bill — the customer can see it');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add spare part"
      footer={
        <Button size="lg" fullWidth disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
          Add {valid ? formatINR(rupeesToPaise(rupees) * quantity) : ''} to bill
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField label="Part name" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} placeholder="e.g. Capacitor 2.5 µF" />
        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <TextField label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, '').slice(0, 3))} />
          <TextField label="Price per piece (₹)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} placeholder="250" />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = '';
            setPhoto(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600"
        >
          {preview ? <img src={preview} alt="" className="size-12 rounded-lg object-cover" /> : <Camera className="size-6 text-fixora-blue" aria-hidden />}
          <span>
            <span className="block font-medium text-slate-900">{photo ? 'Shop bill added' : 'Photo of the shop bill'}</span>
            <span className="text-xs">{photo ? 'Tap to change' : 'Optional — shown to the customer with the part'}</span>
          </span>
        </button>
        {save.isError && <Alert>{save.error.message}</Alert>}
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
            {j.status === 'PAYMENT_COMPLETED' ? 'received' : 'advance paid online'} · {j.payment.method === 'RAZORPAY' ? 'Online' : j.payment.method}
          </p>
          {j.payment.invoiceNumber ? (
            <p className="text-slate-600">Invoice {j.payment.invoiceNumber}</p>
          ) : (
            <p className="text-slate-600">
              {j.price.total > (j.payment.paidOnline ?? 0) ? `Collect ${formatINR(j.price.total - j.payment.paidOnline)} after the job.` : 'Nothing to collect for the booked work.'}
            </p>
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
