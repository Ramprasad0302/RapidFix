import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';

export interface SelectedLocation {
  /** "Kandukur, AP" */
  label: string;
  latitude: number;
  longitude: number;
  source: 'town' | 'gps';
}

interface LocationState {
  selected: SelectedLocation | null;
  select(location: SelectedLocation): void;
}

/**
 * The browsing location. Never asks for GPS permission on its own — only when
 * the user taps "Use current location" (spec: no permission prompt on launch).
 */
export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selected: null,
      select: (selected) => set({ selected }),
    }),
    { name: 'fixora.location', storage: safeStorage, version: 1 },
  ),
);

export function requestCurrentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? 'Location permission was denied. You can choose your town instead.'
              : 'Could not get your location. Please try again or choose your town.',
          ),
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}
