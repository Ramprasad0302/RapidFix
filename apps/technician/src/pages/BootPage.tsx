import { useNavigate } from 'react-router';
import { Clock, LogOut, ShieldCheck, ShieldX } from 'lucide-react';
import type { TechnicianVerificationStatus } from '@fixora/shared-types';
import { formatIndianPhone } from '@fixora/shared-utils';
import { Alert, Button, Logo } from '@fixora/ui';
import { authActions, useAuth } from '../store/authStore';

const STATUS_COPY: Record<TechnicianVerificationStatus, { label: string; tone: string; note?: string }> = {
  VERIFIED: { label: 'Verified partner', tone: 'bg-success-soft text-success' },
  PENDING: { label: 'Verification pending', tone: 'bg-warning-soft text-warning', note: 'Our team is reviewing your documents. You can accept jobs once verified.' },
  REJECTED: { label: 'Verification rejected', tone: 'bg-danger-soft text-danger', note: 'Please contact FIXORA support to update your documents.' },
  SUSPENDED: { label: 'Suspended', tone: 'bg-danger-soft text-danger' },
  BLOCKED: { label: 'Blocked', tone: 'bg-danger-soft text-danger' },
};

/**
 * Temporary signed-in landing (Phase 2). The real Technician Dashboard
 * (online toggle, requests, earnings) replaces this in Phase 5.
 */
export function BootPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  if (!user) return null;
  const vs = user.technician?.verificationStatus ?? 'PENDING';
  const copy = STATUS_COPY[vs];
  const Icon = vs === 'VERIFIED' ? ShieldCheck : vs === 'PENDING' ? Clock : ShieldX;

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-fixora-navy px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 text-white">
        <div className="flex items-center justify-between">
          <Logo tone="light" size="sm" />
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            leftIcon={<LogOut className="size-4" />}
            onClick={async () => {
              await authActions.logout();
              navigate('/login', { replace: true });
            }}
          >
            Logout
          </Button>
        </div>
        <p className="mt-5 text-sm text-white/70">Welcome back,</p>
        <p className="font-display text-2xl font-bold">{user.name ?? 'Partner'}</p>
        <p className="text-sm text-white/60">{user.phone && formatIndianPhone(user.phone)}</p>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-5">
        <div className="rounded-card bg-white p-4 shadow-card">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${copy.tone}`}>
            <Icon className="size-4" aria-hidden />
            {copy.label}
          </span>
          {copy.note && <p className="mt-3 text-sm text-slate-600">{copy.note}</p>}
        </div>
        <Alert tone="info" className="mt-4">
          The full partner dashboard — online/offline, job requests and earnings — arrives in Phase 5.
        </Alert>
      </main>
    </div>
  );
}
