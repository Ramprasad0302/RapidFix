import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, FileCheck2, IndianRupee, MapPinned, ShieldCheck, Smartphone, UserRound, Wrench } from 'lucide-react';
import { isAdminRole, Role, type AuthSession } from '@fixora/shared-types';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Logo } from '@fixora/ui';
import { PageHeader } from '../../components/PageHeader';
import { CenteredSpinner, ErrorState } from '../../components/States';
import { catalogApi, partnerApi } from '../../lib/endpoints';
import { disposeRecaptcha, firebaseOtp, RECAPTCHA_CONTAINER, serverOtp, type OtpSender } from '../../lib/phoneOtp';
import { authActions, homeFor, useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { OtpStep, PhoneStep, type OtpInfo } from '../auth/LoginPage';
import { MobileShell } from '../customer/CustomerTabsLayout';
import { useAppConfig, useCategories } from '../customer/queries';
import { PartnerProfileForm, toPartnerPayload, type PartnerFormValues } from './PartnerProfileForm';

const PERKS = [
  { icon: IndianRupee, title: 'Earn more', body: 'Keep most of every job. Payouts to your bank or UPI.' },
  { icon: MapPinned, title: 'Jobs near you', body: 'Requests matched to your skills and travel distance.' },
  { icon: CalendarClock, title: 'Your schedule', body: 'Go online when you want. Accept only what fits.' },
  { icon: BadgeCheck, title: 'Verified badge', body: 'Customers trust verified RapidFix partners.' },
];

const JOURNEY = [
  { icon: Smartphone, title: 'Verify your mobile', body: 'One-time OTP' },
  { icon: UserRound, title: 'Personal & work details', body: 'Type of work, experience, address' },
  { icon: FileCheck2, title: 'Upload documents', body: 'Aadhaar, photo, certificates' },
  { icon: ShieldCheck, title: 'Get verified', body: 'Usually within 48 hours' },
];

/**
 * "Become a partner" — technician onboarding in one place:
 * 1. verify the mobile number (OTP, right here), 2. personal details,
 * 3. type of work & experience, 4. address & service area → documents.
 */
export function PartnerRegisterPage() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const categories = useCategories();
  // Every category's services, so partners can tick the exact work they do (the visit is done by all).
  const services = useQuery({
    queryKey: ['partner', 'services', categories.data?.map((c) => c.slug)],
    queryFn: async () => (await Promise.all((categories.data ?? []).map((c) => catalogApi.services({ category: c.slug, limit: 50 })))).flat(),
    enabled: !!categories.data,
    staleTime: 10 * 60_000,
  });
  const servicesOf = (categoryId: string) =>
    (services.data ?? []).filter((s) => s.category.id === categoryId && !s.slug.endsWith('-technician-visit')).map((s) => ({ id: s.id, name: s.name }));
  // Set before the session switches to TECHNICIAN, so this page sends them to documents, not the dashboard.
  const [justRegistered, setJustRegistered] = useState(false);
  const register = useMutation({
    mutationFn: (v: PartnerFormValues) => partnerApi.register(toPartnerPayload(v)),
    onSuccess: (session) => {
      setJustRegistered(true); // batched with the session update
      authActions.setSession(session);
      toast('Registration received! Now upload your documents to get verified.');
      navigate('/technician/documents', { replace: true });
    },
  });

  if (status === 'unknown') return <CenteredSpinner />;
  if (user?.role === Role.TECHNICIAN) return <Navigate to={justRegistered ? '/technician/documents' : '/technician'} replace />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:bg-slate-50">
      <PerksPanel />
      <MobileShell className="lg:my-10 lg:min-h-0 lg:max-w-2xl">
        <PageHeader title="Become a Partner" backTo="/" className="lg:hidden" />
        <main className="flex flex-col gap-5 px-4 pb-10 lg:px-10 lg:py-10">
          <section className="rounded-2xl bg-fixora-navy p-5 text-white lg:hidden">
            <Logo tone="light" size="sm" />
            <h1 className="mt-4 text-2xl leading-tight font-bold">Grow your service business with RapidFix</h1>
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {PERKS.map((p) => (
                <li key={p.title} className="rounded-xl bg-white/8 p-3">
                  <p.icon className="size-5 text-fixora-cyan" aria-hidden />
                  <p className="mt-1.5 text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-white/70">{p.body}</p>
                </li>
              ))}
            </ul>
          </section>
          <h1 className="hidden text-3xl font-extrabold text-slate-900 lg:block">Partner sign-up</h1>

          {status !== 'authenticated' ? (
            <VerifyPhone />
          ) : user && isAdminRole(user.role) ? (
            <Alert tone="info">You're signed in with a RapidFix staff account. Partners register with their own mobile number.</Alert>
          ) : categories.isPending ? (
            <CenteredSpinner />
          ) : categories.isError ? (
            <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
          ) : (
            <>
              <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
                <BadgeCheck className="size-4.5 shrink-0" aria-hidden /> Mobile verified: <b>{user?.phone ? formatIndianPhone(user.phone) : ''}</b>
              </p>
              <PartnerProfileForm
                defaults={{
                  name: user?.name ?? '',
                  email: user?.email ?? '',
                  dateOfBirth: '',
                  alternatePhone: '',
                  experienceYears: 1,
                  bio: '',
                  languages: ['Telugu'],
                  hasOwnTools: true,
                  hasVehicle: true,
                  serviceRadiusKm: 10,
                  addressLine: '',
                  villageTown: '',
                  district: '',
                  state: 'Andhra Pradesh',
                  pincode: '',
                  baseLatitude: null,
                  baseLongitude: null,
                  skills: [],
                  serviceIds: [],
                }}
                categories={categories.data?.map((c) => ({ id: c.id, name: c.name, services: servicesOf(c.id) })) ?? []}
                submitLabel="Submit registration"
                pending={register.isPending}
                error={register.error?.message}
                onSubmit={(v) => register.mutate(v)}
              />
            </>
          )}
        </main>
      </MobileShell>
    </div>
  );
}

/** Step 1 — the partner's mobile number, verified with an OTP on this page. */
function VerifyPhone() {
  const navigate = useNavigate();
  const config = useAppConfig();
  const sender: OtpSender = config.data?.otpProvider === 'firebase' ? firebaseOtp : serverOtp;
  const [phone, setPhone] = useState<string | null>(null);
  const [info, setInfo] = useState<OtpInfo>({ resendAt: 0 });
  useEffect(() => disposeRecaptcha, []);

  const verified = (session: AuthSession) => {
    if (!authActions.setSession(session)) return;
    // An existing partner or staff member just signed in — take them home.
    if (session.user.role !== Role.CUSTOMER) navigate(homeFor(session.user.role), { replace: true });
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-5 lg:p-8">
      {/* Firebase attaches its invisible reCAPTCHA here. */}
      <div id={RECAPTCHA_CONTAINER} />
      {config.isPending ? (
        <CenteredSpinner />
      ) : phone ? (
        <>
          <OtpStep sender={sender} phone={phone} info={info} onInfo={setInfo} onVerified={verified} />
          <button type="button" onClick={() => setPhone(null)} className="mt-4 w-full text-center text-sm font-medium text-slate-500 hover:text-fixora-blue">
            Change mobile number
          </button>
        </>
      ) : (
        <PhoneStep
          embedded
          sender={sender}
          heading="Start with your mobile number"
          subheading="We'll send a one-time OTP to verify it. This becomes your partner login."
          onSent={(p, i) => {
            setPhone(p);
            setInfo(i);
          }}
        />
      )}
    </div>
  );
}

/** Laptop-only left panel: why join + the onboarding journey. */
function PerksPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-fixora-navy via-[#12306a] to-fixora-blue p-12 text-white lg:flex lg:flex-col">
      <div aria-hidden className="absolute -top-24 -right-24 size-96 rounded-full bg-fixora-cyan/15 blur-3xl" />
      <div className="sticky top-12 flex flex-col gap-10">
        <Logo tone="light" size="md" />
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
            <Wrench className="size-4 text-fixora-cyan" aria-hidden /> For technicians &amp; service professionals
          </p>
          <h2 className="mt-5 text-4xl leading-tight font-extrabold">Grow your service business with RapidFix</h2>
          <ul className="mt-8 grid grid-cols-2 gap-4">
            {PERKS.map((p) => (
              <li key={p.title} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <p.icon className="size-6 text-fixora-cyan" aria-hidden />
                <p className="mt-2 font-semibold">{p.title}</p>
                <p className="text-sm text-white/70">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wider text-white/50 uppercase">How it works</p>
          <ol className="mt-4 flex flex-col gap-4">
            {JOURNEY.map((j, i) => (
              <li key={j.title} className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-bold">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{j.title}</span>
                  <span className="text-sm text-white/65">{j.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </aside>
  );
}
