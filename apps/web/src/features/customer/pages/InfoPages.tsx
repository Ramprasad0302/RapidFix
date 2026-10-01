import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, ChevronDown, CreditCard, Mail, Phone, Share2, Smartphone } from 'lucide-react';
import { Button } from '@fixora/ui';
import { SupportArt } from '../../../components/art/Scenes';
import { PageHeader } from '../../../components/PageHeader';
import { Skeleton } from '../../../components/States';
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

const PRIVACY: [string, string[]][] = [
  [
    'What we collect',
    [
      'Account: mobile number (verified by OTP), name, email and date of birth.',
      'Addresses you save for service visits, and your location when you tap “Use my current location”.',
      'Bookings: services, problem descriptions, photos/videos you attach, chat messages with your technician, ratings and reviews.',
      'Payments: amount, method and status. Card/UPI details are handled by our payment partner (Razorpay) — we never see or store your card or UPI PIN.',
      'Partners (technicians) also provide: ID and skill documents, profile photo, bank/UPI details for payouts, and live location while online or on a job.',
      'Device: a notification token so we can send booking updates, and basic technical logs (IP address, app version) for security.',
    ],
  ],
  [
    'Why we use it',
    [
      'To create your account, match your booking with a nearby verified professional and show live job updates.',
      'To send notifications about your bookings, payments and account (you can turn them off in your phone settings).',
      'To process payments, refunds and partner payouts, and to prevent fraud and misuse.',
      'To provide support and resolve complaints.',
    ],
  ],
  [
    'Who sees it',
    [
      'Your technician sees your name, number, service address and booking details only for the job assigned to them.',
      'Customers see a partner’s name, photo, rating and live location during an active job.',
      'Service providers who help run RapidFix: Google Firebase (OTP sign-in and notifications), Razorpay (payments), Google Maps or OpenStreetMap (address lookup) and our hosting provider (Hostinger). They use the data only to provide their service to us.',
      'Authorities, when the law requires it.',
      'We never sell your personal data or use it for third-party advertising.',
    ],
  ],
  [
    'How long we keep it',
    [
      'Account data is kept while your account is active.',
      'Booking, invoice and payment records are kept for as long as Indian tax and accounting law requires, without your name or number after you delete your account.',
    ],
  ],
  [
    'Your choices',
    [
      'Edit your name, email, date of birth and addresses any time in the app (Account → Edit Profile).',
      'Location and notifications are asked for only when needed, and can be turned off in your phone settings.',
      'Delete your account any time: Account → Delete my account, or visit rapidfix.in/delete-account. Personal details are erased immediately.',
    ],
  ],
  [
    'Security',
    [
      'All data travels over HTTPS. Partner bank account numbers are encrypted, and ID documents are private files only our verification team can open.',
    ],
  ],
  ['Children', ['RapidFix is meant for adults. Partners must be 18 or older; we do not knowingly collect data from children under 13.']],
];

export function PrivacyPage() {
  const { phone, email } = useSupportContacts();
  return (
    <InfoLayout title="Privacy Policy" backTo="/">
      <h1 className="mt-2 text-2xl font-bold text-slate-900">RapidFix Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated: 30 September 2026</p>
      <p className="mt-4">
        This policy explains what personal data the RapidFix app and website (rapidfix.in) collect, why, and the choices you have. By using RapidFix you agree to it.
      </p>
      {PRIVACY.map(([heading, points]) => (
        <section key={heading} className="mt-6">
          <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {points.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">Contact</h2>
        <p className="mt-2">
          Questions or requests about your data: email{' '}
          <a href={`mailto:${email}`} className="font-medium text-fixora-blue">
            {email}
          </a>{' '}
          or call{' '}
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="font-medium text-fixora-blue">
            {phone}
          </a>
          .
        </p>
      </section>
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
