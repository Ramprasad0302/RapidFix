import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, ChevronDown, CreditCard, Mail, Phone, Share2, Smartphone } from 'lucide-react';
import { Button, Logo } from '@fixora/ui';
import { SupportArt } from '../../../components/art/Scenes';
import { PageHeader } from '../../../components/PageHeader';
import { Skeleton } from '../../../components/States';
import { APP_VERSION } from '../../../lib/config';
import { useSupportContacts } from '../queries';
import { customerApi } from '../../../lib/endpoints';
import { homeFor, useAuth } from '../../../store/auth';
import { copyText } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';

function InfoLayout({ title, backTo, children }: { title: string; backTo?: string; children: ReactNode }) {
  return (
    <MobileShell>
      <PageHeader title={title} backTo={backTo ?? '/account'} />
      <main className="px-5 pb-12 text-[15px] leading-relaxed text-slate-700">{children}</main>
    </MobileShell>
  );
}

const FAQ = [
  ['How do I book a service?', 'Choose a service, describe the problem, add your address and preferred time, then confirm. We assign a verified professional near you.'],
  ['Do I pay before the service?', 'No. You pay after the work is done — by cash, UPI or online. The estimate is shown before you book.'],
  ['Can the price change?', 'The final price can change only if extra work or parts are needed. Your technician must request it in the app and you approve it first.'],
  ['How do I cancel or reschedule?', 'Open the booking in My Bookings and tap Cancel or Reschedule. You can do this until the technician starts travelling.'],
  ['Are professionals verified?', 'Yes. Every RapidFix partner is ID-verified and approved by our team before they can take jobs.'],
];

export function HelpPage() {
  const { phone: SUPPORT_PHONE, email: SUPPORT_EMAIL } = useSupportContacts();
  const role = useAuth((s) => s.user?.role);
  return (
    <InfoLayout title="Help & Support" backTo={homeFor(role) === '/' ? '/account' : homeFor(role)}>
      <section className="flex items-center gap-4 rounded-2xl bg-fixora-blue-soft p-4">
        <SupportArt className="size-14 shrink-0" />
        <div>
          <p className="font-semibold text-slate-900">We’re here to help</p>
          <p className="text-sm">Every day, 8 AM – 9 PM</p>
        </div>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <a href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`} className="flex flex-col items-center gap-1 rounded-2xl border border-slate-100 p-4 font-semibold text-slate-900 shadow-card">
          <Phone className="size-6 text-fixora-blue" /> Call us
        </a>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="flex flex-col items-center gap-1 rounded-2xl border border-slate-100 p-4 font-semibold text-slate-900 shadow-card">
          <Mail className="size-6 text-fixora-blue" /> Email us
        </a>
      </div>
      <h2 className="mt-6 text-lg font-bold text-slate-900">Frequently asked questions</h2>
      <div className="mt-2 divide-y divide-slate-100">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-slate-900">
              {q}
              <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 text-sm">{a}</p>
          </details>
        ))}
      </div>
    </InfoLayout>
  );
}

export function AboutPage() {
  return (
    <InfoLayout title="About RapidFix">
      <div className="flex flex-col items-center py-6">
        <Logo variant="full" size="md" />
        <p className="mt-3 text-sm text-slate-500">Version {APP_VERSION}</p>
      </div>
      <p>
        RapidFix connects homes in villages, small towns and growing cities with verified local professionals — AC technicians, electricians,
        plumbers, carpenters, painters, cleaners and appliance experts.
      </p>
      <p className="mt-3">Transparent pricing, verified partners and easy booking — so every job simply gets fixed.</p>
      <p className="mt-6 text-sm text-slate-500">RapidFix is developed by Nirmaan Digital.</p>
    </InfoLayout>
  );
}

const LEGAL_NOTE = 'This is a summary for the app preview. The final legal text must be reviewed before public launch.';

export function TermsPage() {
  return (
    <InfoLayout title="Terms & Conditions" backTo="/">
      <p className="rounded-xl bg-warning-soft p-3 text-sm text-slate-700">{LEGAL_NOTE}</p>
      <ol className="mt-4 list-decimal space-y-3 pl-5">
        <li>RapidFix is a platform that connects customers with independent, verified service professionals.</li>
        <li>Prices shown are estimates. Extra work or parts are charged only after you approve them in the app.</li>
        <li>You can cancel or reschedule free of charge until the technician starts travelling to you.</li>
        <li>Payment is due after the service is completed, by cash, UPI or online payment.</li>
        <li>Please treat professionals with respect; abusive behaviour can lead to account suspension.</li>
      </ol>
    </InfoLayout>
  );
}

export function PrivacyPage() {
  return (
    <InfoLayout title="Privacy Policy" backTo="/">
      <p className="rounded-xl bg-warning-soft p-3 text-sm text-slate-700">{LEGAL_NOTE}</p>
      <ul className="mt-4 list-disc space-y-3 pl-5">
        <li>We collect your phone number, name, addresses and booking details to provide the service.</li>
        <li>Your number and address are shared only with the professional assigned to your booking, and only while the job is active.</li>
        <li>Location is used only when you choose “Use my current location”.</li>
        <li>We never sell your personal data.</li>
      </ul>
    </InfoLayout>
  );
}

export function ReferPage() {
  const profile = useQuery({ queryKey: ['customer', 'profile'], queryFn: customerApi.profile });
  const code = profile.data?.referralCode;
  const share = async () => {
    if (!code) return;
    const text = `Book trusted home services on RapidFix. Use my code ${code} when you sign up.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'RapidFix', text, url: window.location.origin });
      } catch {
        /* user dismissed */
      }
    } else {
      void copyText(text, 'Invite copied');
    }
  };
  return (
    <InfoLayout title="Refer & Earn">
      <div className="mt-2 rounded-3xl bg-gradient-to-br from-fixora-navy to-fixora-blue p-6 text-center text-white">
        <p className="text-sm text-white/80">Your referral code</p>
        {profile.isPending ? <Skeleton className="mx-auto mt-2 h-9 w-40 bg-white/20" /> : <p className="mt-1 text-3xl font-extrabold tracking-widest">{code}</p>}
        <button onClick={() => code && void copyText(code, 'Code copied')} className="mt-3 text-sm font-semibold text-fixora-cyan">
          Tap to copy
        </button>
      </div>
      <Button size="lg" fullWidth className="mt-5" onClick={() => void share()} leftIcon={<Share2 className="size-5" />}>
        Invite friends
      </Button>
      <p className="mt-4 text-sm text-slate-500">Share RapidFix with friends and family. Referral rewards will be announced soon — your code is already active.</p>
    </InfoLayout>
  );
}

export function PaymentMethodsPage() {
  const methods = [
    { icon: Banknote, title: 'Cash', body: 'Pay your technician after the job is done.' },
    { icon: Smartphone, title: 'UPI', body: 'PhonePe, Google Pay, Paytm or any UPI app.' },
    { icon: CreditCard, title: 'Cards & Wallets', body: 'Secure online payment via Razorpay.' },
  ];
  return (
    <InfoLayout title="Payment Methods">
      <p>You always pay after the service is completed. Choose any method at payment time:</p>
      <ul className="mt-4 flex flex-col gap-3">
        {methods.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-center gap-4 rounded-2xl border border-slate-100 p-4 shadow-card">
            <span className="flex size-11 items-center justify-center rounded-full bg-fixora-blue-soft text-fixora-blue">
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold text-slate-900">{title}</span>
              <span className="block text-sm text-slate-500">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-slate-500">Online payments are processed by Razorpay. RapidFix never stores your card details.</p>
    </InfoLayout>
  );
}
