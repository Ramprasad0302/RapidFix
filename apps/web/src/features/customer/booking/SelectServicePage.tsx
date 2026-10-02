import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { ServiceArt } from '../../../components/ServiceArt';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { durationRange } from '../../../lib/format';
import { useCategories } from '../queries';
import { BookingShell, StepTitle } from './BookingShell';

/** Services inside one category. */
export function SelectServicePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const coupon = params.get('coupon');
  const category = useCategories().data?.find((c) => c.slug === slug);
  const services = useQuery({ queryKey: ['services', 'category', slug], queryFn: () => catalogApi.services({ category: slug }) });

  return (
    <BookingShell requireService={false} backTo="/book">
      <StepTitle title={category?.name ?? 'Choose a service'} subtitle={category?.tagline ?? 'Pick what you need'} />
      {services.isError && !services.data && <ErrorState error={services.error} onRetry={() => void services.refetch()} />}
      {services.isSuccess && services.data.length === 0 && <EmptyState title="No services here yet" body="We’re adding professionals in this category soon." />}
      <ul className="flex flex-col gap-3">
        {services.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        {services.data?.map((s) => (
          <li key={s.id}>
            <Link to={`/book/s/${s.slug}${coupon ? `?coupon=${coupon}` : ''}`} className="flex items-center gap-3.5 rounded-2xl border border-slate-100 p-3 shadow-card hover:border-fixora-blue/30">
              <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt="" className="size-20 shrink-0 rounded-xl" artClassName="w-3/5" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-slate-900">{s.name}</span>
                <span className="line-clamp-2 block text-[13px] text-slate-500">{s.tagline}</span>
                <span className="mt-1 flex items-center gap-3 text-sm">
                  <span className="font-semibold text-fixora-blue">From {formatINR(s.basePrice)}</span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock className="size-3.5" aria-hidden /> {durationRange(s.durationMinMinutes, s.durationMaxMinutes)}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-5 text-fixora-blue" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </BookingShell>
  );
}
