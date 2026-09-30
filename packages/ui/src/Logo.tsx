import { cx } from './cx';

/**
 * RapidFix brand artwork (served from the web app's /brand folder):
 * - `full`     — technician mascot + wordmark + tagline (splash, login, about)
 * - wordmark   — "RapidFix" with speed lines, optional "GET IT FIXED." tagline (headers)
 * - `markOnly` — the mascot alone (collapsed sidebar)
 * `tone="light"` swaps the navy lettering to white for dark backgrounds.
 */
interface LogoProps {
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  markOnly?: boolean;
  variant?: 'wordmark' | 'full';
  className?: string;
}

const WORDMARK_HEIGHT = { sm: 'h-10', md: 'h-12', lg: 'h-16' } as const;
const FULL_HEIGHT = { sm: 'h-28', md: 'h-40', lg: 'h-56' } as const;
const MARK_HEIGHT = { sm: 'h-9', md: 'h-12', lg: 'h-16' } as const;

export function Logo({ tone = 'dark', size = 'md', withTagline = true, markOnly = false, variant = 'wordmark', className }: LogoProps) {
  if (markOnly) {
    return <img src="/brand/mascot.webp" alt="RapidFix" className={cx(MARK_HEIGHT[size], 'w-auto object-contain', className)} />;
  }
  if (variant === 'full') {
    return <img src="/brand/logo-full.webp" alt="RapidFix — Get It Fixed." className={cx(FULL_HEIGHT[size], 'w-auto object-contain', className)} />;
  }
  const file = `wordmark${withTagline ? '' : '-notag'}${tone === 'light' ? '-light' : ''}.webp`;
  return (
    <img
      src={`/brand/${file}`}
      alt={withTagline ? 'RapidFix — Get It Fixed.' : 'RapidFix'}
      className={cx(WORDMARK_HEIGHT[size], 'w-auto max-w-full object-contain', className)}
    />
  );
}
