import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { unwrap } from '@fixora/web-core';
import { Button, Logo } from '@fixora/ui';
import { api } from '../services/api';
import { authActions, useAuth } from '../store/authStore';

interface Health {
  status: string;
  db: string;
  dbLatencyMs: number;
}

/**
 * Temporary landing (Phase 1–2): API status + guest/session state.
 * Replaced by the real Customer Home in Phase 3.
 */
export function BootPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: () => unwrap<Health>(api.get('/health')) });
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-fixora-navy p-6 text-white">
      <div className="w-full max-w-sm text-center">
        <Logo tone="light" size="lg" withTagline />
        <p role="status" className="mt-8 rounded-card bg-white/10 px-4 py-3 text-sm">
          {health.isPending && 'Connecting to FIXORA API…'}
          {health.isError && <span className="text-red-300">{health.error.message}</span>}
          {health.isSuccess && (
            <span className="text-emerald-300">
              API {health.data.status} · database {health.data.db}
            </span>
          )}
        </p>

        <div className="mt-6 rounded-card bg-white/5 p-4 text-sm">
          {status === 'unknown' && <p className="text-white/70">Restoring session…</p>}
          {status === 'guest' && (
            <>
              <p className="text-white/80">You&apos;re browsing as a guest.</p>
              <Link
                to="/login"
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-fixora-blue font-semibold hover:bg-fixora-blue-dark"
              >
                Login / Sign up
              </Link>
            </>
          )}
          {status === 'authenticated' && user && (
            <>
              <p className="text-white/80">
                Logged in as <span className="font-semibold text-white">{user.name ?? user.phone}</span>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/account/profile"
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white/15 font-semibold hover:bg-white/25"
                >
                  My profile
                </Link>
                {/* Customer logout returns to Home as a guest, not to a login screen. */}
                <Button variant="secondary" className="bg-white/5 ring-1 ring-white/20" onClick={() => void authActions.logout()}>
                  Logout
                </Button>
              </div>
            </>
          )}
        </div>
        <p className="mt-10 text-[11px] text-white/40">by Nirmaan Digital</p>
      </div>
    </main>
  );
}
