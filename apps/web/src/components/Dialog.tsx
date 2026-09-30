import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@fixora/ui';

interface Props {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  /**
   * `sheet` slides up from the bottom (mobile); `center` is a classic modal;
   * `wide` a large modal for admin forms; `drawer` a full-height right panel (admin details).
   */
  variant?: 'sheet' | 'center' | 'wide' | 'drawer';
  footer?: ReactNode;
}

/** Accessible modal built on <dialog>: focus trap, Esc to close, backdrop click to close. */
export function Dialog({ open, onClose, title, children, variant = 'sheet', footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        'm-0 w-full overflow-hidden bg-white p-0 text-slate-900 backdrop:bg-slate-900/45',
        variant === 'drawer' ? 'ml-auto h-dvh max-h-dvh max-w-2xl shadow-raised' : 'max-h-[88dvh]',
        variant === 'sheet' && 'mx-auto mt-auto max-w-[480px] rounded-t-3xl lg:mb-auto lg:max-w-lg lg:rounded-3xl lg:shadow-raised',
        variant === 'center' && 'm-auto max-w-lg rounded-2xl shadow-raised',
        variant === 'wide' && 'm-auto max-w-3xl rounded-2xl shadow-raised',
      )}
    >
      {open && (
        <div className={cx('flex flex-col', variant === 'drawer' ? 'h-dvh' : 'max-h-[88dvh]')}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            <button onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-slate-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
