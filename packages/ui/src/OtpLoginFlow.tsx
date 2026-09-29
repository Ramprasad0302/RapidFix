import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import type { z } from 'zod';
import type { SendOtpResult } from '@fixora/shared-types';
import { formatIndianPhone, sendOtpSchema, toE164India } from '@fixora/shared-utils';
import { Alert } from './Alert';
import { Button } from './Button';
import { OtpInput } from './OtpInput';
import { TextField } from './TextField';

/** Minimal shape of the API client's normalised error. */
interface ErrorLike {
  message: string;
  code?: string;
  details?: unknown;
}

export interface OtpLoginFlowProps {
  sendOtp(phone: string): Promise<SendOtpResult>;
  /** Resolve on success; throw an ErrorLike on failure. */
  verifyOtp(phone: string, otp: string): Promise<void>;
  phoneHeading?: string;
  phoneSubheading?: string;
  continueLabel?: string;
  footer?: ReactNode;
}

type PhoneForm = z.input<typeof sendOtpSchema>;
type PhoneValues = z.output<typeof sendOtpSchema>;

const asError = (e: unknown): ErrorLike =>
  e && typeof e === 'object' && 'message' in e ? (e as ErrorLike) : { message: 'Something went wrong. Please try again.' };

/** Phone → 6-digit OTP, with resend countdown. Shared by customer and technician apps. */
export function OtpLoginFlow({
  sendOtp,
  verifyOtp,
  phoneHeading = 'Login or sign up',
  phoneSubheading = 'Enter your mobile number. We will send you a 6-digit OTP.',
  continueLabel = 'Continue',
  footer,
}: OtpLoginFlowProps) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const form = useForm<PhoneForm, unknown, PhoneValues>({
    resolver: zodResolver(sendOtpSchema),
    defaultValues: { phone: '' },
  });

  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function requestOtp(tenDigits: string): Promise<boolean> {
    setError(null);
    try {
      const res = await sendOtp(tenDigits);
      setDevCode(res.devCode);
      setResendAt(Date.now() + res.resendInSeconds * 1000);
      setNow(Date.now());
      return true;
    } catch (e) {
      const err = asError(e);
      // Already sent recently: go to the OTP screen and show the remaining wait.
      const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      if (err.code === 'OTP_COOLDOWN' && retry) {
        setResendAt(Date.now() + retry * 1000);
        setNow(Date.now());
        return true;
      }
      setError(err.message);
      return false;
    }
  }

  const onPhoneSubmit = form.handleSubmit(async ({ phone: tenDigits }) => {
    if (await requestOtp(tenDigits)) {
      setPhone(tenDigits);
      setOtp('');
      setStep('otp');
    }
  });

  async function submitOtp(code: string) {
    if (code.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyOtp(phone, code);
    } catch (e) {
      setError(asError(e).message);
      setOtp('');
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    setResending(true);
    setOtp('');
    await requestOtp(phone);
    setResending(false);
  }

  if (step === 'phone') {
    return (
      <form onSubmit={onPhoneSubmit} noValidate className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-fixora-navy">{phoneHeading}</h1>
          <p className="mt-1.5 text-sm text-slate-600">{phoneSubheading}</p>
        </div>
        <TextField
          label="Mobile number"
          leading="+91"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={14}
          autoFocus
          error={form.formState.errors.phone?.message}
          {...form.register('phone')}
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting}>
          {continueLabel}
        </Button>
        {footer}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitOtp(otp);
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      <div>
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-lg p-1 text-sm font-medium text-slate-600 hover:text-fixora-navy"
        >
          <ArrowLeft className="size-4" aria-hidden /> Change number
        </button>
        <h1 className="font-display text-2xl font-bold text-fixora-navy">Enter verification code</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Sent to <span className="font-semibold text-slate-900">{formatIndianPhone(toE164India(phone))}</span>
        </p>
      </div>

      <OtpInput
        value={otp}
        onChange={(v) => {
          setOtp(v);
          if (v.length === 6) void submitOtp(v);
        }}
        disabled={verifying}
        invalid={!!error}
        autoFocus
      />

      {devCode && (
        <Alert tone="info">
          Development OTP: <span className="font-mono font-semibold">{devCode}</span>
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}

      <Button type="submit" size="lg" fullWidth loading={verifying} disabled={otp.length !== 6}>
        Verify &amp; continue
      </Button>

      <p className="text-center text-sm text-slate-600">
        Didn&apos;t get the code?{' '}
        {secondsLeft > 0 ? (
          <span className="font-medium text-slate-500">
            Resend in 0:{String(secondsLeft).padStart(2, '0')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending}
            className="font-semibold text-fixora-blue hover:underline disabled:opacity-50"
          >
            Resend OTP
          </button>
        )}
      </p>
    </form>
  );
}
