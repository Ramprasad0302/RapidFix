import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Clock3, Headset, IndianRupee, Mail, MapPin, Phone, Search, ShieldCheck, Star, Truck } from 'lucide-react';
import { Logo } from '@fixora/ui';
import { HomeScene } from '../../../components/art/Scenes';
import { trustApi } from '../../../lib/endpoints';
import { greeting } from '../../../lib/format';
import { useCategories, useSupportContacts } from '../queries';

/**
 * Desktop-only (≥1024px) Home pieces: a full-width hero band and a full-width
 * footer. Phones keep the compact app hero and footer.
 */

const QUICK = ['AC Repair', 'Electrician', 'Plumber', 'Deep Cleaning', 'RO Service'];

export function DesktopHero({ name }: { name: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const stats = useQuery({ queryKey: ['stats', 'public'], queryFn: trustApi.stats, staleTime: 10 * 60_000 }).data;

  return (
    <section className="full-bleed relative hidden overflow-hidden bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue text-white lg:block">
      <div aria-hidden className="absolute -top-40 -left-40 size-[520px] rounded-full bg-fixora-cyan/10 blur-3xl" />
      <div aria-hidden className="absolute -right-32 -bottom-48 size-[560px] rounded-full bg-fixora-blue/40 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-[1.15fr_0.85fr] items-center gap-12 px-8 py-20 xl:py-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-white/90">
            <BadgeCheck className="size-4 text-fixora-cyan" aria-hidden /> {greeting()}
            {name ? `, ${name}` : ''} — trusted home services across Andhra Pradesh
          </p>
          <h1 className="mt-6 text-[2.75rem] leading-[1.08] font-extrabold tracking-tight xl:text-[3.4rem]">
            Home repairs, done right.
            <br />
            <span className="bg-gradient-to-r from-fixora-cyan to-white bg-clip-text text-transparent">Right when you need them.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Verified local professionals for AC, electrical, plumbing, cleaning and more — transparent prices, and you pay only after the job is done.
          </p>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
            className="mt-8 flex h-16 max-w-2xl items-center gap-3 rounded-2xl bg-white pr-2 pl-5 text-slate-900 shadow-[0_20px_50px_rgb(0_0_0/0.25)]"
          >
            <Search className="size-5 shrink-0 text-slate-500" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="What do you need fixed? e.g. AC not cooling, leaking tap…"
              aria-label="What service do you need?"
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            />
            <button type="submit" className="flex h-12 items-center gap-2 rounded-xl bg-fixora-blue px-6 font-semibold text-white hover:bg-fixora-blue-dark">
              Search <ArrowRight className="size-4" aria-hidden />
            </button>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/60">Popular:</span>
            {QUICK.map((s) => (
              <Link key={s} to={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-white/20 px-3 py-1 text-white/85 hover:bg-white/10">
                {s}
              </Link>
            ))}
          </div>

          <dl className="mt-10 grid max-w-2xl grid-cols-4 gap-6 border-t border-white/10 pt-6">
            <HeroStat value={stats?.averageRating ? `${stats.averageRating.toFixed(1)}★` : '—'} label="Average rating" />
            <HeroStat value={stats ? `${stats.verifiedProfessionals}+` : '—'} label="Verified professionals" />
            <HeroStat value={stats ? `${stats.jobsCompleted}+` : '—'} label="Jobs completed" />
            <HeroStat value={stats ? `${stats.townsServed}` : '—'} label="Towns served" />
          </dl>
        </div>

        <div className="relative">
          <div className="absolute inset-6 rounded-[40px] bg-white/5 ring-1 ring-white/10" aria-hidden />
          <HomeScene className="relative w-full drop-shadow-[0_30px_40px_rgb(0_0_0/0.35)]" />
          <div className="absolute top-6 -left-4 flex items-center gap-3 rounded-2xl bg-white p-3.5 pr-5 text-slate-900 shadow-raised">
            <span className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
              <Truck className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">Technician on the way</span>
              <span className="block text-xs text-slate-500">Live tracking · arriving in 20 min</span>
            </span>
          </div>
          <div className="absolute -right-2 bottom-10 flex items-center gap-3 rounded-2xl bg-white p-3.5 pr-5 text-slate-900 shadow-raised">
            <span className="flex size-10 items-center justify-center rounded-xl bg-fixora-blue-soft text-fixora-blue">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">Verified &amp; background-checked</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden /> Rated by real customers
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-sm text-white/60">{label}</dt>
      <dd className="text-3xl font-extrabold tracking-tight">{value}</dd>
    </div>
  );
}

/** Trust strip under the hero. */
export function DesktopTrustStrip() {
  const items = [
    { icon: ShieldCheck, title: 'Verified professionals', body: 'ID-checked and approved' },
    { icon: IndianRupee, title: 'Transparent pricing', body: 'Estimate before you book' },
    { icon: Clock3, title: 'Same-day service', body: 'Nearby experts, fast' },
    { icon: Headset, title: 'Local support', body: 'Real people, every day' },
  ];
  return (
    <section className="full-bleed hidden border-b border-slate-100 bg-white lg:block">
      <ul className="mx-auto grid max-w-7xl grid-cols-4 divide-x divide-slate-100 px-8">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-center gap-4 px-6 py-7 first:pl-0">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-fixora-blue-soft text-fixora-blue">
              <Icon className="size-6" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold text-slate-900">{title}</span>
              <span className="text-sm text-slate-500">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Full-width navy footer with columns (desktop). */
export function DesktopFooter() {
  const categories = useCategories().data ?? [];
  const { phone, email } = useSupportContacts();
  return (
    <footer className="full-bleed mt-4 hidden bg-fixora-navy text-white lg:block">
      <div className="mx-auto grid max-w-7xl grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-12 px-8 pt-16 pb-12">
        <div>
          <Logo tone="light" size="md" />
          <p className="mt-5 max-w-sm text-white/70">Trusted home services for every town — verified local professionals for repairs, cleaning, installation and more.</p>
          <Link to="/partner" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold hover:bg-white/15">
            Become a RapidFix partner <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <FooterCol title="Services">
          {categories.slice(0, 6).map((c) => (
            <Link key={c.id} to={`/book/c/${c.slug}`}>
              {c.name}
            </Link>
          ))}
        </FooterCol>
        <FooterCol title="Company">
          <Link to="/about">About RapidFix</Link>
          <Link to="/offers">Offers</Link>
          <Link to="/help">Help &amp; Support</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </FooterCol>
        <FooterCol title="Contact">
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2">
            <Phone className="size-4 text-fixora-cyan" aria-hidden /> {phone}
          </a>
          <a href={`mailto:${email}`} className="flex items-center gap-2">
            <Mail className="size-4 text-fixora-cyan" aria-hidden /> {email}
          </a>
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-fixora-cyan" aria-hidden /> Andhra Pradesh, India
          </span>
          <span className="text-white/50">Every day, 8 AM – 9 PM</span>
        </FooterCol>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5 text-sm text-white/50">
          <span>© {new Date().getFullYear()} RapidFix</span>
          <span>
            Developed by <a href="https://nirmaandigital.com" target="_blank" rel="noopener" className="font-medium text-white/80 hover:text-white hover:underline">Nirmaan Digital</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold tracking-wider text-white/50 uppercase">{title}</p>
      <div className="mt-4 flex flex-col gap-3 text-[15px] text-white/80 [&_a:hover]:text-white">{children}</div>
    </div>
  );
}
