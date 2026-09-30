import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, TicketPercent } from 'lucide-react';
import { cx } from '@fixora/ui';
import { CategoryArt } from '../../../components/art/CategoryArt';
import { OfferGift } from '../../../components/art/Scenes';
import { SectionHeader } from '../../../components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { AppHeader } from '../components/AppHeader';
import { OfferCard, useBookWithOffer } from '../components/OfferCard';

export function OffersPage() {
  const [category, setCategory] = useState<string | null>(null);
  const all = useQuery({ queryKey: ['offers'], queryFn: () => catalogApi.offers(), staleTime: 5 * 60_000 });

  // Filter chips = categories that currently have live offers.
  const chips = [...new Map((all.data ?? []).filter((o) => o.category).map((o) => [o.category!.slug, o.category!])).values()];
  const offers = (all.data ?? []).filter((o) => !category || o.category?.slug === category);

  return (
    <>
      <AppHeader />
      <main className="flex flex-col gap-5 px-4 lg:gap-8 lg:px-8 lg:py-10">
        <PromoCarousel />

        <div role="tablist" aria-label="Offer categories" className="scroll-row -mx-4 gap-2.5 px-4 pb-1">
          <Chip active={!category} onClick={() => setCategory(null)} label="All Offers" icon={<LayoutGrid className="size-7" />} />
          {chips.map((c) => (
            <Chip
              key={c.slug}
              active={category === c.slug}
              onClick={() => setCategory(c.slug)}
              label={c.name.replace(' & Cooling', ' Services')}
              icon={<CategoryArt iconKey={c.iconKey} className="size-9" />}
            />
          ))}
        </div>

        <SectionHeader
          title="Available Offers"
          action={
            category ? (
              <button onClick={() => setCategory(null)} className="text-[15px] font-medium text-fixora-blue">
                See All
              </button>
            ) : undefined
          }
        />
        <section className="-mt-2 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-5">
          {all.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}
          {all.isError && <ErrorState error={all.error} onRetry={() => void all.refetch()} />}
          {all.isSuccess && offers.length === 0 && (
            <EmptyState art={<TicketPercent className="size-10 text-slate-300" />} title="No offers right now" body="Check back soon — new offers are added every week." />
          )}
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} />
          ))}
        </section>
      </main>
    </>
  );
}

function Chip({ active, onClick, label, icon }: { active: boolean; onClick(): void; label: string; icon: React.ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'flex h-[92px] w-[88px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl text-[12.5px] font-medium transition-colors',
        active ? 'bg-fixora-blue text-white shadow-[0_8px_20px_rgb(37_99_235/0.3)]' : 'bg-[#F2F5FA] text-slate-800',
      )}
    >
      {icon}
      <span className="px-1 leading-tight">{label}</span>
    </button>
  );
}

/** "Great Services. Better Savings." + auto-rotating spotlight on live offers. */
function PromoCarousel() {
  const offers = useQuery({ queryKey: ['offers'], queryFn: () => catalogApi.offers(), staleTime: 5 * 60_000 });
  const book = useBookWithOffer();
  const spotlight = (offers.data ?? []).slice(0, 3);
  const slides = 1 + spotlight.length;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (slides < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % slides), 5000);
    return () => clearInterval(t);
  }, [slides]);

  const o = i > 0 ? spotlight[i - 1] : undefined;
  return (
    <section aria-roledescription="carousel" aria-label="Featured offers" className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue p-5 text-white">
      <OfferGift className="pointer-events-none absolute -right-3 bottom-0 w-[46%]" />
      <div className="relative max-w-[60%] min-h-[118px]">
        {o ? (
          <>
            <p className="text-[22px] leading-tight font-bold">{o.badge}</p>
            <p className="mt-1 text-[15px] text-white/85">{o.title}</p>
            <button onClick={() => book(o)} className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-fixora-navy">
              Use {o.code}
            </button>
          </>
        ) : (
          <>
            <p className="text-[24px] leading-tight font-medium">Great Services.</p>
            <p className="text-[26px] leading-tight font-bold">
              Better <span className="text-fixora-cyan">Savings.</span>
            </p>
            <p className="mt-2 text-sm text-white/80">Exclusive offers on your favourite services.</p>
          </>
        )}
      </div>
      {slides > 1 && (
        <div className="relative mt-3 flex gap-1.5" role="tablist" aria-label="Slides">
          {Array.from({ length: slides }, (_, n) => (
            <button
              key={n}
              role="tab"
              aria-selected={n === i}
              aria-label={`Slide ${n + 1}`}
              onClick={() => setI(n)}
              className={cx('h-1.5 rounded-full transition-all', n === i ? 'w-6 bg-fixora-cyan' : 'w-1.5 bg-white/40')}
            />
          ))}
        </div>
      )}
    </section>
  );
}
