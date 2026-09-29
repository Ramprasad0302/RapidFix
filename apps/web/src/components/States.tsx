import type { ReactNode } from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { Button, cx, Spinner } from '@fixora/ui';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cx('flex justify-center py-16 text-fixora-blue', className)}>
      <Spinner className="size-7" />
    </div>
  );
}

export function EmptyState({
  art,
  title,
  body,
  action,
  className,
}: {
  art?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-12 text-center', className)}>
      {art}
      <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Friendly error with retry — shows a network-specific message when offline. */
export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const e = error as { message?: string; isNetworkError?: boolean } | null;
  return (
    <EmptyState
      className={className}
      art={
        <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
          <WifiOff className="size-6" aria-hidden />
        </span>
      }
      title={e?.isNetworkError ? "You're offline" : 'Something went wrong'}
      body={e?.message ?? 'Please try again.'}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>
            Try again
          </Button>
        )
      }
    />
  );
}
