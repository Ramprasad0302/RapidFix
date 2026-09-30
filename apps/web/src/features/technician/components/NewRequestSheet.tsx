import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, IndianRupee, MapPin, Navigation, TriangleAlert } from 'lucide-react';
import type { TechnicianRequestDto } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Button } from '@fixora/ui';
import { ServiceArt } from '../../../components/ServiceArt';
import { technicianApi } from '../../../lib/endpoints';
import { formatSchedule } from '../../../lib/format';
import { toast } from '../../../store/toast';

/**
 * Incoming job offer. Arrives by socket (`booking_request`) with a 10 s poll as
 * fallback for weak networks; disappears when it expires or is answered.
 */
export function NewRequestSheet() {
  const requests = useQuery({ queryKey: ['tech', 'requests'], queryFn: technicianApi.requests, refetchInterval: 10_000 });
  const current = requests.data?.[0];
  if (!current) return null;
  return <RequestCard key={current.assignmentId} r={current} />;
}

function RequestCard({ r }: { r: TechnicianRequestDto }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const total = Math.max(1, new Date(r.expiresAt).getTime() - new Date(r.offeredAt).getTime());
  const left = Math.max(0, new Date(r.expiresAt).getTime() - now);
  const secs = Math.ceil(left / 1000);
  const expired = left <= 0;

  useEffect(() => {
    if (expired) void qc.invalidateQueries({ queryKey: ['tech'] });
  }, [expired, qc]);

  const act = useMutation({
    mutationFn: (action: 'ACCEPT' | 'REJECT') => technicianApi.act(r.bookingId, action),
    onSuccess: (_d, action) => {
      void qc.invalidateQueries({ queryKey: ['tech'] });
      if (action === 'ACCEPT') {
        toast('Job accepted');
        navigate(`/technician/jobs/${r.bookingId}`);
      } else toast('Request declined');
    },
    onError: (e) => {
      toast(e.message, 'error');
      void qc.invalidateQueries({ queryKey: ['tech'] });
    },
  });

  if (expired) return null;
  const radius = 26;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/55 backdrop-blur-[2px] lg:items-center" role="alertdialog" aria-labelledby="req-title" aria-describedby="req-body">
      <section className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 lg:rounded-[28px] pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-raised">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-fixora-blue">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fixora-blue opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-fixora-blue" />
              </span>
              NEW SERVICE REQUEST
            </p>
            <h2 id="req-title" className="mt-1 text-[22px] font-bold text-slate-900">
              {r.service.name}
            </h2>
          </div>
          <div className="relative size-16" aria-label={`${secs} seconds left`} role="timer">
            <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
              <circle cx="32" cy="32" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                stroke={secs <= 10 ? '#DC2626' : '#2563EB'}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - left / total)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-900 tabular-nums">
              {secs >= 120 ? `${Math.ceil(secs / 60)}m` : secs}
            </span>
          </div>
        </div>

        <div id="req-body" className="mt-4 flex gap-3.5 rounded-2xl bg-slate-50 p-3.5">
          <ServiceArt imageUrl={r.service.imageUrl} iconKey={r.service.iconKey} alt="" className="size-16 shrink-0 rounded-xl" artClassName="w-3/5" />
          <div className="min-w-0 flex-1 space-y-1 text-sm text-slate-700">
            <p className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0 text-fixora-blue" aria-hidden /> <span className="truncate">{r.area || r.locality}</span>
            </p>
            {r.distanceKm != null && (
              <p className="flex items-center gap-1.5">
                <Navigation className="size-4 shrink-0 text-fixora-blue" aria-hidden /> {r.distanceKm} km away
              </p>
            )}
            <p className="flex items-center gap-1.5">
              <Clock className="size-4 shrink-0 text-fixora-blue" aria-hidden />
              {r.scheduleType === 'NOW' ? 'Now · as soon as possible' : formatSchedule(r.scheduledFor, r.timeSlot, r.scheduleType)}
            </p>
          </div>
        </div>

        {r.description && (
          <p className="mt-3 line-clamp-3 rounded-xl border border-slate-100 px-3.5 py-2.5 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">Problem: </span>
            {r.description}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between rounded-xl bg-success-soft px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <IndianRupee className="size-4 text-success" aria-hidden /> Estimated earnings
          </span>
          <span className="text-xl font-bold text-success">{formatINR(r.estimatedEarning)}</span>
        </div>
        {r.isManual && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <TriangleAlert className="size-3.5" aria-hidden /> Assigned by RapidFix operations
          </p>
        )}

        <div className="mt-5 grid grid-cols-[1fr_1.6fr] gap-3">
          <Button
            variant="outline"
            size="lg"
            className="border-danger text-danger hover:bg-danger-soft"
            disabled={act.isPending}
            loading={act.isPending && act.variables === 'REJECT'}
            onClick={() => act.mutate('REJECT')}
          >
            Reject
          </Button>
          <Button size="lg" disabled={act.isPending} loading={act.isPending && act.variables === 'ACCEPT'} onClick={() => act.mutate('ACCEPT')} className="text-[16px]">
            Accept
          </Button>
        </div>
      </section>
    </div>
  );
}
