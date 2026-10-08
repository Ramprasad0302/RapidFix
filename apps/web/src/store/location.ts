import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddressInput } from '@fixora/shared-utils';
import { isNativeApp, nativeCall, nativePlatform } from '../lib/nativeApp';
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

/**
 * Precise GPS fix. Phones often report a rough network position first and
 * sharpen within seconds, so we listen for up to `maxWaitMs` and keep the most
 * accurate reading, finishing early once it is within `goodEnoughM` metres.
 */
type Fix = { latitude: number; longitude: number; accuracy: number };

/** In the app: the phone's own precise location (GPS + Wi-Fi + cell) — much more precise than the web view's. */
async function nativeFix(): Promise<Fix> {
  const r = await nativeCall<Partial<Fix> & { error?: string }>('getLocation', null, 40_000);
  if (r?.error === 'denied')
    throw new Error(
      nativePlatform() === 'ios'
        ? 'Location permission is off. Turn it on in Settings → RapidFix → Location, or search for your area instead.'
        : 'Location permission is off. Turn it on in phone Settings → Apps → RapidFix → Permissions → Location, or search for your area instead.',
    );
  if (!r || r.error || r.latitude == null || r.longitude == null) throw new Error('Could not get your location. Please try again or search for your area.');
  return { latitude: r.latitude, longitude: r.longitude, accuracy: r.accuracy ?? 0 };
}

export function requestCurrentPosition(opts: { maxWaitMs?: number; goodEnoughM?: number } = {}): Promise<Fix> {
  if (isNativeApp()) return nativeFix();
  const maxWaitMs = opts.maxWaitMs ?? 12_000;
  const goodEnoughM = opts.goodEnoughM ?? 15;
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available on this device.'));
    let best: GeolocationPosition | null = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve({ latitude: best.coords.latitude, longitude: best.coords.longitude, accuracy: Math.round(best.coords.accuracy) });
      else reject(new Error('Could not get your location. Please try again or search for your area.'));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= goodEnoughM) finish();
      },
      (err) => {
        if (best) return finish();
        done = true;
        navigator.geolocation.clearWatch(id);
        clearTimeout(timer);
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? isNativeApp()
                ? 'Location permission is off. Turn it on in phone Settings → Apps → RapidFix → Permissions → Location, or search for your area instead.'
                : 'Location permission is off. Allow it in your browser settings, or search for your area instead.'
              : 'Could not get your location. Please try again or search for your area.',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 },
    );
    const timer = setTimeout(finish, maxWaitMs);
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
