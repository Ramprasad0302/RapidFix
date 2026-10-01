import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Clock3,
  HandCoins,
  Headset,
  HeartHandshake,
  IndianRupee,
  Mail,
  MapPinned,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Telescope,
  Users,
  Wrench,
} from 'lucide-react';
import { Logo } from '@fixora/ui';
import { CategoryArt } from '../../../components/art/CategoryArt';
import { trustApi } from '../../../lib/endpoints';
import { useCategories, useSupportContacts } from '../queries';
import { DesktopFooter } from '../components/DesktopHome';

// ─── Shared layout ───────────────────────────────────────────────────────

function BackBar({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-white/90 px-2 backdrop-blur lg:hidden">
      <button onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))} aria-label="Go back" className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
        <ArrowLeft className="size-5" />
      </button>
      <span className="font-semibold text-slate-900">{title}</span>
    </div>
  );
}

function Section({ id, eyebrow, title, children, className }: { id?: string; eyebrow?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 ${className ?? ''}`}>
      {eyebrow && <p className="text-xs font-bold tracking-[0.2em] text-fixora-blue uppercase">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 lg:text-4xl">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ─── About ───────────────────────────────────────────────────────────────

const PROMISES = [
  { icon: BadgeCheck, title: 'Verified professionals', body: 'Every partner is ID-checked, skill-verified and approved by our team before taking a single job.' },
  { icon: IndianRupee, title: 'Transparent pricing', body: 'See the estimate before you book. Extra work or parts are added only after you approve them in the app.' },
  { icon: HandCoins, title: 'Pay after the work', body: 'Pay only when the job is done — cash, UPI or online. A clear invoice for every booking.' },
  { icon: ShieldCheck, title: 'Service warranty', body: 'Repairs come with a service warranty. If the same problem returns, we send someone back.' },
  { icon: Clock3, title: 'Fast & on time', body: 'Nearby technicians, live tracking and timely arrivals — often on the same day.' },
  { icon: Headset, title: 'Local support', body: 'Real people from your area, every day from 8 AM to 9 PM, on call and chat.' },
];

const STEPS = [
  { icon: Wrench, title: 'Choose a service', body: 'Pick from 50+ home services and describe the problem — add a photo if you like.' },
  { icon: MapPinned, title: 'Pin your home', body: 'Drop the pin on your door and add your house number so we reach the right place.' },
  { icon: CalendarCheck, title: 'Get matched instantly', body: 'The nearest verified professional gets your request and accepts within a minute.' },
  { icon: Sparkles, title: 'Track, fix & pay', body: 'Watch them arrive live, get it fixed, then pay and rate the service.' },
];

export function AboutPage() {
  const categories = useCategories().data ?? [];
  const stats = useQuery({ queryKey: ['stats', 'public'], queryFn: trustApi.stats, staleTime: 10 * 60_000 }).data;
  const { phone, email } = useSupportContacts();
  const numbers = [
    { value: stats ? `${stats.verifiedProfessionals}+` : '—', label: 'Verified professionals' },
    { value: stats ? `${stats.jobsCompleted}+` : '—', label: 'Jobs completed' },
    { value: stats?.averageRating ? `${stats.averageRating.toFixed(1)}★` : '—', label: 'Average rating' },
    { value: stats ? `${stats.townsServed}` : '—', label: 'Towns served' },
  ];

  return (
    <div className="min-h-dvh bg-white">
      <BackBar title="About RapidFix" />

      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue text-white">
        <div aria-hidden className="absolute -top-32 -left-24 size-96 rounded-full bg-fixora-cyan/15 blur-3xl" />
        <div aria-hidden className="absolute -right-24 -bottom-40 size-[28rem] rounded-full bg-fixora-blue/40 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-24">
          <Logo tone="light" size="md" />
          <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm">
            <Sparkles className="size-4 text-fixora-cyan" aria-hidden /> Get it fixed — the trusted way
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl leading-[1.08] font-extrabold tracking-tight lg:text-6xl">
            Home services you can trust, <span className="bg-gradient-to-r from-fixora-cyan to-white bg-clip-text text-transparent">from people in your town.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75">
            RapidFix connects homes with verified local professionals — AC technicians, electricians, plumbers, carpenters, painters, cleaners, appliance and
            computer experts — with honest prices and a promise to get it fixed.
          </p>
          <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-4 lg:grid-cols-4">
            {numbers.map((n) => (
              <div key={n.label} className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur">
                <dd className="text-3xl font-extrabold tracking-tight">{n.value}</dd>
                <dt className="mt-1 text-sm text-white/70">{n.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-16 px-5 py-14 lg:gap-24 lg:px-8 lg:py-20">
        {/* Story */}
        <Section eyebrow="Our story" title="Why we started RapidFix">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
            <div className="space-y-4 text-[17px] leading-relaxed text-slate-600">
              <p>
                In most towns, finding a good electrician or AC technician still means asking around, waiting for a call back and hoping the price is fair. Skilled
                professionals, meanwhile, struggle to find steady work beyond word of mouth.
              </p>
              <p>
                RapidFix was born in <b className="text-slate-900">Tanuku, Andhra Pradesh</b> to fix both problems. We bring the convenience of big-city home-service apps
                to towns and villages — verified local experts, upfront pricing, live tracking and payment only after the job is done.
              </p>
              <p>
                Every RapidFix partner is a skilled professional from the community. When you book with us, you're not just getting a repair — you're supporting local
                livelihoods.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl bg-gradient-to-br from-fixora-blue-soft to-sky-50 p-6">
                <Target className="size-8 text-fixora-blue" aria-hidden />
                <h3 className="mt-3 text-xl font-bold text-slate-900">Our mission</h3>
                <p className="mt-2 text-slate-600">Make reliable, fairly priced home services available to every home — in every town and village — at the tap of a button.</p>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 p-6">
                <Telescope className="size-8 text-amber-600" aria-hidden />
                <h3 className="mt-3 text-xl font-bold text-slate-900">Our vision</h3>
                <p className="mt-2 text-slate-600">
                  Become the most trusted home-services brand of small-town India, creating dignified, steady earnings for thousands of local professionals.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* Services */}
        <Section eyebrow="What we do" title="Everything your home needs">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {categories.map((c) => (
              <li key={c.id}>
                <Link to={`/book/c/${c.slug}`} className="flex h-full flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-raised">
                  <CategoryArt iconKey={c.iconKey} className="size-14" />
                  <span className="font-semibold text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-500">{c.tagline}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* How it works */}
        <Section eyebrow="How it works" title="Fixed in four simple steps">
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-3xl border border-slate-100 bg-slate-50 p-6">
                <span className="absolute top-5 right-5 text-5xl font-black text-slate-200">{i + 1}</span>
                <s.icon className="size-8 text-fixora-blue" aria-hidden />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Promise */}
        <Section eyebrow="The RapidFix promise" title="What you can always count on">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROMISES.map((p) => (
              <li key={p.title} className="flex gap-4 rounded-3xl border border-slate-100 p-6 shadow-card">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-fixora-blue-soft text-fixora-blue">
                  <p.icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">{p.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Where we serve + partners */}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-fixora-navy to-fixora-blue p-8 text-white">
            <Rocket className="size-9 text-fixora-cyan" aria-hidden />
            <h2 className="mt-4 text-2xl font-extrabold">Where we serve</h2>
            <p className="mt-2 text-white/80">
              Today we serve <b className="text-white">Tanuku and nearby areas within 10 km</b>. We're expanding our wings across West Godavari and Andhra Pradesh very soon.
            </p>
            <p className="mt-3 text-sm text-white/60">Outside our area? Pick your location in the app and tap “I'm interested” — it tells us where to come next.</p>
          </section>
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 p-8">
            <HeartHandshake className="size-9 text-emerald-600" aria-hidden />
            <h2 className="mt-4 text-2xl font-extrabold text-slate-900">For professionals</h2>
            <p className="mt-2 text-slate-600">
              Are you a skilled technician? Join RapidFix to get jobs near you, choose your own hours and get paid straight to your bank or UPI.
            </p>
            <Link to="/partner" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700">
              Become a RapidFix partner <ArrowRight className="size-4" aria-hidden />
            </Link>
          </section>
        </div>

        {/* Team & contact */}
        <Section eyebrow="Who we are" title="Built with care in Andhra Pradesh">
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="rounded-3xl border border-slate-100 p-7 shadow-card">
              <Users className="size-8 text-fixora-blue" aria-hidden />
              <p className="mt-3 text-[17px] leading-relaxed text-slate-600">
                RapidFix is designed and built by{' '}
                <a href="https://nirmaandigital.com" target="_blank" rel="noopener" className="font-semibold text-fixora-blue hover:underline">
                  Nirmaan Digital
                </a>
                , a technology team focused on products for the people of our region. We obsess over the small things — clear prices, honest technicians, on-time
                arrivals — because that's what earns your trust.
              </p>
              <div className="mt-5 flex items-center gap-1 text-amber-500" aria-label="Customer rating">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className="size-5 fill-current" aria-hidden />
                ))}
                <span className="ml-2 text-sm text-slate-600">Rated {stats?.averageRating?.toFixed(1) ?? '4.9'} by our customers</span>
              </div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-7">
              <h3 className="text-lg font-bold text-slate-900">Talk to us</h3>
              <ul className="mt-4 space-y-3 text-[15px]">
                <li>
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-3 text-slate-700 hover:text-fixora-blue">
                    <Phone className="size-5 text-fixora-blue" aria-hidden /> {phone}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${email}`} className="flex items-center gap-3 text-slate-700 hover:text-fixora-blue">
                    <Mail className="size-5 text-fixora-blue" aria-hidden /> {email}
                  </a>
                </li>
                <li className="flex items-center gap-3 text-slate-700">
                  <MapPinned className="size-5 text-fixora-blue" aria-hidden /> Tanuku, West Godavari, Andhra Pradesh
                </li>
                <li className="flex items-center gap-3 text-slate-500">
                  <Clock3 className="size-5 text-fixora-blue" aria-hidden /> Every day, 8 AM – 9 PM
                </li>
              </ul>
            </div>
          </div>
        </Section>

        {/* CTA */}
        <section className="flex flex-col items-center rounded-3xl bg-gradient-to-r from-fixora-blue to-sky-500 px-6 py-12 text-center text-white">
          <h2 className="text-3xl font-extrabold">Something needs fixing?</h2>
          <p className="mt-2 max-w-xl text-white/85">Book a verified professional in under a minute. Pay only after the job is done.</p>
          <Link to="/book" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-fixora-blue shadow-raised hover:bg-slate-50">
            Book a service <ArrowRight className="size-4" aria-hidden />
          </Link>
        </section>
      </main>
      <DesktopFooter />
    </div>
  );
}

// ─── Terms & Conditions ─────────────────────────────────────────────────

type Clause = { id: string; title: string; body: ReactNode[] };

function terms(email: string, phone: string): Clause[] {
  return [
    {
      id: 'about',
      title: '1. About these terms',
      body: [
        'These Terms & Conditions ("Terms") govern your use of the RapidFix website (rapidfix.in), the RapidFix mobile app and all related services (together, the "Platform"). By creating an account, booking a service or registering as a partner, you agree to these Terms.',
        'If you do not agree, please do not use the Platform. These Terms should be read together with our Privacy Policy.',
      ],
    },
    {
      id: 'platform',
      title: '2. What RapidFix does',
      body: [
        'RapidFix is a technology platform that connects customers with independent, verified service professionals ("Partners" or "Technicians") for home services such as AC, electrical, plumbing, carpentry, painting, cleaning, appliance, pest control, computer, vehicle care and salon-at-home services.',
        'Partners are independent professionals, not employees of RapidFix. RapidFix verifies partners, facilitates bookings, payments and support, and works to resolve issues, but the service itself is performed by the partner.',
      ],
    },
    {
      id: 'eligibility',
      title: '3. Eligibility & accounts',
      body: [
        'You must be at least 18 years old to book services or register as a partner (customers aged 13–17 may use the Platform only with a parent or guardian\'s consent).',
        'You sign in with your mobile number and a one-time password (OTP). You are responsible for keeping access to your phone secure and for all activity on your account. Provide accurate details — name, email, date of birth and address — and keep them up to date.',
        'One account per mobile number. RapidFix may suspend accounts that are fake, shared, misused or used for fraud.',
      ],
    },
    {
      id: 'area',
      title: '4. Service area',
      body: [
        'Services are currently available in Tanuku and nearby areas within a 10 km radius. Bookings for addresses outside the active service area cannot be accepted. You can register your interest and we will notify you when we reach your area.',
      ],
    },
    {
      id: 'booking',
      title: '5. Bookings',
      body: [
        'When you book, you choose a service, describe the problem, pin your exact location, add your door/house number and choose a time. Accurate details help the right professional reach you on time.',
        'Your booking is offered to the most suitable verified partner nearby. If a partner declines or does not respond, it is offered to the next partner automatically. If no partner is available, our team will contact you.',
        'A booking is confirmed once a partner accepts it. You will receive notifications as your booking progresses — technician assigned, on the way, arrived, started and completed.',
      ],
    },
    {
      id: 'pricing',
      title: '6. Prices, extra work & payment',
      body: [
        'Prices shown in the app are estimates based on the service selected and include applicable taxes as displayed. A visit/inspection charge applies to some services and is shown before you book.',
        'If the partner finds that additional work or spare parts are needed, they must raise the request in the app with the amount. Extra charges are added only after you approve them. You may decline additional work.',
        'Payment is due after the service is completed, by cash, UPI or online payment through our payment partner (Razorpay). RapidFix does not store your card or UPI PIN details. An invoice is available in the app for every completed booking.',
        'Offers and coupons are subject to their stated conditions, may be withdrawn at any time and cannot be exchanged for cash.',
      ],
    },
    {
      id: 'cancel',
      title: '7. Cancellation & rescheduling',
      body: [
        'You can cancel or reschedule a booking free of charge in the app until the technician starts travelling to you. After that, please contact support to change or cancel the visit.',
        'If the partner cancels or does not arrive, we will try to assign another partner. Any amount paid online for a booking that is not delivered is refunded to the original payment method, usually within 5–7 working days.',
      ],
    },
    {
      id: 'warranty',
      title: '8. Service warranty',
      body: [
        'Many services include a service warranty (shown on the service page). If the same issue recurs within the warranty period due to the work performed, contact support and we will arrange a free re-visit.',
        'The warranty covers workmanship only. It does not cover spare parts supplied by you, new or unrelated faults, misuse, damage by third parties, power fluctuations, or natural wear and tear. Manufacturer warranties on parts are as provided by the manufacturer.',
      ],
    },
    {
      id: 'customer',
      title: '9. Your responsibilities',
      body: [
        'Provide safe access to the place of service, a working power/water supply where needed, and accurate information about the problem.',
        'Keep valuables secure, supervise children and pets, and be present (or have an adult present) during the service.',
        'Treat partners with respect. Abusive, unsafe or discriminatory behaviour towards partners may lead to suspension of your account.',
        'Do not ask partners to work outside the Platform or pay them outside the app for platform bookings; such arrangements are not covered by our support, warranty or protections.',
      ],
    },
    {
      id: 'partners',
      title: '10. Terms for partners (technicians)',
      body: [
        'Partners must be at least 18, provide genuine identity and skill documents, and be approved by RapidFix before receiving jobs. RapidFix may verify documents and background details.',
        'Partners decide when they are online and which offers to accept, must arrive on time, behave professionally, follow safety practices, and raise any extra work or parts in the app before charging for them.',
        'RapidFix charges a commission on each completed job as shown in the partner app. Earnings are credited to the partner wallet and paid out to the registered bank account or UPI ID.',
        'Partners are responsible for their own tools, licences and applicable taxes. Repeated cancellations, poor ratings, misconduct, fraud or safety violations may lead to suspension or removal.',
      ],
    },
    {
      id: 'reviews',
      title: '11. Ratings, reviews & content',
      body: [
        'After a service, you may rate and review the partner. Reviews must be honest and based on your own experience. RapidFix may hide reviews that are abusive, fake, contain personal information or are unrelated to the service.',
        'Photos, videos and messages you share through the Platform must be lawful and related to your booking. You grant RapidFix permission to use them to provide and improve the service and to resolve disputes.',
      ],
    },
    {
      id: 'prohibited',
      title: '12. Prohibited use',
      body: [
        'You must not misuse the Platform — including creating fake bookings or accounts, harassing anyone, attempting to access other users\' data, interfering with the app or its security, scraping data, or using the Platform for any unlawful purpose.',
      ],
    },
    {
      id: 'liability',
      title: '13. Liability',
      body: [
        'RapidFix acts as an intermediary. While we verify partners and work hard to ensure good service, we are not liable for the acts or omissions of independent partners, except as required by applicable law.',
        'To the maximum extent permitted by law, RapidFix\'s total liability for any claim relating to a booking is limited to the amount you paid for that booking. RapidFix is not liable for indirect or consequential losses.',
        'If something goes wrong, raise a complaint in the app within 7 days of the service. Our team will investigate fairly and may offer a re-visit, refund or other remedy.',
      ],
    },
    {
      id: 'privacy',
      title: '14. Privacy',
      body: ['We collect and use personal information as described in our Privacy Policy. You can delete your account at any time from the app or at rapidfix.in/delete-account.'],
    },
    {
      id: 'changes',
      title: '15. Suspension, termination & changes',
      body: [
        'You may stop using the Platform or delete your account at any time. RapidFix may suspend or terminate access for breach of these Terms, fraud or safety concerns.',
        'We may update these Terms from time to time. Material changes will be notified in the app. Continued use after changes means you accept the updated Terms.',
      ],
    },
    {
      id: 'law',
      title: '16. Governing law & disputes',
      body: [
        'These Terms are governed by the laws of India. Disputes will first be addressed through our support and grievance process; unresolved disputes are subject to the exclusive jurisdiction of the courts of West Godavari district, Andhra Pradesh.',
      ],
    },
    {
      id: 'contact',
      title: '17. Contact & grievances',
      body: [
        <>
          For questions, complaints or grievances, contact our support team at{' '}
          <a href={`mailto:${email}`} className="font-medium text-fixora-blue">
            {email}
          </a>{' '}
          or{' '}
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-medium text-fixora-blue">
            {phone}
          </a>{' '}
          (every day, 8 AM – 9 PM). We aim to acknowledge grievances within 48 hours and resolve them within 30 days.
        </>,
      ],
    },
  ];
}

export function TermsPage() {
  const { phone, email } = useSupportContacts();
  const clauses = terms(email, phone);
  return (
    <div className="min-h-dvh bg-white">
      <BackBar title="Terms & Conditions" />
      <header className="bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue text-white">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
          <p className="text-xs font-bold tracking-[0.2em] text-fixora-cyan uppercase">Legal</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight lg:text-5xl">Terms &amp; Conditions</h1>
          <p className="mt-3 max-w-2xl text-white/75">Please read these terms carefully. They explain how RapidFix works for customers and partners, and your rights and responsibilities.</p>
          <p className="mt-4 text-sm text-white/60">Last updated: 1 October 2026</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[260px_1fr] lg:px-8 lg:py-14">
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">Contents</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {clauses.map((c) => (
                <li key={c.id}>
                  <a href={`#${c.id}`} className="text-slate-600 hover:text-fixora-blue">
                    {c.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <article className="max-w-3xl">
          {clauses.map((c) => (
            <section key={c.id} id={c.id} className="scroll-mt-24 border-b border-slate-100 py-6 first:pt-0 last:border-0">
              <h2 className="text-xl font-bold text-slate-900">{c.title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600">
                {c.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
          <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
            See also our{' '}
            <Link to="/privacy" className="font-medium text-fixora-blue">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link to="/delete-account" className="font-medium text-fixora-blue">
              account deletion
            </Link>{' '}
            page.
          </p>
        </article>
      </div>
      <DesktopFooter />
    </div>
  );
}
