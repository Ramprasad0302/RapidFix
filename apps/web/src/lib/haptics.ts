import { isNativeApp, nativeCall } from './nativeApp';

export type HapticKind = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

/** A tap of the phone's vibration motor (iPhone Taptic Engine) inside the RapidFix app; nothing in a browser. */
export function haptic(kind: HapticKind = 'light') {
  if (isNativeApp()) void nativeCall('haptic', kind, 2_000);
}
