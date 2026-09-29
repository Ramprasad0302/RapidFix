import { LoaderCircle } from 'lucide-react';
import { cx } from './cx';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={cx('size-5 animate-spin', className)} />;
}

/** Shown while the session is being restored on launch. */
export function FullScreenLoader({ tone = 'light' }: { tone?: 'light' | 'navy' }) {
  return (
    <div
      className={cx(
        'flex min-h-dvh items-center justify-center',
        tone === 'navy' ? 'bg-fixora-navy text-fixora-cyan' : 'bg-slate-50 text-fixora-blue',
      )}
    >
      <Spinner className="size-8" />
    </div>
  );
}
