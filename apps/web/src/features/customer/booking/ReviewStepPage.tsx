import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Banknote, CalendarDays, CreditCard, FileText, Info, MapPin, Smartphone, TicketPercent, X } from 'lucide-react';
import type { PaymentMethod } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { ServiceArt } from '../../../components/ServiceArt';
import { Skeleton } from '../../../components/States';
import { catalogApi, customerApi, uploadApi, type ServiceAreaCheckDto } from '../../../lib/endpoints';
import { addressLines, durationRange, formatDate, slotRange } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { useBookingDraft } from '../../../store/bookingDraft';
import { NotServedSheet } from '../../../components/NotServedSheet';
import { BookingShell, StepTitle } from './BookingShell';

const PAYMENT: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'RAZORPAY', label: 'Online', icon: CreditCard },
];

/** Step 5 — review, coupon, payment preference, server-side estimate; login happens here if needed. */
export function ReviewStepPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const authed = useAuth((s) => s.status === 'authenticated');
  const draft = useBookingDraft();
  const [couponInput, setCouponInput] = useState(draft.couponCode ?? '');
  const [progress, setProgress] = useState<string | null>(null);

  const service = useQuery({ queryKey: ['service', draft.serviceSlug], queryFn: () => catalogApi.service(draft.serviceSlug!), enabled: !!draft.serviceSlug });
  const saved = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: authed && !!draft.addressId });
  const estimate = useQuery({
    queryKey: ['estimate', draft.serviceId, draft.couponCode, authed],
    queryFn: () => catalogApi.estimate(draft.serviceId!, draft.couponCode ?? undefined),
    enabled: !!draft.serviceId,
  });
  const est = estimate.data;

  const updateDraft = draft.update;
  const estimatedTotal = est?.total;
  useEffect(() => {
    if (estimatedTotal != null) updateDraft({ estimatedTotal });
  }, [estimatedTotal, updateDraft]);

  const address = draft.addressId ? saved.data?.find((a) => a.id === draft.addressId) : draft.address;
  const previews = useMemo(() => draft.photoFiles.map((f) => URL.createObjectURL(f)), [draft.photoFiles]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const [dismissedArea, setDismissedArea] = useState(false);
  const confirm = useMutation({
    mutationFn: async () => {
      setDismissedArea(false);
      const photos: string[] = [];
      for (const [i, file] of draft.photoFiles.entries()) {
        setProgress(`Uploading photo ${i + 1} of ${draft.photoFiles.length}…`);
        photos.push((await uploadApi.upload(file, 'image')).path);
      }
      let videoUrl: string | null = null;
      if (draft.videoFile) {
        setProgress('Uploading video…');
        videoUrl = (await uploadApi.upload(draft.videoFile)).path;
      }
      setProgress('Confirming booking…');
      return customerApi.createBooking({
        serviceId: draft.serviceId!,
        description: draft.description,
        photos,
        videoUrl,
        ...(draft.addressId ? { addressId: draft.addressId } : { address: draft.address! }),
        saveAddress: draft.saveAddress,
        scheduleType: draft.scheduleType,
        ...(draft.scheduleType === 'SCHEDULED' ? { date: draft.date!, timeSlot: draft.timeSlot! } : draft.timeSlot ? { timeSlot: draft.timeSlot } : {}),
        couponCode: est?.coupon?.valid ? draft.couponCode! : undefined,
        paymentMethod: draft.paymentMethod,
      });
    },
    onSuccess: (booking) => {
      // The confirmation page clears the draft; clearing here would trip this step's guard first.
      void qc.invalidateQueries({ queryKey: ['customer'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      navigate(`/book/confirmed/${booking.id}`, { replace: true });
    },
    onSettled: () => setProgress(null),
  });

  // Outside the service area → "not here yet, I'm interested" instead of a plain error.
  const err = confirm.error as (Error & { code?: string; details?: unknown }) | null;
  const outOfArea = err?.code === 'OUT_OF_SERVICE_AREA' ? ((err.details as ServiceAreaCheckDto | undefined) ?? { served: false, town: null, distanceKm: null, areas: [] }) : null;

  if (!draft.address && !draft.addressId) return <Navigate to="/book/address" replace />;
  if (draft.scheduleType === 'SCHEDULED' && (!draft.date || !draft.timeSlot)) return <Navigate to="/book/schedule" replace />;

  const s = service.data;
  const when =
    draft.scheduleType === 'NOW'
      ? ['Book Now', draft.timeSlot ? `Preferred: ${slotRange(draft.timeSlot)}` : 'Earliest available professional']
      : [formatDate(`${draft.date}T12:00:00+05:30`), slotRange(draft.timeSlot!) ?? ''];

  return (
    <BookingShell
      step={5}
      backTo="/book/schedule"
      action={
        authed ? (
          <Button size="lg" fullWidth loading={confirm.isPending} onClick={() => confirm.mutate()} disabled={!est}>
            {progress ?? 'Confirm Booking'} {!progress && <ArrowRight className="size-4.5" aria-hidden />}
          </Button>
        ) : (
          // Guest: log in first. The draft (and photos) are kept, and login returns here.
          <Button size="lg" fullWidth onClick={() => navigate('/login?redirect=/book/review')}>
            Continue to Booking <ArrowRight className="size-4.5" aria-hidden />
          </Button>
        )
      }
    >
      <StepTitle title="Review Your Booking" subtitle="Please check the details before continuing" />

      <section className="flex items-center gap-3.5 rounded-2xl border border-slate-100 p-3 shadow-card">
        {s ? (
          <>
            <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt="" className="h-16 w-20 shrink-0 rounded-xl" artClassName="h-3/4 w-auto" />
            <div>
              <p className="text-[17px] font-semibold text-slate-900">{s.name}</p>
              <p className="text-sm text-slate-600">From {formatINR(s.basePrice)}</p>
              <p className="text-xs text-slate-500">{durationRange(s.durationMinMinutes, s.durationMaxMinutes)}</p>
            </div>
          </>
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </section>

      <div className="mt-5 flex flex-col gap-5">
        <ReviewRow icon={<FileText className="size-5" />} title="Problem Description" edit="/book/details">
          <p>{draft.description || 'No description added'}</p>
          {previews.length > 0 && (
            <div className="mt-2 flex gap-2">
              {previews.map((src) => (
                <img key={src} src={src} alt="" className="h-12 w-16 rounded-lg object-cover" />
              ))}
            </div>
          )}
          {draft.videoFile && <p className="mt-1 text-xs text-slate-500">🎬 {draft.videoFile.name}</p>}
        </ReviewRow>
        <ReviewRow icon={<MapPin className="size-5" />} title="Service Address" edit="/book/address">
          {address ? addressLines(address).map((l) => <p key={l}>{l}</p>) : <Skeleton className="h-10" />}
        </ReviewRow>
        <ReviewRow icon={<CalendarDays className="size-5" />} title="Date & Time" edit="/book/schedule">
          {when.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </ReviewRow>
      </div>

      {/* Coupon */}
      <section className="mt-6">
        <h2 className="text-[17px] font-semibold text-slate-900">Offers</h2>
        {draft.couponCode && est?.coupon ? (
          <div className={cx('mt-2 flex items-center gap-3 rounded-xl border px-3.5 py-3', est.coupon.valid ? 'border-success/30 bg-success-soft' : 'border-danger/30 bg-danger-soft')}>
            <TicketPercent className={cx('size-5', est.coupon.valid ? 'text-success' : 'text-danger')} aria-hidden />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-slate-900">{est.coupon.code}</p>
              <p className={est.coupon.valid ? 'text-success' : 'text-danger'}>{est.coupon.valid ? `You save ${formatINR(est.discount)}` : est.coupon.message}</p>
            </div>
            <button onClick={() => (draft.update({ couponCode: null }), setCouponInput(''))} aria-label="Remove coupon" className="rounded-full p-1 text-slate-500">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (couponInput.trim()) draft.update({ couponCode: couponInput.trim().toUpperCase() });
            }}
          >
            <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Enter coupon code" aria-label="Coupon code" className="field h-11 flex-1 uppercase" />
            <Button type="submit" variant="outline" className="h-11">
              Apply
            </Button>
          </form>
        )}
        <Link to="/offers" className="mt-1.5 inline-block text-sm font-medium text-fixora-blue">
          View all offers
        </Link>
      </section>

      {/* Payment preference — payment itself happens after the service. */}
      <section className="mt-5">
        <h2 className="text-[17px] font-semibold text-slate-900">Pay after service</h2>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
          {PAYMENT.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="radio"
              aria-checked={draft.paymentMethod === value}
              onClick={() => draft.update({ paymentMethod: value })}
              className={cx(
                'flex h-12 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium',
                draft.paymentMethod === value ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : 'border-slate-200 text-slate-700',
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* Price estimate — always computed on the server. */}
      <section className="mt-6">
        <h2 className="text-[17px] font-semibold text-slate-900">Price Estimate</h2>
        {estimate.isPending && <Skeleton className="mt-2 h-28" />}
        {estimate.isError && <Alert className="mt-2">{estimate.error.message}</Alert>}
        {est && (
          <dl className="mt-2 flex flex-col gap-1.5 text-[15px] text-slate-700">
            <Line label="Service Charge" value={formatINR(est.serviceCharge)} />
            {est.visitCharge > 0 && <Line label="Visit Charge" value={formatINR(est.visitCharge)} />}
            {est.discount > 0 && <Line label="Discount" value={`− ${formatINR(est.discount)}`} className="text-success" />}
            {est.tax > 0 && <Line label={`Taxes (GST ${est.taxPercent}%)`} value={formatINR(est.tax)} />}
            <div className="mt-1 flex justify-between border-t border-slate-100 pt-2.5 text-[17px] font-bold text-slate-900">
              <dt>Estimated Total</dt>
              <dd>{formatINR(est.total)}</dd>
            </div>
          </dl>
        )}
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-fixora-blue-soft px-3.5 py-2.5 text-[13px] text-slate-700">
          <Info className="size-4 shrink-0 fill-fixora-blue text-white" aria-hidden /> Final price may vary based on actual work required.
        </p>
      </section>

      {confirm.isError && !outOfArea && <Alert className="mt-4">{confirm.error.message}</Alert>}
      <NotServedSheet
        open={!!outOfArea && !dismissedArea}
        onClose={() => setDismissedArea(true)}
        check={outOfArea}
        place={address?.villageTown}
        point={address?.latitude != null && address.longitude != null ? { lat: address.latitude, lng: address.longitude } : null}
      />
    </BookingShell>
  );
}

function ReviewRow({ icon, title, edit, children }: { icon: ReactNode; title: string; edit: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 text-slate-700">{icon}</span>
      <div className="min-w-0 flex-1 text-sm text-slate-600">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <Link to={edit} className="text-sm font-medium text-fixora-blue">
            Edit
          </Link>
        </div>
        {children}
      </div>
    </section>
  );
}

function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cx('flex justify-between', className)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
