import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  ChevronRight,
  Gift,
  Headset,
  IndianRupee,
  Mail,
  Phone,
  Quote,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';
import { cx, Logo } from '@fixora/ui';
import { CategoryArt } from '../../../components/art/CategoryArt';
import { SectionHeader } from '../../../components/PageHeader';
import { ProgressSteps } from '../../../components/ProgressSteps';
import { Skeleton } from '../../../components/States';
import { APP_VERSION, SUPPORT_EMAIL, SUPPORT_PHONE } from '../../../lib/config';
import { catalogApi, customerApi, trustApi } from '../../../lib/endpoints';
import { formatDate } from '../../../lib/format';
import { statusMeta, TRACKED } from '../../../lib/status';
import { useAuth } from '../../../store/auth';
import { useBookWithOffer } from './OfferCard';

const SeeAll = ({ to }: { to: string }) => (
  <Link to={to} className="flex items-center gap-0.5 text-[15px] font-medium text-fixora-blue">
    See All <ChevronRight className="size-4" aria-hidden />
  </Link>
);

// ─── Live booking tracker (signed-in customers) ──────────────────────────

export function ActiveBookingStrip() {
  const authed = useAuth((s) => s.status === 'authenticated' && s.user?.role === 'CUSTOMER');
  const active = useQuery({ queryKey: ['customer', 'bookings', 'active'], queryFn: () => customerApi.bookings('active'), enabled: authed, refetchInterval: 30_000 });
  const upcoming = useQuery({ queryKey: ['customer', 'bookings', 'upcoming'], queryFn: () => customerApi.bookings('upcoming'), enabled: authed, refetchInterval: 30_000 });
  const b = active.data?.find((x) => TRACKED.includes(x.status)) ?? upcoming.data?.find((x) => x.status !== 'PENDING');
  if (!authed || !b) return null;
  const meta = statusMeta(b.status);
  return (
    <Link to={`/bookings/${b.id}`} className="block rounded-2xl border border-fixora-blue/15 bg-gradient-to-br from-white to-fixora-blue-soft p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-fixora-blue text-white">
          <Truck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-fixora-blue uppercase">{meta.label}</p>
          <p className="truncate text-[15px] font-semibold text-slate-900">
            {b.service.name}
            {b.technicianName ? ` · ${b.technicianName}` : ''}
          </p>
        </div>
        <span className="flex items-center gap-0.5 text-sm font-semibold text-fixora-blue">
          Track <ChevronRight className="size-4" aria-hidden />
        </span>
      </div>
      {TRACKED.includes(b.status) && (
        <div className="mt-3">
          <ProgressSteps steps={b.timeline} />
        </div>
      )}
    </Link>
  );
}

// ─── Offers strip ────────────────────────────────────────────────────────

const OFFER_BG = ['from-fixora-navy to-fixora-blue', 'from-[#4A3AA7] to-[#2563EB]', 'from-[#0E7490] to-[#1D4ED8]', 'from-[#9D174D] to-[#DB2777]'];

export function OffersStrip() {
  const offers = useQuery({ queryKey: ['offers'], queryFn: () => catalogApi.offers(), staleTime: 5 * 60_000 });
  const book = useBookWithOffer();
  if (offers.isSuccess && offers.data.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Offers for you" subtitle="Save more on services you need" action={<SeeAll to="/offers" />} />
      <div className="scroll-row -mx-4 mt-3 gap-3 px-4 pb-1">
        {offers.isPending && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-36 w-[78%] shrink-0 rounded-2xl" />)}
        {offers.data?.map((o, i) => (
          <article key={o.id} className={cx('relative w-[78%] max-w-[320px] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white', OFFER_BG[i % OFFER_BG.length])}>
            <CategoryArt iconKey={o.category?.iconKey ?? 'more'} className="pointer-events-none absolute -right-3 -bottom-3 size-24 opacity-25" />
            <p className="text-xs font-semibold tracking-wider text-white/75">{o.title.toUpperCase()}</p>
            <p className="mt-1 text-[22px] leading-tight font-extrabold">{o.badge}</p>
            <p className="mt-0.5 line-clamp-1 text-sm text-white/80">{o.description}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-lg border border-dashed border-white/50 px-2.5 py-1 font-mono text-sm font-bold tracking-wide">{o.code}</span>
              <button onClick={() => book(o)} className="ml-auto flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-fixora-navy">
                Book <ArrowRight className="size-3.5" aria-hidden />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-white/60">Valid till {formatDate(o.endsAt)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────

const STEPS = [
  { icon: CalendarCheck2, title: 'Book in a minute', body: 'Pick a service, describe the problem and choose a time.' },
  { icon: BadgeCheck, title: 'Verified pro arrives', body: 'We assign the nearest background-checked professional.' },
  { icon: Wallet, title: 'Pay after service', body: 'Cash, UPI or online — only once the job is done.' },
];

export function HowItWorks() {
  return (
    <section>
      <SectionHeader title="How RapidFix works" subtitle="Fixed in three simple steps" />
      <ol className="mt-4 flex flex-col gap-0">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="relative flex gap-4 pb-5 last:pb-0">
            {i < STEPS.length - 1 && <span aria-hidden className="absolute top-12 left-[23px] h-[calc(100%-3rem)] w-0.5 bg-gradient-to-b from-fixora-blue/40 to-fixora-blue/5" />}
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-fixora-blue-soft text-fixora-blue">
              <Icon className="size-6" aria-hidden />
              <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-fixora-navy text-[11px] font-bold text-white">{i + 1}</span>
            </span>
            <div className="pt-1">
              <p className="font-semibold text-slate-900">{title}</p>
              <p className="text-sm text-slate-500">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Real platform numbers ───────────────────────────────────────────────

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K+` : `${n}`);

export function TrustNumbers() {
  const stats = useQuery({ queryKey: ['stats', 'public'], queryFn: trustApi.stats, staleTime: 10 * 60_000 });
  const s = stats.data;
  if (stats.isError) return null;
  const items = s
    ? [
        { value: compact(s.verifiedProfessionals), label: 'Verified professionals' },
        { value: compact(s.jobsCompleted), label: 'Jobs completed' },
        { value: s.averageRating ? `${s.averageRating.toFixed(1)}★` : '—', label: 'Average rating' },
        { value: `${s.townsServed}`, label: 'Towns served' },
      ]
    : [];
  return (
    <section className="relative overflow-hidden rounded-[22px] bg-fixora-navy px-5 py-6 text-white">
      <div aria-hidden className="absolute -top-16 -right-16 size-48 rounded-full bg-fixora-blue/30 blur-2xl" />
      <div aria-hidden className="absolute -bottom-20 -left-10 size-44 rounded-full bg-fixora-cyan/15 blur-2xl" />
      <p className="relative text-xs font-semibold tracking-[0.2em] text-fixora-cyan">RapidFix IN NUMBERS</p>
      <p className="relative mt-1 text-xl font-bold">Trusted by homes across Andhra Pradesh</p>
      <dl className="relative mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
        {!s && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 bg-white/10" />)}
        {items.map((it) => (
          <div key={it.label} className="flex flex-col-reverse">
            <dt className="text-[13px] text-white/65">{it.label}</dt>
            <dd className="text-[28px] leading-tight font-extrabold tracking-tight">{it.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─── Reviews ─────────────────────────────────────────────────────────────

export function CustomerReviews() {
  const reviews = useQuery({ queryKey: ['reviews', 'featured'], queryFn: trustApi.reviews, staleTime: 10 * 60_000 });
  if (reviews.isSuccess && reviews.data.length === 0) return null;
  return (
    <section>
      <SectionHeader title="What customers say" subtitle="Real reviews from RapidFix bookings" />
      <div className="scroll-row -mx-4 mt-3 gap-3 px-4 pb-1">
        {reviews.isPending && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-40 w-[80%] shrink-0 rounded-2xl" />)}
        {reviews.data?.map((r) => (
          <figure key={r.id} className="flex w-[80%] max-w-[320px] shrink-0 flex-col rounded-2xl border border-slate-100 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <span className="flex gap-0.5" aria-label={`${r.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={cx('size-4', i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} aria-hidden />
                ))}
              </span>
              <Quote className="size-5 text-fixora-blue/25" aria-hidden />
            </div>
            <blockquote className="mt-2 line-clamp-3 flex-1 text-[14.5px] text-slate-700">“{r.comment}”</blockquote>
            <figcaption className="mt-3 border-t border-slate-100 pt-2.5 text-sm">
              <span className="font-semibold text-slate-900">{r.name}</span>
              <span className="text-slate-500">
                {r.town ? ` · ${r.town}` : ''} · {r.service}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ─── Promise ─────────────────────────────────────────────────────────────

export function RapidFixPromise() {
  const stats = useQuery({ queryKey: ['stats', 'public'], queryFn: trustApi.stats, staleTime: 10 * 60_000 });
  const warranty = stats.data?.maxWarrantyDays ?? 0;
  const points = [
    { icon: ShieldCheck, title: 'Verified professionals', body: 'ID-checked and approved by our team' },
    { icon: IndianRupee, title: 'Transparent pricing', body: 'See the estimate before you book; no hidden charges' },
    { icon: Wrench, title: warranty ? `Up to ${warranty}-day warranty` : 'Service warranty', body: 'Free re-visit if the same issue returns' },
    { icon: Headset, title: 'Local support', body: 'Real people to help, every day' },
  ];
  return (
    <section className="rounded-[22px] border border-fixora-blue/10 bg-gradient-to-b from-[#F4F8FF] to-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-fixora-blue text-white">
          <BadgeCheck className="size-6" aria-hidden />
        </span>
        <div>
          <h2 className="text-lg font-bold text-slate-900">The RapidFix Promise</h2>
          <p className="text-sm text-slate-500">Every booking, every time</p>
        </div>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {points.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-2xl bg-white p-3 shadow-card">
            <Icon className="size-5 text-fixora-blue" aria-hidden />
            <p className="mt-1.5 text-[13.5px] leading-tight font-semibold text-slate-900">{title}</p>
            <p className="mt-0.5 text-xs leading-snug text-slate-500">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Invite ──────────────────────────────────────────────────────────────

export function InviteBanner() {
  const authed = useAuth((s) => s.status === 'authenticated');
  return (
    <Link
      to={authed ? '/account/refer' : '/login?redirect=/account/refer'}
      className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-4 ring-1 ring-amber-100"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-600">
        <Gift className="size-6" aria-hidden />
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-slate-900">Invite friends to RapidFix</span>
        <span className="block text-sm text-slate-600">Share your code with family and neighbours.</span>
      </span>
      <ChevronRight className="size-5 text-amber-600" aria-hidden />
    </Link>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────

export function HomeFooter() {
  return (
    <footer className="-mx-4 mt-2 bg-slate-50 px-6 pt-8 pb-6">
      <Logo size="sm" />
      <p className="mt-3 text-[15px] font-semibold text-slate-800">Trusted home services for every town.</p>
      <p className="mt-1 text-sm text-slate-500">Verified local professionals for repairs, cleaning, installation and more.</p>
      <div className="mt-5 flex flex-col gap-2 text-sm">
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} className="flex items-center gap-2 text-slate-700">
          <Phone className="size-4 text-fixora-blue" aria-hidden /> {SUPPORT_PHONE}
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2 text-slate-700">
          <Mail className="size-4 text-fixora-blue" aria-hidden /> {SUPPORT_EMAIL}
        </a>
      </div>
      <nav aria-label="Footer" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-600">
        <Link to="/about">About</Link>
        <Link to="/help">Help &amp; Support</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/privacy">Privacy</Link>
      </nav>
      <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-400">
        © {new Date().getFullYear()} RapidFix · v{APP_VERSION} · Developed by Nirmaan Digital
      </p>
    </footer>
  );
}

