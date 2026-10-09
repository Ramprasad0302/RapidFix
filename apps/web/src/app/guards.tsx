import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { isAdminRole, Role } from '@fixora/shared-types';
import { DesktopTopBar } from '../components/DesktopTopBar';
import { NotificationNudge } from '../components/NotificationNudge';
import { TechnicianBackground } from '../features/technician/TechnicianBackground';
import { SplashScreen } from '../components/SplashScreen';
import { isPublicView } from '../lib/publicView';
import { homeFor, useAuth } from '../store/auth';

/** Guests go to the common login (and come back); signed-in users of another role go to their own area. */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.user?.role);
  const location = useLocation();

  if (status === 'unknown') return <SplashScreen />;
  if (status === 'guest') {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (!role || !roles.includes(role)) return <Navigate to={homeFor(role)} replace />;
  return <Outlet />;
}

/**
 * The public customer app. Shows the splash while the saved session is
 * restored — but never more than 2.5 s, so guests on slow networks still get
 * straight to Home. Technicians and staff are sent to their own area.
 */
export function CustomerArea() {
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.user?.role);
  const profileComplete = useAuth((s) => s.user?.profileComplete);
  const location = useLocation();
  const [waitedEnough, setWaitedEnough] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaitedEnough(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (status === 'unknown' && !waitedEnough) return <SplashScreen />;
  // Staff who pressed "Open now" on the launch screen see the public website in this tab.
  const staffPublicView = status === 'authenticated' && !!role && isAdminRole(role) && isPublicView();
  if (staffPublicView) return <AreaFrame area="customer" quiet />;
  if (status === 'authenticated' && role !== Role.CUSTOMER) return <Navigate to={homeFor(role)} replace />;
  // New customers finish their profile (name, email, date of birth, address) before anything else.
  if (status === 'authenticated' && profileComplete === false && !PROFILE_EXEMPT.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to={`/welcome?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <AreaFrame area="customer" />;
}

/** Pages a customer may open before finishing their profile. */
const PROFILE_EXEMPT = ['/welcome', '/terms', '/privacy', '/help', '/about'];

/** `/customer/bookings` → `/bookings` (spec URLs keep working). */
export function StripCustomerPrefix() {
  const params = useParams();
  const location = useLocation();
  return <Navigate to={`/${params['*'] ?? ''}${location.search}`} replace />;
}

/** Laptop frame for the customer and technician apps: grey page background + top navigation. */
export function AreaFrame({ area, quiet }: { area: 'customer' | 'technician'; quiet?: boolean }) {
  return (
    <div className="min-h-dvh overflow-x-clip lg:bg-slate-50">
      <DesktopTopBar area={area} />
      {!quiet && <NotificationNudge area={area} />}
      <Outlet />
      {area === 'technician' && <TechnicianBackground />}
    </div>
  );
}
