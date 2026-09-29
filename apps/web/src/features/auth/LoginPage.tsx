import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, ChevronLeft, Eye, EyeOff, Smartphone } from 'lucide-react';
import type { z } from 'zod';
import { isAdminRole, Role, type AuthSession } from '@fixora/shared-types';
import { adminLoginSchema, formatIndianPhone, sendOtpSchema, toE164India } from '@fixora/shared-utils';
import { Alert, Button, Logo, OtpInput, TextField } from '@fixora/ui';
import { OtpPhoneArt } from '../../components/art/Scenes';
import { authApi } from '../../lib/endpoints';
import { authActions, homeFor, useAuth } from '../../store/auth';

type Step = 'phone' | 'otp' | 'password';
interface ErrorLike {
  message: string;
  code?: string;
  details?: unknown;
}
const asError = (e: unknown): ErrorLike =>
  e && typeof e === 'object' && 'message' in e ? (e as ErrorLike) : { message: 'Something went wrong. Please try again.' };

/** Only same-app paths, and only inside the signed-in role's own area. */
function destinationFor(role: Role, redirect: string | null) {
  const safe = redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\') ? redirect : null;
  if (!safe) return homeFor(role);
  const area = safe.startsWith('/technician') ? Role.TECHNICIAN : safe.startsWith('/admin') ? 'ADMIN' : Role.CUSTOMER;
  const fits = area === 'ADMIN' ? isAdminRole(role) : area === role;
  return fits ? safe : homeFor(role);
}

/**
 * One login for everyone. Phone + OTP works for customers, technicians and
 * staff; staff may also use email + password. The account's role decides
 * where the app goes next.
 */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.user?.role);
  const redirect = params.get('redirect');
  const fromBooking = redirect?.startsWith('/book') ?? false;

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otpInfo, setOtpInfo] = useState<OtpInfo>({ resendAt: 0 });

  if (status === 'authenticated' && role) return <Navigate to={destinationFor(role, redirect)} replace />;

  const finish = (session: AuthSession) => {
    if (authActions.setSession(session)) navigate(destinationFor(session.user.role, redirect), { replace: true });
  };

  const back = () => {
    if (step !== 'phone') return setStep('phone');
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-white">
      <header className="px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button onClick={back} aria-label="Go back" className="flex size-11 items-center justify-center rounded-full hover:bg-slate-100">
          <ChevronLeft className="size-6" />
        </button>
      </header>
      <main className="flex flex-1 flex-col px-6 pb-8">
        {step === 'phone' && (
          <PhoneStep
            heading={fromBooking ? 'Login to continue' : 'Login or Sign up'}
            subheading={fromBooking ? 'Please login to confirm your booking' : 'Enter your mobile number to continue'}
            onSent={(p, info) => {
              setPhone(p);
              setOtpInfo(info);
              setStep('otp');
            }}
            onUsePassword={() => setStep('password')}
          />
        )}
        {step === 'otp' && <OtpStep phone={phone} info={otpInfo} onInfo={setOtpInfo} onVerified={finish} />}
        {step === 'password' && <PasswordStep onSignedIn={finish} />}
      </main>
    </div>
  );
}

// ─── Step 1: phone ───────────────────────────────────────────────────────

type PhoneIn = z.input<typeof sendOtpSchema>;
type PhoneOut = z.output<typeof sendOtpSchema>;

/** When the next OTP may be requested (+ the development code, if the server echoes it). */
interface OtpInfo {
  resendAt: number;
  devCode?: string;
}
const secondsFromNow = (seconds: number) => Date.now() + seconds * 1000;

function PhoneStep({
  heading,
  subheading,
  onSent,
  onUsePassword,
}: {
  heading: string;
  subheading: string;
  onSent(phone: string, info: OtpInfo): void;
  onUsePassword(): void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<PhoneIn, unknown, PhoneOut>({ resolver: zodResolver(sendOtpSchema), defaultValues: { phone: '' } });

  const submit = form.handleSubmit(async ({ phone }) => {
    setError(null);
    try {
      const res = await authApi.sendOtp(phone);
      onSent(phone, { resendAt: secondsFromNow(res.resendInSeconds), devCode: res.devCode });
    } catch (e) {
      const err = asError(e);
      const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (err.code === 'OTP_COOLDOWN' && retry) {
        // A code was sent moments ago — go enter it.
        return onSent(phone, { resendAt: secondsFromNow(retry) });
      }
      setError(err.message);
    }
  });

  const phoneError = form.formState.errors.phone?.message;
  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <div className="mt-2 flex justify-center">
        <Logo size="md" />
      </div>
      <h1 className="mt-10 text-center text-[26px] font-bold text-slate-900">{heading}</h1>
      <p className="mt-2 text-center text-[15px] text-slate-500">{subheading}</p>

      <label htmlFor="phone" className="sr-only">
        Mobile number
      </label>
      <div
        className={`mt-8 flex h-14 items-center rounded-xl border bg-white focus-within:border-fixora-blue focus-within:ring-3 focus-within:ring-fixora-blue/15 ${phoneError ? 'border-danger' : 'border-slate-300'}`}
      >
        <span className="flex h-full items-center gap-2 border-r border-slate-200 pr-3 pl-4 text-base font-medium text-slate-800">
          <Smartphone className="size-4.5 text-slate-500" aria-hidden />
          +91
        </span>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={14}
          autoFocus
          placeholder="Enter your mobile number"
          aria-invalid={phoneError ? true : undefined}
          className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent px-3 text-base outline-none placeholder:text-slate-400"
          {...form.register('phone')}
        />
      </div>
      {phoneError && (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {phoneError}
        </p>
      )}

      <p className="mt-8 text-center text-[13px] leading-relaxed text-slate-500">
        By continuing, you agree to our
        <br />
        <Link to="/terms" className="font-medium text-fixora-blue">
          Terms &amp; Conditions
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="font-medium text-fixora-blue">
          Privacy Policy
        </Link>
        .
      </p>

      {error && <Alert className="mt-4">{error}</Alert>}

      <Button type="submit" size="lg" fullWidth className="mt-6" loading={form.formState.isSubmitting}>
        Continue <ArrowRight className="size-4.5" aria-hidden />
      </Button>

      <p className="mt-6 text-center text-[13px] text-slate-500">New to FIXORA? You’ll be registered automatically</p>
      <button type="button" onClick={onUsePassword} className="mt-auto pt-8 text-center text-[13px] font-medium text-slate-500 hover:text-fixora-blue">
        FIXORA staff? Sign in with email
      </button>
    </form>
  );
}

// ─── Step 2: OTP ─────────────────────────────────────────────────────────

function OtpStep({ phone, info, onInfo, onVerified }: { phone: string; info: OtpInfo; onInfo(i: OtpInfo): void; onVerified(s: AuthSession): void }) {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((info.resendAt - now) / 1000));

  async function verify(code: string) {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      onVerified(await authApi.verifyOtp(phone, code));
    } catch (e) {
      setError(asError(e).message);
      setOtp('');
      setVerifying(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    setOtp('');
    try {
      const res = await authApi.sendOtp(phone);
      onInfo({ resendAt: secondsFromNow(res.resendInSeconds), devCode: res.devCode });
      setNow(Date.now());
    } catch (e) {
      setError(asError(e).message);
    } finally {
      setResending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void verify(otp);
      }}
      className="flex flex-1 flex-col"
    >
      <OtpPhoneArt className="mx-auto mt-2 h-28 w-auto" />
      <h1 className="mt-6 text-center text-[26px] font-bold text-slate-900">Verify your number</h1>
      <p className="mt-2 text-center text-[15px] text-slate-500">
        We’ve sent a 6-digit OTP to
        <br />
        <span className="font-semibold text-slate-900">{formatIndianPhone(toE164India(phone))}</span>
      </p>

      <div className="mt-8">
        <OtpInput
          value={otp}
          onChange={(v) => {
            setOtp(v);
            if (v.length === 6) void verify(v);
          }}
          disabled={verifying}
          invalid={!!error}
          autoFocus
        />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500" aria-live="polite">
        {secondsLeft > 0 ? `Resend OTP in 00:${String(secondsLeft).padStart(2, '0')}` : 'You can request a new OTP now'}
      </p>

      {info.devCode && (
        <Alert tone="info" className="mt-4">
          Development OTP: <span className="font-mono font-semibold">{info.devCode}</span>
        </Alert>
      )}
      {error && <Alert className="mt-4">{error}</Alert>}

      <Button type="submit" size="lg" fullWidth className="mt-6" loading={verifying} disabled={otp.length !== 6}>
        Verify OTP
      </Button>
      <p className="mt-6 text-center text-sm text-slate-500">
        Didn’t receive the OTP?{' '}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={secondsLeft > 0 || resending}
          className="font-semibold text-fixora-blue disabled:text-slate-400"
        >
          Resend
        </button>
      </p>
    </form>
  );
}

// ─── Staff alternative: email + password ─────────────────────────────────

type PwIn = z.input<typeof adminLoginSchema>;
type PwOut = z.output<typeof adminLoginSchema>;

function PasswordStep({ onSignedIn }: { onSignedIn(s: AuthSession): void }) {
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const form = useForm<PwIn, unknown, PwOut>({ resolver: zodResolver(adminLoginSchema), defaultValues: { email: '', password: '' } });

  const submit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      onSignedIn(await authApi.passwordLogin(email, password));
    } catch (e) {
      setError(asError(e).message);
      form.resetField('password');
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      <div className="mt-2 flex justify-center">
        <Logo size="md" />
      </div>
      <h1 className="mt-10 text-center text-[26px] font-bold text-slate-900">Staff sign in</h1>
      <p className="mt-2 text-center text-[15px] text-slate-500">Use your FIXORA work email and password</p>
      <div className="mt-8 flex flex-col gap-4">
        <TextField label="Work email" type="email" autoComplete="username" autoFocus error={form.formState.errors.email?.message} {...form.register('email')} />
        <TextField
          label="Password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          error={form.formState.errors.password?.message}
          trailing={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
          {...form.register('password')}
        />
      </div>
      {error && <Alert className="mt-4">{error}</Alert>}
      <Button type="submit" size="lg" fullWidth className="mt-6" loading={form.formState.isSubmitting}>
        Sign in <ArrowRight className="size-4.5" aria-hidden />
      </Button>
    </form>
  );
}
