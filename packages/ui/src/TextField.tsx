import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cx } from './cx';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Rendered inside the field on the left (e.g. "+91"). */
  leading?: ReactNode;
  /** Rendered inside the field on the right (e.g. a show-password toggle). */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, error, hint, leading, trailing, className, id, ref, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div
        className={cx(
          'flex h-12 items-center rounded-xl border bg-white transition-colors',
          'focus-within:border-fixora-blue focus-within:ring-3 focus-within:ring-fixora-blue/15',
          error ? 'border-danger' : 'border-slate-300',
        )}
      >
        {leading && <span className="pl-3.5 text-base font-medium text-slate-600">{leading}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full w-full min-w-0 rounded-xl bg-transparent px-3.5 text-base text-slate-900 outline-none placeholder:text-slate-400"
          {...rest}
        />
        {trailing && <span className="pr-2">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
