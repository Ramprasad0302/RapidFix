import { useState } from 'react';
import { cx } from '@fixora/ui';
import { mediaUrl } from '../lib/api';
import { initials } from '../lib/format';

const GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-sky-500 to-blue-600',
  'from-cyan-500 to-blue-600',
  'from-indigo-500 to-violet-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
];

interface Props {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  /** Green (online) / grey (offline) presence dot. */
  online?: boolean;
  className?: string;
}

/** Profile photo, or deterministic coloured initials when there is none. */
export function Avatar({ name, src, size = 48, online, className }: Props) {
  const [failed, setFailed] = useState(false);
  const url = mediaUrl(src);
  const hash = [...(name ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {url && !failed ? (
        <img src={url} alt={name ?? ''} onError={() => setFailed(true)} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span
          aria-label={name ?? undefined}
          className={cx(
            'flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white',
            GRADIENTS[hash % GRADIENTS.length],
          )}
          style={{ fontSize: size * 0.36 }}
        >
          {initials(name)}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-label={online ? 'Online' : 'Offline'}
          className={cx(
            'absolute right-0 bottom-0 rounded-full border-2 border-white',
            online ? 'bg-success' : 'bg-slate-400',
          )}
          style={{ width: Math.max(10, size * 0.24), height: Math.max(10, size * 0.24) }}
        />
      )}
    </span>
  );
}
