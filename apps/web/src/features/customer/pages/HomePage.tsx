import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, IndianRupee, MapPin, Search, ShieldCheck, SlidersHorizontal, Star, Zap } from 'lucide-react';
import { formatINR } from '@fixora/shared-utils';
import { Button, cx } from '@fixora/ui';
import { CategoryArt } from '../../../components/art/CategoryArt';
import { HomeScene, ShieldBadge } from '../../../components/art/Scenes';
import { Avatar } from '../../../components/Avatar';
import { SectionHeader } from '../../../components/PageHeader';
import { ServiceArt } from '../../../components/ServiceArt';
import { ErrorState, Skeleton } from '../../../components/States';
import { catalogApi } from '../../../lib/endpoints';
import { firstName, greeting } from '../../../lib/format';
import { useAuth } from '../../../store/auth';
import { useLocationStore } from '../../../store/location';
import { AppHeader } from '../components/AppHeader';
import {
  ActiveBookingStrip,
  CustomerReviews,
  RapidFixPromise,
  HomeFooter,
  HowItWorks,
  InviteBanner,
  OffersStrip,
  TrustNumbers,
} from '../components/HomeSections';
import { PermissionsSheet } from '../../../components/PermissionsSheet';
import { LocationPicker } from '../components/LocationPicker';
import { DesktopFooter, DesktopHero, DesktopTrustStrip } from '../components/DesktopHome';
import { ServiceAreaBanner } from '../../../components/ServiceAreaBanner';
import { useCategories } from '../queries';

const WHY = [
  { icon: ShieldCheck, color: 'text-fixora-blue', title: 'Verified Professionals', body: 'Background checked & skilled experts' },
  { icon: IndianRupee, color: 'text-white bg-fixora-cyan rounded-full p-1', title: 'Transparent Pricing', body: 'Clear and fair service charges' },
  { icon: MapPin, color: 'text-fixora-blue', title: 'Local Service', body: 'Trusted professionals in your area' },
  { icon: Zap, color: 'text-amber-500 fill-amber-400', title: 'Easy Booking', body: 'Book in just a few taps' },
];

export function HomePage() {
  const name = useAuth((s) => s.user?.name);
  return (
    <>
      <AppHeader />
      <main className="flex flex-col gap-7 px-4 lg:gap-20 lg:px-8">
        <DesktopHero name={firstName(name)} />
        <DesktopTrustStrip />
        <Hero name={firstName(name)} />
        <ServiceAreaBanner />
        <ActiveBookingStrip />
        <Categories />
        <TrustedBanner />
        <PopularServices />
        <OffersStrip />
        <WhyRapidFix />
        <NearbyProfessionals />
        <HowItWorks />
        <TrustNumbers />
        <CustomerReviews />
        <RapidFixPromise />
        <InviteBanner />
        <HomeFooter />
        <DesktopFooter />
      </main>
      <PermissionsSheet location="customer" />
    </>
  );
}

function Hero({ name }: { name: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue px-5 pt-6 pb-5 text-white lg:hidden">
      <HomeScene className="pointer-events-none absolute -right-10 bottom-14 w-[64%] opacity-90 lg:right-40 lg:bottom-0 lg:w-[34%]" />
      <div className="absolute top-3 right-3 hidden w-[38%] max-w-[160px] flex-col gap-2 rounded-2xl bg-white/95 p-2.5 text-slate-900 shadow-raised min-[340px]:flex lg:top-10 lg:right-10 lg:max-w-[210px] lg:gap-3 lg:p-4">
        {[
          { icon: ShieldCheck, cls: 'text-fixora-blue', a: 'Verified', b: 'Professionals' },
          { icon: IndianRupee, cls: 'rounded-full bg-fixora-cyan p-0.5 text-white', a: 'Transparent', b: 'Pricing' },
          { icon: Zap, cls: 'fill-amber-400 text-amber-500', a: 'Quick', b: 'Booking' },
        ].map(({ icon: Icon, cls, a, b }) => (
          <div key={a} className="flex items-center gap-2">
            <Icon className={cx('size-5 shrink-0', cls)} aria-hidden />
            <p className="text-[11px] leading-tight">
              <span className="block font-semibold">{a}</span>
              <span className="text-slate-500">{b}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="relative max-w-[58%] text-[19px] text-white/90 lg:text-2xl">{greeting()}{name ? ',' : '!'}</p>
      {name && (
        <p className="relative mt-0.5 text-[34px] leading-tight font-extrabold lg:text-5xl">
          {name}! <span aria-hidden>👋</span>
        </p>
      )}
      <p className="relative mt-2 max-w-[58%] text-[15px] text-white/85 lg:mt-3 lg:text-xl">What service do you need today?</p>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        className="relative mt-5 flex h-13 items-center gap-2 rounded-2xl bg-white pr-2 pl-4 text-slate-900 shadow-raised lg:mt-8 lg:h-15 lg:max-w-xl"
      >
        <Search className="size-5 shrink-0 text-slate-700" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for a service (e.g. AC repair, plumber...)"
          aria-label="What service do you need?"
          className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-slate-500"
        />
        <Link to="/book" aria-label="Browse all services" className="flex size-9 items-center justify-center rounded-lg text-fixora-navy hover:bg-slate-100">
          <SlidersHorizontal className="size-5" />
        </Link>
      </form>
    </section>
  );
}

function Categories() {
  const categories = useCategories();
  if (categories.isError && !categories.data) return <ErrorState error={categories.error} onRetry={() => void categories.refetch()} className="py-6" />;
  const items = (categories.data ?? []).slice(0, 9);
  return (
    <section aria-labelledby="cat-heading">
      <SectionHeader title="What are you looking for?" subtitle="Choose a category to get started" className="mb-3" />
      <span id="cat-heading" className="sr-only">Service categories</span>
      <div className="grid grid-cols-5 gap-x-2 gap-y-4 lg:grid-cols-10 lg:gap-x-4">
      {categories.isPending &&
        Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="aspect-[1.15] w-full rounded-2xl" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      {items.map((c) => (
        <CategoryTile key={c.id} to={`/book/c/${c.slug}`} iconKey={c.iconKey} label={c.name} />
      ))}
      {categories.isSuccess && <CategoryTile to="/book" iconKey="more" label="More Services" />}
      </div>
    </section>
  );
}

function CategoryTile({ to, iconKey, label }: { to: string; iconKey: string; label: string }) {
  return (
    <Link to={to} className="group flex flex-col items-center gap-1.5 text-center">
      <span className="flex aspect-[1.15] w-full items-center justify-center rounded-2xl bg-[#F2F5FA] transition-colors group-hover:bg-fixora-blue-soft">
        <CategoryArt iconKey={iconKey} className="size-[62%]" />
      </span>
      <span className="text-[12.5px] leading-tight font-medium text-slate-800 lg:text-sm">{label}</span>
    </Link>
  );
}

function TrustedBanner() {
  return (
    <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-r from-[#EAF2FF] via-[#DCEAFF] to-[#C7DDFF] px-5 py-5 full-bleed lg:px-[max(2rem,calc(50vw-40rem+2rem))] lg:py-16">
      <HomeScene tone="light" className="pointer-events-none absolute -right-6 -bottom-3 w-[55%] lg:right-[max(6rem,calc(50vw-40rem+6rem))] lg:w-[380px]" />
      <ShieldBadge className="absolute top-4 right-5 h-11 w-auto drop-shadow lg:top-10 lg:right-[max(2rem,calc(50vw-40rem+2rem))] lg:h-16" />
      <h2 className="relative max-w-[66%] text-[20px] leading-tight font-extrabold text-fixora-navy lg:max-w-[50%] lg:text-3xl">
        Trusted Professionals at Your Doorstep
      </h2>
      <p className="relative mt-1 text-sm text-slate-700">Reliable. Skilled. Verified.</p>
      <Link
        to="/book"
        className="relative mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-fixora-navy px-5 text-[15px] font-semibold text-white hover:bg-fixora-navy-800"
      >
        Book a Service <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

function PopularServices() {
  const popular = useQuery({ queryKey: ['services', 'popular'], queryFn: () => catalogApi.services({ popular: true, limit: 10 }), staleTime: 10 * 60_000 });
  return (
    <section>
      <SectionHeader
        title="Popular Services"
        subtitle="Most booked by homes near you"
        action={
          <Link to="/book" className="flex items-center gap-0.5 text-[15px] font-medium text-fixora-blue">
            See All <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      />
      {popular.isError && !popular.data && <ErrorState error={popular.error} onRetry={() => void popular.refetch()} className="py-6" />}
      <div className="scroll-row -mx-4 mt-3 gap-3 px-4 pb-1 lg:gap-5" data-desktop-cols style={{ '--desktop-cols': 6 } as React.CSSProperties}>
        {popular.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 w-[44%] shrink-0" />)}
        {popular.data?.map((s) => (
          <Link key={s.id} to={`/book/s/${s.slug}`} className="w-[44%] max-w-[190px] shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card">
            <ServiceArt imageUrl={s.imageUrl} slug={s.slug} iconKey={s.category.iconKey} alt={s.name} className="h-24 w-full lg:h-36" artClassName="h-[70%] w-auto" />
            <div className="flex items-end justify-between gap-1 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                <p className="mt-0.5 text-[13px] text-slate-500">From {formatINR(s.basePrice)}</p>
              </div>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
                <ChevronRight className="size-4" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function WhyRapidFix() {
  return (
    <section>
      <SectionHeader title="Why Choose RapidFix?" subtitle="Built for towns and villages" />
      <div className="scroll-row -mx-4 mt-3 gap-3 px-4 pb-1 lg:gap-5" data-desktop-cols style={{ '--desktop-cols': 4 } as React.CSSProperties}>
        {WHY.map(({ icon: Icon, color, title, body }) => (
          <div key={title} className="flex w-[46%] max-w-[200px] shrink-0 gap-2.5 rounded-2xl bg-[#F3F6FB] p-3.5 lg:p-5">
            <Icon className={cx('size-8 shrink-0', color)} aria-hidden />
            <div>
              <p className="text-[13.5px] leading-tight font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-xs leading-snug text-slate-500">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NearbyProfessionals() {
  const selected = useLocationStore((s) => s.selected);
  const [picking, setPicking] = useState(false);
  const nearby = useQuery({
    queryKey: ['nearby', selected?.latitude, selected?.longitude],
    queryFn: () => catalogApi.nearby(selected!.latitude, selected!.longitude),
    enabled: !!selected,
    staleTime: 60_000,
  });

  return (
    <section>
      <SectionHeader
        title="Nearby Professionals"
        subtitle={selected ? `Verified & online near ${selected.label}` : undefined}
        action={
          nearby.data?.length ? (
            <Link to="/book" className="flex items-center gap-0.5 text-[15px] font-medium text-fixora-blue">
              See All <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : undefined
        }
      />
      {!selected && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-fixora-blue/40 bg-fixora-blue-soft/60 p-4">
          <MapPin className="size-6 shrink-0 text-fixora-blue" aria-hidden />
          <p className="flex-1 text-sm text-slate-700">Set your location to see verified professionals near you.</p>
          <Button size="sm" onClick={() => setPicking(true)}>
            Select
          </Button>
        </div>
      )}
      {selected && nearby.isPending && (
        <div className="mt-3 flex gap-3">
          <Skeleton className="h-28 w-[82%] shrink-0" />
          <Skeleton className="h-28 w-[82%] shrink-0" />
        </div>
      )}
      {nearby.isError && !nearby.data && <ErrorState error={nearby.error} onRetry={() => void nearby.refetch()} className="py-6" />}
      {nearby.isSuccess && nearby.data.length === 0 && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-5 text-center">
          <p className="font-semibold text-slate-900">We couldn’t find a professional nearby.</p>
          <p className="mt-1 text-sm text-slate-500">Try another time, or book and we’ll assign the next available expert.</p>
        </div>
      )}
      {!!nearby.data?.length && (
        <div className="scroll-row -mx-4 mt-3 gap-3 px-4 pb-1 lg:gap-5" data-desktop-cols style={{ '--desktop-cols': 3 } as React.CSSProperties}>
          {nearby.data.map((t) => (
            <Link
              key={t.id}
              to={t.categorySlug ? `/book/c/${t.categorySlug}` : '/book'}
              className="flex w-[82%] max-w-[330px] shrink-0 items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-card"
            >
              <Avatar name={t.name} src={t.avatarUrl} size={68} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-slate-900">{t.name}</p>
                <p className="text-sm text-slate-500">{t.title}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-700">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  {t.ratingAvg.toFixed(1)} <span className="text-slate-500">({t.ratingCount})</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <span className="size-2.5 rounded-full bg-success" aria-hidden /> {t.distanceKm} km away
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
                <ChevronRight className="size-4.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      )}
      <LocationPicker open={picking} onClose={() => setPicking(false)} />
    </section>
  );
}
