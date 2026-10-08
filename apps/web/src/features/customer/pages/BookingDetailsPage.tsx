import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CalendarDays, CircleX, Headset, Info, MapPin, MessageSquareText, Phone, Star, Truck, Wrench } from 'lucide-react';
import type { BookingDetailDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, Button, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { PageHeader } from '../../../components/PageHeader';
import { ProgressSteps } from '../../../components/ProgressSteps';
import { ServiceArt } from '../../../components/ServiceArt';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { StatusBadge } from '../../../components/StatusBadge';
import { TrackingMap } from '../../../components/TrackingMap';
import { mediaUrl } from '../../../lib/api';
import { customerApi } from '../../../lib/endpoints';
import { addressLines, formatSchedule } from '../../../lib/format';
import { useBookingRoom } from '../../../lib/socket';
import { toast } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';
import { AdditionalChargesCard, InvoiceLink, PaymentCard, ReportIssueButton, ReviewCard } from '../components/BookingExtras';
import { ScheduleFields, type ScheduleValue } from '../components/ScheduleFields';

const CANCEL_REASONS = ['Booked by mistake', 'Found another service', 'Change of plans', 'Price is too high', 'Technician is taking too long'];

export function BookingDetailsPage() {
  const { id = '' } = useParams();
  useBookingRoom(id);
  const booking = useQuery({
    queryKey: ['customer', 'booking', id],
    queryFn: () => customerApi.booking(id),
    // Live updates arrive over Socket.IO; this slow poll only covers dropped connections.
    refetchInterval: (q) =>
      q.state.data && ['PAYMENT_COMPLETED', 'CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'REFUNDED'].includes(q.state.data.status) ? false : 60_000,
  });

  return (
    <MobileShell>
      <PageHeader
        title="Booking Details"
        backTo="/bookings"
        right={
          <Link to="/help" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[15px] font-medium text-fixora-blue">
            <Headset className="size-5" /> Help
          </Link>
        }
      />
      {booking.isPending && <CenteredSpinner />}
      {booking.isError && !booking.data && <ErrorState error={booking.error} onRetry={() => void booking.refetch()} />}
      {booking.data && <Details b={booking.data} />}
    </MobileShell>
  );
}

function Details({ b }: { b: BookingDetailDto }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const navigate = useNavigate();
  const t = b.technician;
  const chatOpen = !!t && !cancelledStatus(b.status) && b.status !== 'PAYMENT_COMPLETED' && b.status !== 'REFUNDED';
  const enRoute = b.status === 'TECHNICIAN_EN_ROUTE';
  const cancelled = cancelledStatus(b.status);

  return (
    <main className="flex flex-col gap-4 px-4 pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8 lg:p-8">
      {/* Phones: one column in the order below. Laptops: details left, people/money/actions in a sticky sidebar. */}
      <div className="contents lg:flex lg:flex-col lg:gap-6">
        <div className="order-1 empty:hidden">
          <section className="flex gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-card">
            <ServiceArt
              imageUrl={b.service.imageUrl}
              slug={b.service.slug}
              iconKey={b.service.iconKey}
              alt={b.service.name}
              className="size-20 shrink-0 rounded-xl min-[380px]:size-24"
              artClassName="w-3/5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <h2 className="text-lg leading-snug font-semibold text-slate-900">{b.service.name}</h2>
                <StatusBadge status={b.status} className="shrink-0" />
              </div>
              <p className="text-sm text-slate-500">{b.code}</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-700">
                <CalendarDays className="size-4 text-fixora-blue" aria-hidden />
                {formatSchedule(b.scheduledFor, b.timeSlot, b.scheduleType)}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-700">
                <MapPin className="size-4 text-fixora-blue" aria-hidden />
                {b.locality}
              </p>
            </div>
          </section>
        </div>
        <div className="order-2 empty:hidden">
          {!cancelled && (
            <section className="px-1 py-2">
              <ProgressSteps steps={b.timeline} showTimes />
            </section>
          )}
        </div>
        <div className="order-3 empty:hidden">
          <StatusBanner b={b} />
        </div>
        <div className="order-8 empty:hidden">
          {(enRoute || b.status === 'TECHNICIAN_ARRIVED') && t && b.address.latitude != null && b.address.longitude != null && (
            <TrackingMap from={t.location} to={{ lat: b.address.latitude, lng: b.address.longitude }} etaMinutes={t.etaMinutes} distanceKm={t.distanceKm} />
          )}
        </div>
        <div className="order-9 empty:hidden">
          <section>
            <h3 className="text-lg font-semibold text-slate-900">Service Details</h3>
            <dl className="mt-3 flex flex-col gap-3 text-[15px]">
              <Row icon={<Wrench className="size-4.5" />} label="Service">
                {b.service.name}
              </Row>
              <Row icon={<Info className="size-4.5" />} label="Problem">
                {b.description || '—'}
              </Row>
              <Row icon={<MapPin className="size-4.5" />} label="Address">
                {addressLines(b.address)
                  .filter(Boolean)
                  .map((l) => (
                    <span key={l} className="block">
                      {l}
                    </span>
                  ))}
              </Row>
              <Row icon={<CalendarDays className="size-4.5" />} label="Date & Time">
                {formatSchedule(b.scheduledFor, b.timeSlot, b.scheduleType)}
              </Row>
            </dl>
            {b.photos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {b.photos.map((p) => (
                  <img key={p} src={mediaUrl(p)!} alt="Problem photo" className="size-16 rounded-lg object-cover" loading="lazy" />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="contents lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-5 lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-white lg:p-5 lg:shadow-card">
        <div className="order-4 empty:hidden">
          {t && (
            <section className="flex items-center gap-3">
              <Avatar name={t.name} src={t.avatarUrl} size={64} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-lg font-semibold text-slate-900">
                  <span>{t.name}</span>
                  {t.isVerified && <BadgeCheck className="size-5 shrink-0 fill-fixora-blue text-white" aria-label="Verified" />}
                </p>
                <p className="text-sm text-slate-500">{t.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-700">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  {t.ratingAvg.toFixed(1)} ({t.ratingCount} reviews)
                </p>
                {t.experienceYears > 0 && <p className="text-sm text-slate-500">{t.experienceYears}+ years experience</p>}
              </div>
              <div className="flex gap-2">
                <ContactButton href={t.phone ? `tel:${t.phone}` : undefined} icon={<Phone className="size-5 fill-current" />} label="Call" />
                <ContactButton
                  icon={<MessageSquareText className="size-5" />}
                  label="Chat"
                  onClick={chatOpen ? () => navigate(`/bookings/${b.id}/chat`) : undefined}
                />
              </div>
            </section>
          )}
        </div>
        <div className="order-5 empty:hidden">
          <AdditionalChargesCard b={b} />
        </div>
        <div className="order-6 empty:hidden">
          <PaymentCard b={b} />
        </div>
        <div className="order-7 empty:hidden">
          <ReviewCard b={b} />
        </div>
        <div className="order-10 empty:hidden">
          <section className="border-t border-slate-100 pt-4">
            <h3 className="text-lg font-semibold text-slate-900">Price Estimate</h3>
            <dl className="mt-3 flex flex-col gap-2 text-[15px] text-slate-700">
              <PriceRow label="Service Charge" value={b.price.serviceCharge} />
              {b.price.visitCharge > 0 && <PriceRow label="Visit Charge" value={b.price.visitCharge} />}
              {b.price.additionalCharges > 0 && <PriceRow label="Additional Work" value={b.price.additionalCharges} />}
              {b.sparePartItems.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <PriceRow label="Spare parts" value={b.price.spareParts} />
                  <ul className="flex flex-col gap-1.5 border-l-2 border-slate-100 pl-3 text-sm text-slate-500">
                    {b.sparePartItems.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          {p.name} · {p.quantity} × {formatINR(p.unitPrice)}
                          {p.billPhotoUrl && (
                            <a href={mediaUrl(p.billPhotoUrl)!} target="_blank" rel="noopener noreferrer" className="ml-1.5 font-medium text-fixora-blue">
                              View bill
                            </a>
                          )}
                        </span>
                        <span>{formatINR(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {b.price.discount > 0 && (
                <PriceRow label={`Discount${b.couponCode ? ` (${b.couponCode})` : ''}`} value={-b.price.discount} className="text-success" />
              )}
              {b.price.tax > 0 && <PriceRow label="Taxes (GST)" value={b.price.tax} />}
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-3 text-lg font-bold text-slate-900">
                <dt>{b.status === 'PAYMENT_COMPLETED' ? 'Total Paid' : 'Estimated Total'}</dt>
                <dd>{formatINR(b.price.total)}</dd>
              </div>
            </dl>
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-fixora-blue-soft px-3.5 py-3 text-sm text-slate-700">
              <Info className="size-4.5 shrink-0 fill-fixora-blue text-white" aria-hidden />
              Final price may vary based on actual work required.
            </p>
          </section>
        </div>
        <div className="order-11 empty:hidden">
          {(b.canReschedule || b.canCancel) && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                size="lg"
                disabled={!b.canReschedule}
                onClick={() => setRescheduleOpen(true)}
                leftIcon={<CalendarDays className="size-5" />}
                className="border-slate-200 bg-slate-50"
              >
                Reschedule
              </Button>
              <Button
                variant="outline"
                size="lg"
                disabled={!b.canCancel}
                onClick={() => setCancelOpen(true)}
                leftIcon={<CircleX className="size-5" />}
                className="border-danger text-danger hover:bg-danger-soft"
              >
                Cancel Booking
              </Button>
            </div>
          )}
        </div>
        {b.cancellationReason && cancelled && (
          <div className="order-12">
            <Alert tone="info">Cancelled: {b.cancellationReason}</Alert>
          </div>
        )}
        <div className="order-13 empty:hidden">
          <InvoiceLink b={b} />
        </div>
        {b.status !== 'PENDING' && (
          <div className="order-14">
            <ReportIssueButton bookingId={b.id} />
          </div>
        )}
      </div>

      <CancelDialog booking={b} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <RescheduleDialog booking={b} open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} />
    </main>
  );
}

const cancelledStatus = (s: string) => ['CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW'].includes(s);

function StatusBanner({ b }: { b: BookingDetailDto }) {
  const t = b.technician;
  const copy: Partial<Record<BookingDetailDto['status'], { title: string; body: string }>> = {
    SEARCHING: { title: 'Finding the right professional', body: 'We’ll notify you as soon as a verified technician accepts.' },
    TECHNICIAN_ASSIGNED: { title: 'Technician assigned', body: `${t?.name ?? 'Your technician'} will confirm shortly.` },
    TECHNICIAN_ACCEPTED: { title: 'Your booking is confirmed', body: `${t?.name ?? 'Your technician'} will arrive in your selected slot.` },
    TECHNICIAN_EN_ROUTE: {
      title: 'Your technician is on the way!',
      body: `${t?.name ?? 'Your technician'} is heading to your location.${t?.etaMinutes ? ` Estimated arrival: ${t.etaMinutes} minutes.` : ''}`,
    },
    TECHNICIAN_ARRIVED: { title: 'Your technician has arrived', body: 'Please share the problem details with them.' },
    SERVICE_STARTED: { title: 'Service in progress', body: 'Any extra work will need your approval first.' },
    ADDITIONAL_CHARGE_APPROVED: { title: 'Service in progress', body: 'Extra work approved — your bill has been updated.' },
    PAYMENT_PENDING: { title: 'Service completed', body: 'Please complete the payment to close the booking.' },
    DISPUTED: { title: 'Under review', body: 'Our support team is looking into this booking and will contact you.' },
    REFUNDED: { title: 'Refunded', body: 'Your refund has been processed to the original payment method.' },
    PAYMENT_COMPLETED: { title: 'All done!', body: 'Thank you for choosing RapidFix.' },
  };
  const c = copy[b.status];
  if (!c) return null;
  return (
    <section className="flex gap-3.5 rounded-2xl bg-fixora-blue-soft p-4">
      <Truck className="mt-0.5 size-7 shrink-0 text-fixora-blue" aria-hidden />
      <div>
        <p className="font-semibold text-slate-900">{c.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{c.body}</p>
      </div>
    </section>
  );
}

function ContactButton({ href, icon, label, onClick }: { href?: string; icon: ReactNode; label: string; onClick?: () => void }) {
  const cls = 'flex size-12 items-center justify-center rounded-xl bg-fixora-blue-soft text-fixora-blue min-[380px]:size-14';
  return (
    <span className="flex flex-col items-center gap-1 text-xs text-slate-700">
      {href ? (
        <a href={href} className={cls} aria-label={`${label} technician`}>
          {icon}
        </a>
      ) : (
        <button onClick={onClick} disabled={!onClick} className={cx(cls, !onClick && 'opacity-40')} aria-label={`${label} technician`}>
          {icon}
        </button>
      )}
      {label}
    </span>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_6.5rem_1fr] items-start gap-1">
      <span className="mt-0.5 text-fixora-blue">{icon}</span>
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}

function PriceRow({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={cx('flex justify-between', className)}>
      <dt>{label}</dt>
      <dd>{value < 0 ? `− ${formatINR(-value)}` : formatINR(value)}</dd>
    </div>
  );
}

function useBookingMutation(b: BookingDetailDto) {
  const qc = useQueryClient();
  return (data: BookingDetailDto) => {
    qc.setQueryData(['customer', 'booking', b.id], data);
    void qc.invalidateQueries({ queryKey: ['customer', 'bookings'] });
  };
}

function CancelDialog({ booking, open, onClose }: { booking: BookingDetailDto; open: boolean; onClose(): void }) {
  const [reason, setReason] = useState(CANCEL_REASONS[2]!);
  const onDone = useBookingMutation(booking);
  const cancel = useMutation({
    mutationFn: () => customerApi.cancelBooking(booking.id, reason),
    onSuccess: (d) => {
      onDone(d);
      onClose();
      toast('Booking cancelled');
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cancel this booking?"
      footer={
        <Button variant="danger" size="lg" fullWidth loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Yes, cancel booking
        </Button>
      }
    >
      <p className="text-sm text-slate-600">Tell us why — it helps us improve.</p>
      <div className="mt-3 flex flex-col gap-2" role="radiogroup">
        {CANCEL_REASONS.map((r) => (
          <label
            key={r}
            className={cx(
              'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[15px]',
              reason === r ? 'border-fixora-blue bg-fixora-blue-soft' : 'border-slate-200',
            )}
          >
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-fixora-blue" />
            {r}
          </label>
        ))}
      </div>
      {cancel.isError && <Alert className="mt-3">{cancel.error.message}</Alert>}
    </Dialog>
  );
}

function RescheduleDialog({ booking, open, onClose }: { booking: BookingDetailDto; open: boolean; onClose(): void }) {
  const [value, setValue] = useState<ScheduleValue>({ scheduleType: 'SCHEDULED', date: null, timeSlot: null });
  const onDone = useBookingMutation(booking);
  const save = useMutation({
    mutationFn: () =>
      customerApi.rescheduleBooking(booking.id, {
        scheduleType: value.scheduleType,
        date: value.date ?? undefined,
        timeSlot: value.timeSlot ?? undefined,
      }),
    onSuccess: (d) => {
      onDone(d);
      onClose();
      toast('Booking rescheduled');
    },
  });
  const ready = value.scheduleType === 'NOW' || (!!value.date && !!value.timeSlot);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reschedule booking"
      footer={
        <Button size="lg" fullWidth disabled={!ready} loading={save.isPending} onClick={() => save.mutate()}>
          Confirm new time
        </Button>
      }
    >
      <ScheduleFields value={value} onChange={setValue} />
      {save.isError && <Alert className="mt-3">{save.error.message}</Alert>}
    </Dialog>
  );
}
