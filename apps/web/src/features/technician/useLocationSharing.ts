import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { technicianApi } from '../../lib/endpoints';
import { toast } from '../../store/toast';

/** Every 5 s while travelling to a customer (they watch it live), every 30 s otherwise. */
const TRAVEL_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 30_000;

/**
 * While the partner is online, stream their GPS position to the server
 * (every 5 s while travelling to a job, otherwise every 30 s). The server forwards it to customers whose
 * technician is on the way and to the operations live map.
 */
export function useLocationSharing() {
  const profile = useQuery({ queryKey: ['tech', 'profile'], queryFn: technicianApi.profile, staleTime: 60_000 });
  const online = profile.data?.isOnline ?? false;

  useEffect(() => {
    if (!online || !('geolocation' in navigator)) return;
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
