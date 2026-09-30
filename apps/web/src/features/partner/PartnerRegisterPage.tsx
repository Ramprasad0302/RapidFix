import { Navigate, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, CalendarClock, IndianRupee, MapPinned } from 'lucide-react';
import { isAdminRole, Role } from '@fixora/shared-types';
import { Alert, Button, Logo } from '@fixora/ui';
import { PageHeader } from '../../components/PageHeader';
import { CenteredSpinner } from '../../components/States';
import { partnerApi } from '../../lib/endpoints';
import { authActions, useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { MobileShell } from '../customer/CustomerTabsLayout';
import { useCategories } from '../customer/queries';
import { PartnerProfileForm, toPartnerPayload, type PartnerFormValues } from './PartnerProfileForm';

const PERKS = [
  { icon: IndianRupee, title: 'Earn more', body: 'Keep most of every job. Payouts to your bank or UPI.' },
  { icon: MapPinned, title: 'Jobs near you', body: 'Requests are matched to your skills and travel radius.' },
  { icon: CalendarClock, title: 'Your schedule', body: 'Go online when you want. Accept only what fits.' },
  { icon: BadgeCheck, title: 'Verified badge', body: 'Customers trust verified RapidFix partners.' },
];

/** "Become a partner": a signed-in phone account registers as a technician (pending verification). */
export function PartnerRegisterPage() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const categories = useCategories();
  const register = useMutation({
    mutationFn: (v: PartnerFormValues) => partnerApi.register(toPartnerPayload(v)),
    onSuccess: (session) => {
      authActions.setSession(session);
      toast('Welcome to RapidFix! Upload your documents to get verified.');
      navigate('/technician/documents', { replace: true });
    },
  });

  if (status === 'unknown') return <CenteredSpinner />;
  if (user?.role === Role.TECHNICIAN && !register.isSuccess) return <Navigate to="/technician" replace />;

  return (
    <MobileShell>
      <PageHeader title="Become a Partner" backTo="/login" />
      <main className="flex flex-col gap-5 px-4 pb-10">
        <section className="rounded-2xl bg-fixora-navy p-5 text-white">
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

        {status !== 'authenticated' ? (
          <>
            <p className="text-[15px] text-slate-600">First, verify your mobile number. We'll create your partner account right after.</p>
            <Button size="lg" fullWidth onClick={() => navigate('/login?redirect=/partner')}>
              Continue with mobile number
            </Button>
          </>
        ) : user && isAdminRole(user.role) ? (
          <Alert tone="info">You're signed in with a RapidFix staff account. Partners register with their own mobile number.</Alert>
        ) : categories.isPending ? (
          <CenteredSpinner />
        ) : (
          <>
            <p className="text-[15px] text-slate-600">
              Registering as <b>{user?.phone}</b>. After you submit, upload your ID and certificates — we verify most partners within 48 hours.
            </p>
            <PartnerProfileForm
              defaults={{
                name: user?.name ?? '',
                email: '',
                experienceYears: 1,
                bio: '',
                languages: ['Telugu'],
                serviceRadiusKm: 10,
                addressLine: '',
                villageTown: '',
                district: '',
                state: 'Andhra Pradesh',
                pincode: '',
                baseLatitude: null,
                baseLongitude: null,
                skills: [],
              }}
              categories={categories.data?.map((c) => ({ id: c.id, name: c.name })) ?? []}
              submitLabel="Register as partner"
              pending={register.isPending}
              error={register.error?.message}
              onSubmit={(v) => register.mutate(v)}
            />
          </>
        )}
      </main>
    </MobileShell>
  );
}
