import { Link, useRouteError } from 'react-router';
import { Logo } from '@fixora/ui';

/**
 * Last-resort boundary. A failed lazy chunk (flaky network, new deploy) gets a
 * reload button; nothing technical is shown to the user.
 */
export function RouteError() {
  const error = useRouteError() as { message?: string } | undefined;
  const chunkFailed = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error?.message ?? '');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <Logo variant="full" size="sm" />
      <h1 className="mt-8 text-lg font-bold text-slate-900">{chunkFailed ? 'Connection problem' : 'Something went wrong'}</h1>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        {chunkFailed ? 'Part of the app could not load. Check your connection and try again.' : 'Please try again. If this keeps happening, contact RapidFix support.'}
      </p>
      <div className="mt-6 flex gap-3">
        <button onClick={() => window.location.reload()} className="h-11 rounded-xl bg-fixora-blue px-5 font-semibold text-white">
          Reload
        </button>
        <Link to="/" className="flex h-11 items-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-800">
          Go home
        </Link>
      </div>
    </main>
  );
}
