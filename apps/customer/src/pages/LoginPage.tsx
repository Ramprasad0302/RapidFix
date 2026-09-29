import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Logo, OtpLoginFlow } from '@fixora/ui';
import { sendCustomerOtp, verifyCustomerOtp } from '../services/auth.service';
import { authActions, useAuth } from '../store/authStore';
import { safeRedirect } from '../utils/redirect';

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = useAuth((s) => s.status);
  const redirectTo = safeRedirect(params.get('redirect'));

  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  return (
    <div className="min-h-dvh bg-white">
      <header className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <Link
          to="/"
          aria-label="Back to home"
          className="flex size-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <Logo size="sm" />
      </header>

      <main className="mx-auto w-full max-w-md px-5 pt-6 pb-10">
        {redirectTo !== '/' && (
          <p className="mb-6 rounded-xl bg-fixora-blue-soft px-4 py-3 text-sm text-fixora-navy">
            Please log in to continue. We&apos;ll take you right back.
          </p>
        )}
        <OtpLoginFlow
          sendOtp={sendCustomerOtp}
          verifyOtp={async (phone, otp) => {
            const session = await verifyCustomerOtp(phone, otp);
            if (authActions.setSession(session)) navigate(redirectTo, { replace: true });
          }}
          footer={
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              By continuing you agree to FIXORA&apos;s Terms &amp; Conditions and Privacy Policy. We never share
              your number with anyone except your assigned professional.
            </p>
          }
        />
      </main>
    </div>
  );
}
