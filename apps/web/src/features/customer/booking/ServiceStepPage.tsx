import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, CircleX, Clock, ShieldCheck } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { Button } from '@fixora/ui';
import { ServiceArt } from '../../../components/ServiceArt';
import { CenteredSpinner, ErrorState } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { durationRange } from '../../../lib/format';
import { useBookingDraft } from '../../../store/bookingDraft';
import { BookingShell } from './BookingShell';

/** Step 1 — service details: price, duration, what's included / not included, warranty. */
export function ServiceStepPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const start = useBookingDraft((s) => s.start);
  const service = useQuery({ queryKey: ['service', slug], queryFn: () => catalogApi.service(slug) });
  const s = service.data;

  return (
    <BookingShell
      step={1}
      requireService={false}
      backTo={s ? `/book/c/${s.category.slug}` : '/book'}
      action={
        <Button
          size="lg"
          fullWidth
          disabled={!s}
          onClick={() => {
            if (!s) return;
            start({ id: s.id, slug: s.slug, categorySlug: s.category.slug }, params.get('coupon'));
            navigate('/book/details');
          }}
        >
          Continue <ArrowRight className="size-4.5" aria-hidden />
        </Button>
      }
    >
      {service.isPending && <CenteredSpinner />}
      {service.isError && !service.data && <ErrorState error={service.error} onRetry={() => void service.refetch()} />}
      {s && (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-6">
          <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt={s.name} className="h-44 w-full rounded-2xl lg:row-span-4 lg:h-full lg:min-h-[340px] lg:rounded-3xl" artClassName="h-3/5 w-auto lg:h-2/5" />
          <div>
            <h1 className="text-[24px] font-bold text-slate-900 lg:text-4xl">{s.name}</h1>
            <p className="mt-0.5 text-[15px] text-slate-500">{s.tagline || s.description}</p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[20px] font-bold text-fixora-blue lg:text-3xl">From {formatINR(s.basePrice)}</p>
              <p className="flex items-center gap-1.5 text-sm text-slate-700">
                <Clock className="size-4" aria-hidden /> {durationRange(s.durationMinMinutes, s.durationMaxMinutes)}
              </p>
            </div>
            {s.visitCharge > 0 && <p className="mt-1 text-sm text-slate-500">+ {formatINR(s.visitCharge)} visit charge</p>}
          </div>

          <ul className="flex flex-col gap-2.5 rounded-2xl bg-[#F3F7FD] p-4">
            {s.inclusions.map((i) => (
              <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-800">
                <CircleCheck className="mt-0.5 size-5 shrink-0 fill-success text-white" aria-hidden />
                {i}
              </li>
            ))}
          </ul>

          {s.exclusions.length > 0 && (
            <section>
              <h2 className="font-semibold text-slate-900">What’s not included</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {s.exclusions.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[15px] text-slate-700">
                    <CircleX className="mt-0.5 size-5 shrink-0 fill-danger-soft text-danger" aria-hidden />
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {s.warrantyDays > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success">
              <ShieldCheck className="size-5" aria-hidden /> {s.warrantyDays}-day service warranty
            </p>
          )}
        </div>
      )}
    </BookingShell>
  );
}
