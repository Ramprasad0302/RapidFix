import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { technicianApi } from '../../lib/endpoints';
import { isNativeApp, nativeState, onNativeEvent, startNativeDuty, stopNativeDuty } from '../../lib/nativeApp';
import { RUNTIME } from '../../lib/runtimeConfig';
import { toast } from '../../store/toast';

/** Every 5 s while travelling to a customer (they watch it live), every 30 s otherwise. */
const TRAVEL_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 30_000;

/** Absolute API address for the Android service (config may hold a relative "/api/v1"). */
const apiBase = () => new URL(RUNTIME.apiUrl, location.origin).toString().replace(/\/$/, '');

/**
 * While the partner is online, their GPS position goes to the server (every 5 s
 * while travelling to a job, otherwise every 30 s); the server forwards it to
 * customers whose technician is on the way and to the operations live map.
 *
 * In the Android app this runs in a background service ("You're online for jobs")
 * that keeps going after the app is closed — and keeps job alerts ringing. In a
 * browser the open page shares it.
 */
export function useLocationSharing() {
  const profile = useQuery({ queryKey: ['tech', 'profile'], queryFn: technicianApi.profile, staleTime: 60_000 });
  const online = profile.data?.isOnline ?? false;
  const loaded = profile.isSuccess;
  const checkedAt = profile.dataUpdatedAt;
  // Re-check when the app comes back to the front (e.g. location was just allowed in Settings).
  const [resumedAt, setResumedAt] = useState(0);
  useEffect(() => onNativeEvent((e) => e.event === 'state' && setResumedAt(Date.now())), []);

  // Android app: start / stop the background service with the online switch. Re-run on every
  // profile refresh too — starting an already running service is harmless.
  useEffect(() => {
    if (!isNativeApp() || !loaded) return;
    if (!online) {
      if (nativeState()?.onDuty) void stopNativeDuty();
      return;
    }
    let cancelled = false;
    void technicianApi
      .locationKey()
      .then(({ token }) => (cancelled ? false : startNativeDuty(apiBase(), token)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [online, loaded, checkedAt, resumedAt]);

  // Browser: share from the open page.
  useEffect(() => {
    if (isNativeApp() || !online || !('geolocation' in navigator)) return;
    let last = 0;
    let travelling = true; // until the server says otherwise
    let warned = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < (travelling ? TRAVEL_INTERVAL_MS : IDLE_INTERVAL_MS)) return;
        last = now;
        void technicianApi
          .pingLocation(pos.coords.latitude, pos.coords.longitude)
          .then((r) => {
            if (r.accepted) travelling = r.travelling;
          })
          .catch(() => undefined);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED && !warned) {
          warned = true;
          toast('Allow location access so customers can track your arrival.', 'error');
        }
      },
      { enableHighAccuracy: true, maximumAge: 3_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);
}
