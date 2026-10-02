import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, Search } from 'lucide-react';
import { ServiceArt } from '../../../components/ServiceArt';
import { ErrorState, Skeleton } from '../../../components/States';
import { useCategories } from '../queries';
import { BookingShell, StepTitle } from './BookingShell';

/** "Select a Service" — every category with its tagline. */
export function SelectCategoryPage() {
  const categories = useCategories();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const coupon = params.get('coupon');
  const term = q.trim().toLowerCase();
  const list = (categories.data ?? []).filter((c) => !term || `${c.name} ${c.tagline} ${c.professionalTitle}`.toLowerCase().includes(term));

  return (
    <BookingShell requireService={false}>
      <StepTitle title="Select a Service" subtitle="Choose the service you need" />
      <div className="mb-4 flex h-12 items-center gap-2 rounded-xl bg-[#EEF3FB] px-4">
        <Search className="size-5 text-slate-600" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services..." aria-label="Search services" className="h-full flex-1 bg-transparent text-[15px] outline-none" />
      </div>
      {categories.isError && !categories.data && <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />}
      <ul className="flex flex-col gap-2.5">
        {categories.isPending && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[68px]" />)}
        {list.map((c) => (
          <li key={c.id}>
            <Link to={`/book/c/${c.slug}${coupon ? `?coupon=${coupon}` : ''}`} className="flex items-center gap-4 rounded-xl bg-[#F5F8FC] p-2.5 pr-3 hover:bg-fixora-blue-soft">
              <ServiceArt imageUrl={c.imageUrl} iconKey={c.iconKey} alt="" className="h-12 w-16 shrink-0 rounded-lg" artClassName="h-4/5 w-auto" />
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-slate-900">{c.name}</span>
                <span className="block truncate text-[13px] text-slate-500">{c.tagline}</span>
              </span>
              <ChevronRight className="size-5 text-fixora-blue" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {categories.isSuccess && list.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No services match “{q}”.</p>}
    </BookingShell>
  );
}
