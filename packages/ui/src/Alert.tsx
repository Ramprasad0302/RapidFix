import type { ReactNode } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import { cx } from './cx';

export function Alert({ tone = 'error', children, className }: { tone?: 'error' | 'info'; children: ReactNode; className?: string }) {
  const Icon = tone === 'error' ? CircleAlert : Info;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex gap-2.5 rounded-xl px-3.5 py-3 text-sm',
        tone === 'error' ? 'bg-danger-soft text-red-800' : 'bg-fixora-blue-soft text-fixora-navy',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
