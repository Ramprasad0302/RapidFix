import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddressInput } from '@fixora/shared-utils';
import { safeStorage } from './safeStorage';

export interface SelectedLocation {
  /** Short header label, e.g. "Sajjapuram, Tanuku". */
  label: string;
  latitude: number;
  longitude: number;
  source: 'town' | 'gps' | 'map' | 'saved';
  /** Full address once the user confirmed a pin (and added house details). */
  address?: AddressInput;
  /** When it is one of the signed-in customer's saved addresses. */
  addressId?: string;
}

interface LocationState {
  selected: SelectedLocation | null;
  /** The "allow location" prompt was shown/answered on this device. */
  promptSeen: boolean;
  select(location: SelectedLocation): void;
  markPromptSeen(): void;
}

/**
 * Where the customer wants service. GPS is only requested when the user taps
 * "Use current location" — never silently on launch.
 */
export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      selected: null,
      promptSeen: false,
      select: (selected) => set({ selected, promptSeen: true }),
      markPromptSeen: () => set({ promptSeen: true }),
    }),
    { name: 'fixora.location', storage: safeStorage, version: 2 },
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
              ? 'Location permission is off. Allow it in your browser settings, or search for your area instead.'
              : 'Could not get your location. Please try again or search for your area.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/** Path to the map-pin confirmation screen. */
export function confirmLocationPath(opts: { from?: string; lat?: number; lng?: number; gps?: boolean } = {}) {
  const p = new URLSearchParams();
  if (opts.from) p.set('from', opts.from);
  if (opts.lat != null && opts.lng != null) {
    p.set('lat', opts.lat.toFixed(6));
    p.set('lng', opts.lng.toFixed(6));
  }
  if (opts.gps) p.set('gps', '1');
  return `/location?${p.toString()}`;
}
