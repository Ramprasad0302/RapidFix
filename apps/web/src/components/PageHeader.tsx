import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cx } from '@fixora/ui';

/** Sticky mobile header: back chevron, centred title, optional right-hand action. */
export function PageHeader({
  title,
  right,
  onBack,
  backTo,
  className,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  /** Fallback when there's no history (deep link). */
  backTo?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const back = () => {
    if (onBack) return onBack();
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(backTo ?? '/', { replace: true });
  };
  return (
    <header
      className={cx(
        'sticky top-0 z-30 grid grid-cols-[48px_1fr_auto] lg:top-16 items-center bg-white/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur',
        className,
      )}
    >
      <button onClick={back} aria-label="Go back" className="flex size-11 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100">
        <ChevronLeft className="size-6" />
      </button>
      <h1 className="truncate text-center text-[17px] font-semibold text-slate-900">{title}</h1>
      <div className="flex min-w-12 justify-end pr-1">{right}</div>
    </header>
  );
}

/** Heading + optional link row used between home sections. */
export function SectionHeader({ title, subtitle, action, className }: { title: string; subtitle?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-[19px] leading-tight font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
