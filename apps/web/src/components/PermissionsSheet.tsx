import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, LocateFixed, MapPinned, Search, ShieldAlert } from 'lucide-react';
import { Button, cx } from '@fixora/ui';
import { geoApi } from '../lib/endpoints';
import { notificationPermission, notificationsSupported } from '../lib/notifications';
import { requestCurrentPosition, useLocationStore } from '../store/location';
import { LocationPicker } from '../features/customer/components/LocationPicker';
import { Dialog } from './Dialog';
import { NotificationAskDialog } from './NotificationAskDialog';

type State = 'granted' | 'denied' | 'prompt' | 'unsupported';
const GEO_KEY = 'rapidfix.permissionsAsked';
const NOTIF_KEY = 'rapidfix.notificationsAsked';

async function geolocationState(): Promise<State> {
  if (!('geolocation' in navigator)) return 'unsupported';
  try {
    const s = await navigator.permissions.query({ name: 'geolocation' });
    return s.state;
  } catch {
    return 'prompt'; // Older Safari: no Permissions API — we'll find out when asking.
  }
}

const notifState = (): State => {
  const p = notificationPermission();
  return p === 'default' ? 'prompt' : p;
};

/** Each question is asked at most once per session — separately, so logging in still brings up notifications. */
export function sessionFlag(key: string, set?: boolean) {
  try {
    if (set) sessionStorage.setItem(key, '1');
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
export const NOTIFICATIONS_ASKED_KEY = NOTIF_KEY;

/** Short label for the header from a reverse-geocoded point. */
export async function locateAndSelect(select: ReturnType<typeof useLocationStore.getState>['select']) {
  const { latitude, longitude } = await requestCurrentPosition();
  const a = await geoApi.reverse(latitude, longitude).catch(() => null);
  const label = a ? [a.area || a.street, a.villageTown].filter(Boolean).join(', ') || a.title : 'Current location';
  select({ label, latitude, longitude, source: 'gps' });
}

/**
 * First-run permissions: location (customers — to show nearby professionals and
 * fill the address; technicians — live tracking) and notifications (booking
 * updates, job requests, chat). Our explanation first; the browser prompt only
 * after a tap. Asked again next session while something is still undecided.
 */
export function PermissionsSheet({ location }: { location: 'customer' | 'technician' | false }) {
  const { selected, select, markPromptSeen } = useLocationStore();
  const [geo, setGeo] = useState<State | null>(null);
  const [notif, setNotif] = useState<State>(notifState);
  const [busy, setBusy] = useState<'geo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geoDismissed, setGeoDismissed] = useState(() => sessionFlag(GEO_KEY));
  const [notifDismissed, setNotifDismissed] = useState(() => sessionFlag(NOTIF_KEY));

  useEffect(() => {
    let alive = true;
    void geolocationState().then((s) => alive && setGeo(s));
    return () => {
      alive = false;
    };
  }, []);

  // Permission already granted but no location chosen yet: detect it silently (like delivery apps do).
  useEffect(() => {
    if (location === 'customer' && geo === 'granted' && !selected) void locateAndSelect(select).catch(() => undefined);
  }, [location, geo, selected, select]);

  // Customers without a location also see it when GPS is blocked, to pick their area by hand.
  const needGeo = !!location && (geo === 'prompt' || (location === 'customer' && !selected && (geo === 'denied' || geo === 'unsupported')));
  const [manual, setManual] = useState(false);
  // Notifications are asked separately, AFTER the location question (guests too — the device is
  // linked to the account at login).
  const needNotif = notif === 'prompt' && notificationsSupported();
  const askGeo = needGeo && !geoDismissed;
  const askNotif = needNotif && !notifDismissed;
  const open = geo !== null && askGeo;
  const notifOpen = geo !== null && !askGeo && askNotif;

  const close = () => {
    sessionFlag(GEO_KEY, true);
    setGeoDismissed(true);
    markPromptSeen();
  };

  const allowLocation = async () => {
    setBusy('geo');
    setError(null);
    try {
      if (location === 'customer') await locateAndSelect(select);
      else await requestCurrentPosition();
      setGeo('granted');
      close(); // location done → the notifications question follows on its own
    } catch (e) {
      setGeo((await geolocationState()) === 'denied' ? 'denied' : 'prompt');
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <LocationPicker open={manual} onClose={() => setManual(false)} />
      <Dialog open={open} onClose={close} title="Allow location">
        <p className="text-[15px] text-slate-600">
          {location === 'technician'
            ? 'RapidFix needs these to send you nearby jobs and show customers when you are on the way.'
            : 'Allow these so we can find professionals near you and keep you updated on every booking.'}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {location && (
            <PermissionRow
              icon={<MapPinned className="size-6" />}
              title="Location"
              body={
                location === 'technician'
                  ? 'Live tracking while you are online and travelling to a job.'
                  : 'Show nearby professionals and auto-fill your street and area.'
              }
              state={geo ?? 'prompt'}
              busy={busy === 'geo'}
              onAllow={allowLocation}
              allowIcon={<LocateFixed className="size-4" />}
            />
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {location === 'customer' && !selected && geo !== 'granted' && (
          <Button
            variant="outline"
            size="lg"
            fullWidth
            className="mt-3"
            leftIcon={<Search className="size-5" />}
            onClick={() => {
              close();
              setManual(true);
            }}
          >
            Search your area manually
          </Button>
        )}
        <Button variant="ghost" size="lg" fullWidth className="mt-3" onClick={close}>
          Not now
        </Button>
      </Dialog>
      <NotificationAskDialog
        open={notifOpen}
        technician={location === 'technician'}
        onClose={() => {
          setNotif(notifState());
          setNotifDismissed(true);
        }}
      />
    </>
  );
}

function PermissionRow({
  icon,
  title,
  body,
  state,
  busy,
  onAllow,
  allowIcon,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  state: State;
  busy: boolean;
  onAllow(): void;
  allowIcon?: ReactNode;
}) {
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl border p-3.5', state === 'granted' ? 'border-success/30 bg-success-soft/60' : 'border-slate-200')}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fixora-blue-soft text-fixora-blue">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-[13px] leading-snug text-slate-600">{body}</p>
        {state === 'denied' && (
          <p className="mt-1 flex items-start gap-1 text-xs text-danger">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Blocked — turn it on in your browser or phone settings for this site.
          </p>
        )}
      </div>
      {state === 'granted' ? (
        <CircleCheck className="size-6 shrink-0 text-success" aria-label="Allowed" />
      ) : state === 'prompt' ? (
        <Button size="sm" loading={busy} onClick={onAllow} leftIcon={allowIcon}>
          Allow
        </Button>
      ) : null}
    </div>
  );
}
