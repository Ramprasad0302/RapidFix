import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { CalendarCheck, IndianRupee, LogOut, UserCog, Users } from 'lucide-react';
import { isAdminRole, ROLE_PERMISSIONS } from '@fixora/shared-types';
import { formatINR } from '@fixora/shared-utils';
import { Alert, Button, Logo, Spinner } from '@fixora/ui';
import { getDashboard } from '../services/dashboard.service';
import { authActions, useAuth } from '../store/authStore';

/**
 * Temporary signed-in landing (Phase 2): real KPIs from /admin/dashboard.
 * The full sidebar layout, charts and management screens arrive in Phase 9.
 */
export function BootPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const dashboard = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: getDashboard });
  if (!user) return null;

  const k = dashboard.data?.kpis;
  const cards = [
    { label: 'Total Customers', value: k?.totalCustomers.toLocaleString('en-IN'), icon: Users },
    { label: 'Total Technicians', value: k?.totalTechnicians.toLocaleString('en-IN'), icon: UserCog },
    { label: 'Total Bookings', value: k?.totalBookings.toLocaleString('en-IN'), icon: CalendarCheck },
    { label: 'Total Revenue', value: k && formatINR(k.totalRevenue), icon: IndianRupee },
  ];

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <Logo size="sm" />
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="text-xs text-slate-500">{user.role.replace('_', ' ')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<LogOut className="size-4" />}
            onClick={async () => {
              await authActions.logout();
              navigate('/login', { replace: true });
            }}
          >
            Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <h1 className="font-display text-2xl font-bold text-fixora-navy">Dashboard</h1>
        {dashboard.isError && <Alert className="mt-4">{dashboard.error.message}</Alert>}
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-card bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <span className="flex size-9 items-center justify-center rounded-lg bg-fixora-blue-soft text-fixora-blue">
                  <Icon className="size-4.5" aria-hidden />
                </span>
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-fixora-navy">
                {dashboard.isPending ? <Spinner className="size-5 text-slate-300" /> : (value ?? '—')}
              </p>
            </div>
          ))}
        </div>

        {isAdminRole(user.role) && (
          <section className="mt-6 rounded-card bg-white p-5 shadow-card">
            <h2 className="text-sm font-semibold text-slate-700">Your permissions</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ROLE_PERMISSIONS[user.role].map((p) => (
                <li key={p} className="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
