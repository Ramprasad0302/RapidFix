import { Navigate, useNavigate } from 'react-router';
import { BadgeCheck, IndianRupee, MapPin } from 'lucide-react';
import { FullScreenLoader, Logo, OtpLoginFlow } from '@fixora/ui';
import { sendTechnicianOtp, verifyTechnicianOtp } from '../services/auth.service';
import { authActions, useAuth } from '../store/authStore';

const PERKS = [
  { icon: MapPin, text: 'Jobs near you' },
  { icon: IndianRupee, text: 'Weekly payouts' },
  { icon: BadgeCheck, text: 'Verified partner badge' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const status = useAuth((s) => s.status);

  if (status === 'unknown') return <FullScreenLoader tone="navy" />;
  if (status === 'authenticated') return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-fixora-navy">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 text-white">
        <div className="flex items-center gap-2">
          <Logo tone="light" size="md" />
          <span className="rounded-full bg-fixora-cyan/15 px-2.5 py-1 text-[11px] font-bold tracking-wider text-fixora-cyan">
            PARTNER
          </span>
        </div>
        <p className="mt-6 max-w-xs font-display text-2xl leading-snug font-bold">
          Grow your service business with FIXORA.
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">
              <Icon className="size-3.5 text-fixora-cyan" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </header>

      <main className="flex-1 rounded-t-[1.75rem] bg-white px-5 pt-8 pb-10">
        <div className="mx-auto w-full max-w-md">
          <OtpLoginFlow
            phoneHeading="Partner login"
            phoneSubheading="Use the mobile number you registered with FIXORA."
            continueLabel="Get OTP"
            sendOtp={sendTechnicianOtp}
            verifyOtp={async (phone, otp) => {
              const session = await verifyTechnicianOtp(phone, otp);
              if (authActions.setSession(session)) navigate('/', { replace: true });
            }}
          />
        </div>
      </main>
    </div>
  );
}
