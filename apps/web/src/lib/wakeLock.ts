import { useEffect } from 'react';
import { isNativeApp, setNativeKeepScreenOn } from './nativeApp';

/**
 * Keep the screen on while `active` (e.g. a technician travelling to a job): a
 * locked phone stops sending GPS, so the customer's live map would freeze.
 * Re-acquired when the app comes back to the front; ignored where unsupported.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (active && isNativeApp()) {
      setNativeKeepScreenOn(true);
      return () => setNativeKeepScreenOn(false);
    }
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState === 'visible' && !lock) {
          lock = await navigator.wakeLock.request('screen');
          lock.addEventListener('release', () => (lock = null));
          if (cancelled) void lock.release();
        }
      } catch {
        /* battery saver or unsupported — tracking still works while the screen is on */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
