import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, LocateFixed, MapPin, UserRound } from 'lucide-react';
import type { z } from 'zod';
import { customerOnboardingSchema, formatIndianPhone, type AddressInput } from '@fixora/shared-utils';
import { Alert, Button, cx, Logo } from '@fixora/ui';
import { CenteredSpinner } from '../../../components/States';
import { customerApi, geoApi } from '../../../lib/endpoints';
import { authActions, signOut, useAuth } from '../../../store/auth';
import { requestCurrentPosition } from '../../../store/location';
import { toast } from '../../../store/toast';
import { MobileShell } from '../CustomerTabsLayout';
import { AddressForm } from '../components/AddressForm';

type AboutIn = z.input<typeof customerOnboardingSchema>;
type About = z.output<typeof customerOnboardingSchema>;

/** Only same-app customer paths. */
const safeRedirect = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/welcome') ? r : '/');

/**
 * First sign-in for a customer: name, email, date of birth and a service
 * address are required before using the app. Shown once, right after the OTP.
 */
export function CompleteProfilePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const status = useAuth((s) => s.status);
  const redirect = safeRedirect(params.get('redirect'));

  const [step, setStep] = useState<1 | 2>(1);
  const [about, setAbout] = useState<About | null>(null);
  const addresses = useQuery({ queryKey: ['customer', 'addresses'], queryFn: customerApi.addresses, enabled: status === 'authenticated' });
  const hasAddress = (addresses.data?.length ?? 0) > 0;

  const save = useMutation({
    mutationFn: (body: About & { address?: AddressInput }) => customerApi.onboarding(body),
    onSuccess: (fresh) => {
      authActions.updateUser(fresh);
      void qc.invalidateQueries({ queryKey: ['customer'] });
      toast(`Welcome to RapidFix, ${fresh.name?.split(' ')[0] ?? ''}!`);
      navigate(redirect, { replace: true });
    },
  });

  const form = useForm<AboutIn, unknown, About>({
    resolver: zodResolver(customerOnboardingSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', dateOfBirth: '' },
  });
  const e = form.formState.errors;

  if (status === 'unknown') return <CenteredSpinner />;
  if (status !== 'authenticated') return <Navigate to={`/login?redirect=${encodeURIComponent('/welcome')}`} replace />;
  if (user?.profileComplete !== false) return <Navigate to={redirect} replace />;

  const submitAbout = form.handleSubmit((v) => {
    setAbout(v);
    if (hasAddress) save.mutate(v);
    else setStep(2);
  });

  return (
    <MobileShell>
      <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 lg:px-10 lg:pt-8">
        <Logo size="sm" />
        <button onClick={() => void signOut()} className="text-sm font-medium text-slate-500 hover:text-fixora-blue">
          Not you? Sign out
        </button>
      </div>

      <main className="px-5 pb-10 lg:px-10">
        <h1 className="mt-4 text-[26px] font-bold text-slate-900">Complete your profile</h1>
        <p className="mt-1 text-[15px] text-slate-500">
          Signed in as <b className="text-slate-700">{user.phone ? formatIndianPhone(user.phone) : ''}</b>. A few details so technicians can reach you.
        </p>

        <ol className="mt-6 grid grid-cols-2 gap-3" aria-label="Steps">
          <StepChip n={1} active={step === 1} done={step > 1} icon={<UserRound className="size-4" />} label="About you" />
          <StepChip n={2} active={step === 2} done={false} icon={<MapPin className="size-4" />} label="Your address" />
        </ol>

        {step === 1 && (
          <form noValidate onSubmit={submitAbout} className="mt-6 grid gap-4 lg:grid-cols-2">
            <Labeled label="Full name" error={e.name?.message} className="lg:col-span-2">
              <input className="field" autoComplete="name" placeholder="e.g. Ravi Kumar" {...form.register('name')} />
            </Labeled>
            <Labeled label="Email address" error={e.email?.message}>
              <input className="field" type="email" autoComplete="email" placeholder="you@example.com" {...form.register('email')} />
            </Labeled>
            <Labeled label="Date of birth" error={e.dateOfBirth?.message}>
              <input className="field" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} {...form.register('dateOfBirth')} />
            </Labeled>
            {save.isError && <Alert className="lg:col-span-2">{save.error.message}</Alert>}
            <Button type="submit" size="lg" fullWidth className="mt-2 lg:col-span-2" loading={save.isPending || addresses.isPending}>
              {hasAddress ? 'Finish' : 'Continue'} <ArrowRight className="size-4.5" aria-hidden />
            </Button>
          </form>
        )}

        {step === 2 && about && (
          <AddressStep
            pending={save.isPending}
            error={save.isError ? save.error.message : null}
            onBack={() => setStep(1)}
            onSubmit={(address) => save.mutate({ ...about, address })}
          />
        )}
      </main>
    </MobileShell>
  );
}

function AddressStep({
  pending,
  error,
  onBack,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onBack(): void;
  onSubmit(a: AddressInput): void;
}) {
  const [prefill, setPrefill] = useState<Partial<AddressInput> | undefined>();
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const pos = await requestCurrentPosition();
      setCoords(pos);
      const a = await geoApi.reverse(pos.latitude, pos.longitude).catch(() => null);
      if (a) setPrefill({ houseNo: a.houseNo, street: a.street, area: a.area, villageTown: a.villageTown, district: a.district, state: a.state, pincode: a.pincode });
    } catch (err) {
      setLocError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => void locate()}
        disabled={locating}
        className="mb-5 flex w-full items-center gap-3 rounded-xl border border-fixora-blue/30 bg-fixora-blue-soft px-4 py-3 text-left text-[15px] font-semibold text-fixora-blue disabled:opacity-60"
      >
        {coords ? <Check className="size-5" /> : <LocateFixed className={cx('size-5', locating && 'animate-pulse')} />}
        <span className="flex-1">
          {locating ? 'Detecting your location…' : coords ? 'Location detected — check the details below' : 'Use my current location'}
          <span className="block text-xs font-normal text-slate-600">Fills in your area, town, district and pincode.</span>
        </span>
      </button>
      {locError && <Alert className="mb-4">{locError}</Alert>}

      <AddressForm
        key={JSON.stringify(prefill ?? {})}
        id="onboarding-address"
        defaultValues={prefill}
        coords={coords}
        onSubmit={(a) => onSubmit({ ...a, isDefault: true })}
      />
      {error && <Alert className="mt-4">{error}</Alert>}
      <div className="mt-6 flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" form="onboarding-address" size="lg" fullWidth loading={pending}>
          Finish sign-up <ArrowRight className="size-4.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function StepChip({ n, active, done, icon, label }: { n: number; active: boolean; done: boolean; icon: React.ReactNode; label: string }) {
  return (
    <li
      aria-current={active ? 'step' : undefined}
      className={cx(
        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold',
        active ? 'border-fixora-blue bg-fixora-blue-soft text-fixora-blue' : done ? 'border-success/30 bg-success-soft text-success' : 'border-slate-200 text-slate-500',
      )}
    >
      {done ? <Check className="size-4" /> : icon}
      <span>
        <span className="sr-only">Step {n}: </span>
        {label}
      </span>
    </li>
  );
}

function Labeled({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[15px] font-semibold text-slate-900">
        {label} <span className="text-danger">*</span>
      </span>
      {children}
      {error && (
        <span role="alert" className="mt-1 block text-sm text-danger">
          {error}
        </span>
      )}
    </label>
  );
}
