import { cx } from './cx';

interface LogoProps {
  /** `light` = white wordmark for navy backgrounds. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  className?: string;
}

const SIZES = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' } as const;

/** FIXORA wordmark: "FIX" in the base tone, "ORA" in accent cyan. */
export function Logo({ tone = 'dark', size = 'md', withTagline = false, className }: LogoProps) {
  return (
    <span className={cx('inline-flex flex-col leading-none', className)}>
      <span
        className={cx(
          'font-display font-extrabold tracking-tight',
          SIZES[size],
          tone === 'light' ? 'text-white' : 'text-fixora-navy',
        )}
      >
        FIX<span className={tone === 'light' ? 'text-fixora-cyan' : 'text-fixora-blue'}>ORA</span>
      </span>
      {withTagline && (
        <span
          className={cx(
            'mt-1.5 text-[0.6rem] font-semibold tracking-[0.32em]',
            tone === 'light' ? 'text-white/60' : 'text-slate-500',
          )}
        >
          GET IT FIXED.
        </span>
      )}
    </span>
  );
}
