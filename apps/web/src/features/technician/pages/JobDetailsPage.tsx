import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, FileText, Info, MapPin, MessageSquareText, Navigation, NotebookPen, Phone, Wrench } from 'lucide-react';
import type { TechnicianJobAction, TechnicianJobDetailDto } from '@fixora/shared-types';
import { formatINR, formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { PageHeader } from '../../../components/PageHeader';
import { PinMap } from '../../../components/PinMap';
import { ProgressSteps } from '../../../components/ProgressSteps';
import { ServiceArt } from '../../../components/ServiceArt';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { StatusBadge } from '../../../components/StatusBadge';
import { mediaUrl } from '../../../lib/api';
import { technicianApi } from '../../../lib/endpoints';
import { addressLines, formatSchedule } from '../../../lib/format';
import { useBookingRoom } from '../../../lib/socket';
import { useScreenWakeLock } from '../../../lib/wakeLock';
import { requestCurrentPosition } from '../../../store/location';
import { toast } from '../../../store/toast';
import { MobileShell } from '../../customer/CustomerTabsLayout';
import { CollectPaymentCard, ExtraWorkSection } from '../components/JobExtras';

const ACTION_LABEL: Record<TechnicianJobAction, string> = {
  ACCEPT: 'Accept Job',
  REJECT: 'Reject',
  EN_ROUTE: 'Start Travel',
  ARRIVED: 'Mark Arrived',
  START: 'Start Service',
  COMPLETE: 'Complete Service',
};

export function JobDetailsPage() {
  const { id = '' } = useParams();
  useBookingRoom(id);
  const job = useQuery({ queryKey: ['tech', 'job', id], queryFn: () => technicianApi.job(id) });
  return (
    <MobileShell>
      <PageHeader title="Booking Details" backTo="/technician/bookings" />
      {job.isPending && <CenteredSpinner />}
      {job.isError && <ErrorState error={job.error} onRetry={() => void job.refetch()} />}
      {job.data && <Details key={job.data.id} j={job.data} />}
    </MobileShell>
  );
}

function Details({ j }: { j: TechnicianJobDetailDto }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notes, setNotes] = useState(j.technicianNotes ?? '');
  const [confirmReject, setConfirmReject] = useState(false);
  // Travelling: keep the screen on so GPS keeps flowing to the customer's live map.
  const travelling = j.status === 'TECHNICIAN_EN_ROUTE';
  useScreenWakeLock(travelling);

  const act = useMutation({
    mutationFn: async (action: TechnicianJobAction) => {
      // Starting the trip: send where we are now, so the customer sees us on the live map at once.
      const position =
        action === 'EN_ROUTE'
          ? await requestCurrentPosition({ maxWaitMs: 6000, goodEnoughM: 50 })
              .then((p) => ({ lat: p.latitude, lng: p.longitude }))
              .catch(() => undefined)
          : undefined;
      return technicianApi.act(j.id, action, undefined, position);
    },
    onSuccess: (updated, action) => {
      void qc.invalidateQueries({ queryKey: ['tech'] });
      if (action === 'REJECT' || !updated) {
        toast('Job rejected');
        navigate('/technician/bookings', { replace: true });
        return;
      }
      qc.setQueryData(['tech', 'job', j.id], updated);
      toast(`${ACTION_LABEL[action]} ✓`);
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const saveNotes = useMutation({
    mutationFn: () => technicianApi.saveNotes(j.id, notes),
    onSuccess: (updated) => {
      qc.setQueryData(['tech', 'job', j.id], updated);
      toast('Notes saved');
    },
  });

  const primary = j.actions.find((a) => a !== 'REJECT');
  const chatOpen = !!j.customerPhone && !['PAYMENT_COMPLETED', 'REFUNDED', 'CUSTOMER_CANCELLED', 'ADMIN_CANCELLED', 'TECHNICIAN_CANCELLED'].includes(j.status);
  const directions =
    j.latitude != null && j.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${j.latitude},${j.longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLines(j.address).join(', '))}`;

  return (
    <main className="flex flex-col gap-4 px-4 pb-8">
      <section className="flex gap-3.5 rounded-2xl border border-slate-100 p-3.5 shadow-card">
        <ServiceArt imageUrl={j.service.imageUrl} slug={j.service.slug} iconKey={j.service.iconKey} alt="" className="size-20 shrink-0 rounded-xl" artClassName="w-3/5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <h2 className="text-lg leading-snug font-semibold text-slate-900">{j.service.name}</h2>
            <StatusBadge status={j.status} audience="staff" />
          </div>
          <p className="text-sm text-slate-500">{j.code}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-700">
            <CalendarDays className="size-4 text-fixora-blue" aria-hidden /> {formatSchedule(j.scheduledFor, j.timeSlot, j.scheduleType)}
          </p>
          <div className="mt-0.5 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[13px] text-slate-700">
              <MapPin className="size-4 text-fixora-blue" aria-hidden /> {j.locality}
            </p>
            <p className="text-lg font-bold text-slate-900">{formatINR(j.totalAmount)}</p>
          </div>
        </div>
      </section>

      {travelling && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-fixora-blue-soft px-3.5 py-2.5 text-sm text-fixora-blue">
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fixora-blue opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-fixora-blue" />
          </span>
          Live location on — the customer is tracking you. Keep RapidFix open while you travel.
        </p>
      )}

      <section className="py-1">
        <ProgressSteps steps={j.timeline} showTimes />
      </section>

      <section className="flex items-center gap-3.5 rounded-2xl border border-slate-100 p-3.5 shadow-card">
        <Avatar name={j.customerName} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-snug font-semibold text-slate-900">{j.customerName}</p>
          <p className="text-sm whitespace-nowrap text-slate-500">{j.customerPhone ? formatIndianPhone(j.customerPhone) : j.actions.includes('ACCEPT') ? 'Shown after you accept' : 'Hidden after the job closes'}</p>
        </div>
        <IconAction href={j.customerPhone ? `tel:${j.customerPhone}` : undefined} label="Call customer" icon={<Phone className="size-5 fill-current" />} />
        <IconAction label="Chat" icon={<MessageSquareText className="size-5" />} onClick={chatOpen ? () => navigate(`/technician/jobs/${j.id}/chat`) : undefined} />
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3.5 shadow-card">
        <MapPin className="mt-0.5 size-5 shrink-0 text-fixora-blue" aria-hidden />
        <div className="min-w-0 flex-1 text-sm text-slate-700">
          <p className="text-[15px] font-semibold text-slate-900">Service Address</p>
          {addressLines(j.address).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <a href={directions} target="_blank" rel="noopener noreferrer" aria-label="Navigate with Google Maps" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
          <Navigation className="size-5 fill-current" />
        </a>
      </section>
      {/* The customer's exact pin — shown once the job is yours. */}
      {j.latitude != null && j.longitude != null && !j.actions.includes('ACCEPT') && <PinMap lat={j.latitude} lng={j.longitude} label={`${j.customerName}'s location`} />}

      <section>
        <h3 className="text-lg font-semibold text-slate-900">Service Details</h3>
        <dl className="mt-2 flex flex-col gap-2.5 text-[15px]">
          <Row icon={<Wrench className="size-4.5" />} label="Service">
            {j.service.name}
          </Row>
          <Row icon={<Info className="size-4.5" />} label="Problem">
            {j.description || '—'}
          </Row>
          {j.technicianNotes && (
            <Row icon={<FileText className="size-4.5" />} label="Notes">
              {j.technicianNotes}
            </Row>
          )}
        </dl>
        {j.photos.length > 0 && (
          <div className="mt-3 flex gap-2">
            {j.photos.map((p) => (
              <a key={p} href={mediaUrl(p)!} target="_blank" rel="noopener noreferrer">
                <img src={mediaUrl(p)!} alt="Problem photo" className="size-16 rounded-lg object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        )}
      </section>

      <ExtraWorkSection j={j} />
      <CollectPaymentCard j={j} />

      <section>
        <label htmlFor="notes" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <NotebookPen className="size-5 text-fixora-blue" aria-hidden /> Customer Notes <span className="text-sm font-normal text-slate-500">(Optional)</span>
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          onBlur={() => notes !== (j.technicianNotes ?? '') && saveNotes.mutate()}
          placeholder="Add notes about this service..."
          className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-[15px] outline-none focus:border-fixora-blue"
        />
        <p className="text-right text-xs text-slate-400">{notes.length}/500</p>
      </section>

      {act.isError && <Alert>{act.error.message}</Alert>}

      {j.actions.includes('REJECT') ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" className="border-danger text-danger hover:bg-danger-soft" onClick={() => setConfirmReject(true)}>
            Reject
          </Button>
          <Button size="lg" loading={act.isPending && act.variables === 'ACCEPT'} onClick={() => act.mutate('ACCEPT')}>
            Accept Job
          </Button>
        </div>
      ) : primary ? (
        <Button size="lg" fullWidth loading={act.isPending} onClick={() => act.mutate(primary)} className="h-14 text-[16px]">
          {ACTION_LABEL[primary]} <ArrowRight className="size-5" aria-hidden />
        </Button>
      ) : null}

      <Dialog
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Reject this job?"
        footer={
          <Button variant="danger" size="lg" fullWidth loading={act.isPending} onClick={() => act.mutate('REJECT')}>
            Yes, reject
          </Button>
        }
      >
        <p className="text-[15px] text-slate-600">The job will be offered to another professional.</p>
      </Dialog>
    </main>
  );
}

function IconAction({ href, label, icon, onClick }: { href?: string; label: string; icon: ReactNode; onClick?: () => void }) {
  const cls = 'flex size-11 items-center justify-center rounded-xl bg-fixora-blue-soft text-fixora-blue';
  return href ? (
    <a href={href} aria-label={label} className={cls}>
      {icon}
    </a>
  ) : (
    <button onClick={onClick} disabled={!onClick} aria-label={label} className={`${cls} disabled:opacity-40`}>
      {icon}
    </button>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_5rem_1fr] items-start gap-1">
      <span className="mt-0.5 text-fixora-blue">{icon}</span>
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}
