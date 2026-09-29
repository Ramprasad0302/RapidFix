import { Navigate, Outlet } from 'react-router';
import { FullScreenLoader } from '@fixora/ui';
import { useAuth } from '../store/authStore';

/** Every technician screen except login is private. */
export function RequireAuth() {
  const status = useAuth((s) => s.status);
  if (status === 'unknown') return <FullScreenLoader tone="navy" />;
  if (status === 'guest') return <Navigate to="/login" replace />;
  return <Outlet />;
}
