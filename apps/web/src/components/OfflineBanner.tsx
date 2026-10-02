import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Shown on every screen while the device has no internet: saved data is still browsable. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-slate-900/95 px-4 py-2.5 text-center text-[13px] font-medium text-white shadow-lg lg:bottom-6"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You’re offline — showing saved services. Booking and payments need internet.
    </div>
  );
}
