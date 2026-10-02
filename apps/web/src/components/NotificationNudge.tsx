import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { BellRing, X } from 'lucide-react';
import { isNativeApp, onNativeEvent, openNativeNotificationSettings } from '../lib/nativeApp';
import { notificationPermission, notificationsSupported, requestNotificationPermission } from '../lib/notifications';
import { useAuth } from '../store/auth';
import { sessionFlag } from './PermissionsSheet';

const HIDDEN_KEY = 'rapidfix.notificationBarHidden';
/** Pages where the bar would get in the way of a form the user must finish first. */
const SKIP = ['/welcome', '/login', '/delete-account'];

/**
 * A slim bar on every page for signed-in users who haven't decided on
 * notifications yet — so the question is never missed (the first-run sheet
 * only appears once per session). The browser prompt opens on tap.
 */
export function NotificationNudge({ area }: { area: 'customer' | 'technician' }) {
  const authed = useAuth((s) => s.status === 'authenticated');
  const { pathname } = useLocation();
  const [perm, setPerm] = useState(notificationPermission);
  const [hidden, setHidden] = useState(() => sessionFlag(HIDDEN_KEY));
  const [busy, setBusy] = useState(false);
  // Android app: pick up a change made in phone Settings when the user comes back.
  useEffect(() => onNativeEvent((e) => e.event === 'state' && setPerm(notificationPermission())), []);

  if (!authed || hidden || (perm !== 'default' && perm !== 'denied') || !notificationsSupported() || SKIP.some((p) => pathname.startsWith(p))) return null;
  const blocked = perm === 'denied';
  const inAndroidApp = isNativeApp();

  const enable = async () => {
    setBusy(true);
    setPerm(await requestNotificationPermission());
    setBusy(false);
  };

  return (
    <div role="region" aria-label="Notifications" className="z-30 border-b border-fixora-blue/20 bg-fixora-blue-soft lg:sticky lg:top-[72px]">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:px-8">
        <BellRing className="size-5 shrink-0 text-fixora-blue" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-slate-700">
          {blocked ? (
            <>
              <b>Notifications are blocked.</b>{' '}
              {inAndroidApp
                ? 'Turn them on in Settings so you don\'t miss updates.'
                : 'Tap the icon left of the address bar (🔒 or ⚙︎) → Site settings / Permissions → Notifications → Allow, then reload.'}
            </>
          ) : area === 'technician' ? (
            'Turn on notifications so you never miss a new job request.'
          ) : (
            'Turn on notifications to know when your technician is assigned and on the way.'
          )}
        </p>
        {blocked && inAndroidApp && (
          <button
            onClick={openNativeNotificationSettings}
            className="shrink-0 rounded-lg bg-fixora-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-fixora-blue-dark"
          >
            Open settings
          </button>
        )}
        {!blocked && (
          <button
            onClick={() => void enable()}
            disabled={busy}
            className="shrink-0 rounded-lg bg-fixora-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-fixora-blue-dark disabled:opacity-60"
          >
            Turn on
          </button>
        )}
        <button
          onClick={() => {
            sessionFlag(HIDDEN_KEY, true);
            setHidden(true);
          }}
          aria-label="Not now"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white/60"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
