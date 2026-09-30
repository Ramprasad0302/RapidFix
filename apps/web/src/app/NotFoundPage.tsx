import { Link } from 'react-router';
import { Logo } from '@fixora/ui';
import { homeFor, useAuth } from '../store/auth';

export function NotFoundPage() {
  const role = useAuth((s) => s.user?.role);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <Logo variant="full" size="sm" />
      <p className="mt-8 text-5xl font-extrabold text-fixora-blue">404</p>
      <h1 className="mt-2 text-lg font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you’re looking for doesn’t exist.</p>
      <Link to={homeFor(role)} className="mt-6 flex h-11 items-center rounded-xl bg-fixora-blue px-5 font-semibold text-white">
        Go home
      </Link>
    </main>
  );
}
