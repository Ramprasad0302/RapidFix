import { Navigate, Outlet, useLocation } from 'react-router';
import { FullScreenLoader } from '@fixora/ui';
import { useAuth } from '../store/authStore';
import { loginPath } from '../utils/redirect';

/** Wraps private customer routes; guests are sent to login and brought back afterwards. */
export function RequireAuth() {
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'unknown') return <FullScreenLoader />;
  if (status === 'guest') return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return <Outlet />;
}
