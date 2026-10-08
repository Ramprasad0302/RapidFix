import { api } from './api';
import { firebaseConfigured, getFirebaseApp } from './firebase';
import { isNativeApp, nativePlatform, nativePushToken, nativeState, onNativeEvent, requestNativeNotificationPermission } from './nativeApp';
import { RUNTIME } from './runtimeConfig';

/**
 * System notifications for RapidFix.
 *
 * - The service worker (/sw.js) shows notifications and handles taps.
 * - While the app is open, socket events become system notifications when the
 *   tab is in the background.
 * - With Firebase configured (VITE_FIREBASE_*), the device also registers for
 *   web push, so updates arrive even when the app is closed.
 * - Inside the RapidFix Android app (lib/nativeApp.ts) the app itself holds the
 *   permission and the push token, and shows notifications while closed.
 */

type Permission = NotificationPermission | 'unsupported';

const VAPID_KEY = RUNTIME.firebase.vapidKey;
export const pushConfigured = () => firebaseConfigured() && !!RUNTIME.firebase.messagingSenderId && !!VAPID_KEY;

const TOKEN_KEY = 'rapidfix.pushToken';
let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null);

export const notificationsSupported = () =>
  isNativeApp() || (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator);

export function notificationPermission(): Permission {
  if (isNativeApp()) return nativeState()?.permission ?? 'default';
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Register the service worker once at start-up. Tapping a notification posts the URL back to us. */
export function registerServiceWorker(onNavigate: (path: string) => void) {
  if (!('serviceWorker' in navigator)) return;
  registration = navigator.serviceWorker.register('/sw.js').catch(() => null);
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; url?: string }>) => {
    if (e.data?.type === 'rapidfix:navigate' && e.data.url) {
      const u = new URL(e.data.url, location.origin);
      onNavigate(u.pathname + u.search);
    }
  });
}

/** Must be called from a user gesture (button tap) — browsers block it otherwise. */
export async function requestNotificationPermission(): Promise<Permission> {
  if (isNativeApp()) {
    const result = await requestNativeNotificationPermission();
    if (result === 'granted') void enablePush();
    return result;
  }
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  const result = await Notification.requestPermission();
  if (result === 'granted') void enablePush();
  return result;
}

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** True when this device receives push (then the socket path doesn't duplicate it). */
export const pushActive = () => isNativeApp() || (pushConfigured() && notificationPermission() === 'granted' && !!readToken());

/** Set while someone is signed in, so a refreshed app token is re-registered. */
let pushWanted = false;

onNativeEvent((e) => {
  if (e.event === 'token' && pushWanted && e.token !== readToken()) void enablePush();
});

/** Android / iPhone app: register the app's push token (works while the app is closed). */
async function enableNativePush() {
  const token = await nativePushToken();
  if (!token || !pushWanted) return;
  try {
    await api.post('/notifications/tokens', { token, platform: nativePlatform() === 'ios' ? 'IOS' : 'ANDROID' });
    writeToken(token);
  } catch {
    // Retried on the next sign-in or app start.
  }
}

/**
 * Register this device for push with the signed-in account. Safe to call on
 * every login — the server upserts the token to the current user.
 */
export async function enablePush() {
  pushWanted = true;
  if (isNativeApp()) return enableNativePush();
  if (!pushConfigured() || notificationPermission() !== 'granted') return;
  try {
    const reg = await registration;
    if (!reg) return;
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;
    const app = await getFirebaseApp();
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return;
    await api.post('/notifications/tokens', { token, platform: 'WEB' });
    writeToken(token);
  } catch {
    // Push is an enhancement; in-app and socket notifications still work.
  }
}

/** Stop pushes to this device for the account that is signing out. */
export async function disablePush() {
  pushWanted = false;
  const token = readToken();
  writeToken(null);
  if (token) await api.delete(`/notifications/tokens/${encodeURIComponent(token)}`).catch(() => undefined);
}

/** Show a system notification (when allowed). Used for live socket events while the tab is hidden. */
export async function showSystemNotification(n: { title: string; body?: string; url: string; tag?: string; urgent?: boolean }) {
  if (isNativeApp() || notificationPermission() !== 'granted') return; // the app shows its own
  const reg = await registration;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: n.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: n.tag,
    data: { url: n.url },
    requireInteraction: !!n.urgent,
    vibrate: n.urgent ? [300, 100, 300, 100, 300] : [150],
  };
  if (reg) await reg.showNotification(n.title, options);
  else new Notification(n.title, options);
}
