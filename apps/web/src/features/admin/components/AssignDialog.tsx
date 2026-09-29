import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Star } from 'lucide-react';
import { Alert, Button, cx } from '@fixora/ui';
import { Avatar } from '../../../components/Avatar';
import { Dialog } from '../../../components/Dialog';
import { Skeleton } from '../../../components/States';
import { adminApi } from '../../../lib/endpoints';
import { toast } from '../../../store/toast';

/** Manual (re)assignment: candidates ranked by the same engine the auto-dispatcher uses. */
export function AssignDialog({ booking, onClose }: { booking: { id: string; code: string; service: string } | null; onClose(): void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const candidates = useQuery({
    queryKey: ['admin', 'candidates', booking?.id],
    queryFn: () => adminApi.candidates(booking!.id),
    enabled: !!booking,
  });
  const assign = useMutation({
    mutationFn: () => adminApi.assign(booking!.id, picked!),
    onSuccess: () => {
      toast('Technician assigned — waiting for them to accept');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      setPicked(null);
      onClose();
    },
  });

  return (
    <Dialog
      variant="center"
      open={!!booking}
      onClose={() => {
        setPicked(null);
        assign.reset();
        onClose();
      }}
      title={booking ? `Assign ${booking.service} · ${booking.code}` : 'Assign'}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">They get 15 minutes to accept. Ranking: skill, distance, rating, workload.</p>
          <Button disabled={!picked} loading={assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </div>
      }
    >
      {candidates.isPending && <Skeleton className="h-48" />}
      {candidates.isError && <Alert>{candidates.error.message}</Alert>}
      {candidates.data?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No verified technician has this skill yet.</p>}
      <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Technicians">
        {candidates.data?.map((c) => (
          <li key={c.technicianId}>
            <button
              role="radio"
              aria-checked={picked === c.technicianId}
              onClick={() => setPicked(c.technicianId)}
              className={cx(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                picked === c.technicianId ? 'border-fixora-blue bg-fixora-blue-soft' : 'border-slate-200 hover:border-fixora-blue/40',
              )}
            >
              <Avatar name={c.name} src={c.avatarUrl} size={40} online={c.isOnline} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-900">{c.name}</span>
                  {c.eligible ? (
                    <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">Best match</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">{c.reason}</span>
                  )}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                  <span>{c.title}</span>
                  {c.distanceKm != null && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="size-3" /> {c.distanceKm} km
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Star className="size-3 fill-amber-400 text-amber-400" /> {c.ratingAvg.toFixed(1)}
                  </span>
                  <span>{c.activeJobs} active</span>
                  <span>score {c.score.toFixed(2)}</span>
                </span>
              </span>
              {picked === c.technicianId && <Check className="size-5 text-fixora-blue" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      {assign.isError && <Alert className="mt-3">{assign.error.message}</Alert>}
    </Dialog>
  );
}
