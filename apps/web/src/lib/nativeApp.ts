/**
 * Bridge to the RapidFix Android app (android-app/). Inside the app the page
 * runs in the app's own WebView, which has no web push or Notification API —
 * the app provides those natively through `window.RapidFixNative`.
 *
 *   page → app  {id, cmd, value}
 *   app → page  {id, result} | {event: 'token' | 'state' | 'navigate' | 'push', ...}
 */

export type NativePermission = 'granted' | 'denied' | 'default';

export interface NativeState {
  platform: 'android';
  version: string;
  permission: NativePermission;
  token: string | null;
  batteryRestricted: boolean;
  /** Android location permission: granted, blocked ("denied"), or not asked yet. */
  location?: NativePermission;
  /** Technician "online for jobs" background service is running. */
  onDuty?: boolean;
}

interface NativeChannel {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<string>) => void): void;
}

type NativeEvent = Partial<NativeState> & { event: 'token' | 'state' | 'navigate' | 'push'; url?: string; type?: string };

const channel = typeof window !== 'undefined' ? (window as unknown as { RapidFixNative?: NativeChannel }).RapidFixNative : undefined;
const CACHE_KEY = 'rapidfix.nativeState';
const pending = new Map<string, (result: unknown) => void>();
const listeners = new Set<(e: NativeEvent) => void>();
let seq = 0;

/** True inside the RapidFix Android app. */
export const isNativeApp = () => !!channel;

function readCache(): NativeState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as NativeState) : null;
  } catch {
    return null;
  }
}

let state: NativeState | null = channel ? readCache() : null;

function setState(next: Partial<NativeState>) {
  state = { platform: 'android', version: '', permission: 'default', token: null, batteryRestricted: false, ...state, ...next };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

/** Last known app state (synchronous; refreshed on start-up and whenever the app comes back to the front). */
export const nativeState = () => state;

channel?.addEventListener('message', (e) => {
  let msg: { id?: string; result?: unknown } & Partial<NativeEvent>;
  try {
    msg = JSON.parse(e.data) as typeof msg;
  } catch {
    return;
  }
  if (msg.id) {
    pending.get(msg.id)?.(msg.result ?? null);
    pending.delete(msg.id);
    return;
  }
  if (!msg.event) return;
  if (msg.event === 'state') setState(msg);
  if (msg.event === 'token' && msg.token) setState({ token: msg.token });
  listeners.forEach((l) => l(msg as NativeEvent));
});

/** Send a command to the app; resolves with its answer (null outside the app or after 15 s). */
export function nativeCall<T = unknown>(cmd: string, value?: unknown): Promise<T | null> {
  if (!channel) return Promise.resolve(null);
  const id = `m${++seq}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, 15_000);
    pending.set(id, (r) => {
      clearTimeout(timer);
      resolve(r as T);
    });
    channel.postMessage(JSON.stringify({ id, cmd, value }));
  });
}

/** Listen for app events. Returns an unsubscribe function. */
export function onNativeEvent(listener: (e: NativeEvent) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Fetch fresh state from the app (called once at start-up). */
export const nativeReady: Promise<NativeState | null> = channel
  ? nativeCall<NativeState>('hello').then((s) => {
      if (s) setState(s);
      return state;
    })
  : Promise.resolve(null);

/** Ask Android for notification permission (shows the system dialog on Android 13+). */
export async function requestNativeNotificationPermission(): Promise<NativePermission> {
  const r = await nativeCall<NativePermission>('requestNotificationPermission');
  if (r) setState({ permission: r });
  return r ?? 'denied';
}

/** The app's push token, waiting briefly for Firebase on first launch. */
export async function nativePushToken(): Promise<string | null> {
  await nativeReady;
  if (state?.token) return state.token;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      off();
      resolve(null);
    }, 20_000);
    const off = onNativeEvent((e) => {
      if (e.event === 'token' && e.token) {
        clearTimeout(timer);
        off();
        resolve(e.token);
      }
    });
  });
}

/** Technician online: start the background service (job alerts + GPS while the app is closed). */
export async function startNativeDuty(api: string, key: string) {
  const on = await nativeCall<boolean>('startDuty', { api, key });
  setState({ onDuty: !!on });
  return !!on;
}
export async function stopNativeDuty() {
  await nativeCall('stopDuty');
  setState({ onDuty: false });
}

/** Every service, bundled into the app at build time (for the first launch without internet). */
export const nativeCatalogSnapshot = () => nativeCall<string>('catalogSnapshot');

export const openNativeNotificationSettings = () => void nativeCall('openNotificationSettings');
export const openNativeAppSettings = () => void nativeCall('openAppSettings');
export const openNativeBatterySettings = () => void nativeCall('openBatterySettings');
export const setNativeKeepScreenOn = (on: boolean) => void nativeCall('keepScreenOn', on);
export const nativePrint = (title: string) => void nativeCall('print', title);
