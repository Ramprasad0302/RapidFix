import { useRef } from 'react';
import { cx } from './cx';

interface OtpInputProps {
  value: string;
  onChange(value: string): void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

/**
 * One real <input> (so SMS autofill, paste and screen readers just work)
 * drawn as separate digit boxes.
 */
export function OtpInput({ value, onChange, length = 6, disabled, invalid, autoFocus }: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.padEnd(length).slice(0, length).split('');
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="group relative" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        aria-label={`${length}-digit OTP`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
      <div className="pointer-events-none grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
        {digits.map((d, i) => (
          <div
            key={i}
            className={cx(
              'flex aspect-square max-h-14 items-center justify-center rounded-xl border-2 bg-white font-display text-2xl font-bold text-fixora-navy transition-colors',
              invalid
                ? 'border-danger'
                : i === activeIndex && value.length < length
                  ? 'border-slate-200 group-focus-within:border-fixora-blue'
                  : d.trim()
                    ? 'border-fixora-blue/40'
                    : 'border-slate-200',
            )}
          >
            {d.trim()}
          </div>
        ))}
      </div>
    </div>
  );
}
