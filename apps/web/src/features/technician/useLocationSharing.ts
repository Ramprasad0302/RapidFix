import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { technicianApi } from '../../lib/endpoints';
import { toast } from '../../store/toast';

const MIN_INTERVAL_MS = 15_000;

/**
 * While the partner is online, stream their GPS position to the server
 * (throttled to one ping per 15 s). The server forwards it to customers whose
 * technician is on the way and to the operations live map.
 */
export function useLocationSharing() {
  const profile = useQuery({ queryKey: ['tech', 'profile'], queryFn: technicianApi.profile, staleTime: 60_000 });
  const online = profile.data?.isOnline ?? false;

  useEffect(() => {
    if (!online || !('geolocation' in navigator)) return;
    let last = 0;
    let warned = false;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < MIN_INTERVAL_MS) return;
        last = now;
        void technicianApi.pingLocation(pos.coords.latitude, pos.coords.longitude).catch(() => undefined);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED && !warned) {
          warned = true;
          toast('Allow location access so customers can track your arrival.', 'error');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);
}
