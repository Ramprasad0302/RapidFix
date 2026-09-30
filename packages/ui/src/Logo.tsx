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

/** RapidFix mark geometry (viewBox 0 3 44 44): italic "R" whose leg is a lightning bolt, with speed lines. */
export const MARK_PATHS = {
  speed1: { x: 0, y: 12.5, width: 9, height: 3.4, rx: 1.7 },
  speed2: { x: 1.5, y: 19.5, width: 6.5, height: 3.4, rx: 1.7 },
  stem: 'M13.5 4H22L14 44H5.5z',
  bowl: 'M22 4H33.5C40.5 4 44.2 8.4 43 14.2 41.9 19.7 37.3 25 30.2 25H17.8zM20.7 10.5H31.2C33.6 10.5 34.9 11.8 34.5 13.9 34.1 16.1 32.4 18 29.8 18H19.2z',
  bolt: 'M21 23H32.6L28.6 30.8H37.2L22 46.5 25.8 36.2H18.8z',
} as const;

/** The RapidFix mark: an italic "R" with a lightning-bolt leg (fast + fixed). */
export function LogoMark({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'light' }) {
  const id = useId().replace(/:/g, '');
  const light = tone === 'light';
  return (
    <svg viewBox="0 3 44 44" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bowl`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light ? '#60A5FA' : '#1D4ED8'} />
          <stop offset="1" stopColor={light ? '#3B82F6' : '#2563EB'} />
        </linearGradient>
        <linearGradient id={`${id}-bolt`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id={`${id}-stem`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light ? '#FFFFFF' : '#1C3A63'} />
          <stop offset="1" stopColor={light ? '#DCE7F7' : '#0B1F3A'} />
        </linearGradient>
      </defs>
      <rect {...MARK_PATHS.speed1} fill="#22D3EE" />
      <rect {...MARK_PATHS.speed2} fill="#22D3EE" opacity={0.6} />
      <path d={MARK_PATHS.stem} fill={`url(#${id}-stem)`} />
      <path d={MARK_PATHS.bowl} fillRule="evenodd" fill={`url(#${id}-bowl)`} />
      <path d={MARK_PATHS.bolt} fill={`url(#${id}-bolt)`} />
    </svg>
  );
}

/** RapidFix wordmark with the mark and optional "Get It Fixed." tagline. */
export function Logo({ tone = 'dark', size = 'md', withTagline = true, markOnly = false, className }: LogoProps) {
  const s = SIZES[size];
  if (markOnly) return <LogoMark tone={tone} className={cx(s.mark, 'w-auto', className)} />;
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} aria-label="RapidFix — Get It Fixed">
      <LogoMark tone={tone} className={cx(s.mark, 'w-auto shrink-0')} />
      <span className="flex flex-col leading-none" aria-hidden>
        <span className={cx('font-extrabold tracking-[-0.01em]', s.text, tone === 'light' ? 'text-white' : 'text-fixora-navy')}>
          Rapid<span className={tone === 'light' ? 'text-fixora-cyan' : 'text-fixora-blue'}>Fix</span>
        </span>
        {withTagline && (
          <span className={cx('mt-0.5 pl-[0.1em] font-medium', s.tag, tone === 'light' ? 'text-white/70' : 'text-slate-500')}>
            Get It Fixed.
          </span>
        )}
      </span>
    </span>
  );
}
