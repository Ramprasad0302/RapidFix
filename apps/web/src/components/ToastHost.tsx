import { cx } from '@fixora/ui';
import { useToast } from '../store/toast';

export function ToastHost() {
  const { message, tone } = useToast();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      {message && (
        <div
          role="status"
          className={cx(
            'pointer-events-auto max-w-sm rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-raised',
            tone === 'error' ? 'bg-danger' : 'bg-fixora-navy',
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
}
