import type { ReactNode } from 'react';
import type { BookingStatus } from '@fixora/shared-types';
import { cx } from '@fixora/ui';
import { statusMeta, TONE_CLASSES, type Tone } from '../lib/status';

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap', TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  audience = 'customer',
  className,
}: {
  status: BookingStatus;
  audience?: 'customer' | 'staff';
  className?: string;
}) {
  const meta = statusMeta(status, audience);
  return (
    <Pill tone={meta.tone} className={className}>
      {meta.label}
    </Pill>
  );
}
