import { useEffect, useState } from 'react';
import { BellRing, BatteryCharging } from 'lucide-react';
import { isNativeApp, nativeState, onNativeEvent, openNativeBatterySettings, openNativeNotificationSettings } from '../../../lib/nativeApp';
import { requestNotificationPermission } from '../../../lib/notifications';

/**
 * Android app only: make sure job requests can ring while the app is closed —
 * notifications allowed, and no battery restriction (phones like Xiaomi, Oppo,
 * Vivo and Realme otherwise hold pushes back until the app is opened).
 */
export function JobAlertsCard() {
  const [s, setS] = useState(nativeState);
  useEffect(() => onNativeEvent((e) => e.event === 'state' && setS(nativeState())), []);
  if (!isNativeApp() || !s) return null;

  const needNotif = s.permission !== 'granted';
  if (!needNotif && !s.batteryRestricted) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold text-slate-900">Make sure job requests ring when the app is closed</p>
      <ul className="mt-3 flex flex-col gap-3">
        {needNotif && (
          <Step
            icon={<BellRing className="size-5" aria-hidden />}
            text="Allow notifications for RapidFix."
            action="Allow"
            onClick={() => {
              if (s.permission === 'denied') openNativeNotificationSettings();
              else void requestNotificationPermission().then(() => setS(nativeState()));
            }}
          />
        )}
        {s.batteryRestricted && (
          <Step
            icon={<BatteryCharging className="size-5" aria-hidden />}
            text="Battery: find RapidFix and choose “Don’t optimise” / “Unrestricted”. On Xiaomi, Oppo, Vivo or Realme also turn on Autostart."
            action="Open"
            onClick={openNativeBatterySettings}
          />
        )}
      </ul>
    </section>
  );
}

function Step({ icon, text, action, onClick }: { icon: React.ReactNode; text: string; action: string; onClick: () => void }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-600">{icon}</span>
      <span className="min-w-0 flex-1 text-sm text-slate-700">{text}</span>
      <button onClick={onClick} className="shrink-0 rounded-lg bg-fixora-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-fixora-blue-dark">
        {action}
      </button>
    </li>
  );
}
