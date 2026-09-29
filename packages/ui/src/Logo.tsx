import { useId } from 'react';
import { cx } from './cx';

interface LogoProps {
  /** `light` = white wordmark for navy backgrounds. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  /** Mark only (collapsed sidebars, favicons). */
  markOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { mark: 'h-7', text: 'text-[1.35rem]', tag: 'text-[0.62rem]' },
  md: { mark: 'h-9', text: 'text-[1.75rem]', tag: 'text-[0.7rem]' },
  lg: { mark: 'h-12', text: 'text-[2.4rem]', tag: 'text-sm' },
} as const;

/** The FIXORA "F" mark: two swept bars over a navy stem. */
export function LogoMark({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const id = useId();
  return (
    <svg viewBox="0 0 48 44" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#1D4ED8" />
          <stop offset="0.6" stopColor="#2563EB" />
          <stop offset="1" stopColor="#00C2FF" />
        </linearGradient>
        <linearGradient id={`${id}-stem`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tone === 'light' ? '#FFFFFF' : '#1C3A63'} />
          <stop offset="1" stopColor={tone === 'light' ? '#C9D8F0' : '#0B1F3A'} />
        </linearGradient>
      </defs>
      <path d="M10 1h37l-7.5 11.5H3.5z" fill={`url(#${id}-bar)`} />
      <path d="M11 17h24l-6.2 10H5z" fill={`url(#${id}-bar)`} />
      <path d="M8.2 1h9.6L7.6 43H0z" fill={`url(#${id}-stem)`} />
    </svg>
  );
}

/** FIXORA wordmark with the swept-F mark and optional "Get It Fixed." tagline. */
export function Logo({ tone = 'dark', size = 'md', withTagline = true, markOnly = false, className }: LogoProps) {
  const s = SIZES[size];
  if (markOnly) return <LogoMark tone={tone} className={cx(s.mark, 'w-auto', className)} />;
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} aria-label="FIXORA — Get It Fixed">
      <LogoMark tone={tone} className={cx(s.mark, 'w-auto shrink-0')} />
      <span className="flex flex-col leading-none" aria-hidden>
        <span
          className={cx(
            'font-extrabold tracking-[0.04em]',
            s.text,
            tone === 'light' ? 'text-white' : 'text-fixora-navy',
          )}
        >
          FI<span className={tone === 'light' ? 'text-fixora-cyan' : 'text-fixora-blue'}>X</span>ORΛ
        </span>
        {withTagline && (
          <span className={cx('mt-0.5 pl-[0.15em] font-medium', s.tag, tone === 'light' ? 'text-white/70' : 'text-slate-500')}>
            Get It Fixed.
          </span>
        )}
      </span>
    </span>
  );
}
