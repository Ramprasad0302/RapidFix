import { api } from './api';

/**
 * System notifications for RapidFix.
 *
 * - The service worker (/sw.js) shows notifications and handles taps.
 * - While the app is open, socket events become system notifications when the
 *   tab is in the background.
 * - With Firebase configured (VITE_FIREBASE_*), the device also registers for
 *   web push, so updates arrive even when the app is closed.
 */

type Permission = NotificationPermission | 'unsupported';

const FIREBASE = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined,
};
export const pushConfigured = () => !!(FIREBASE.apiKey && FIREBASE.projectId && FIREBASE.appId && FIREBASE.messagingSenderId && FIREBASE.vapidKey);

const TOKEN_KEY = 'rapidfix.pushToken';
let registration: Promise<ServiceWorkerRegistration | null> = Promise.resolve(null);

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

export function notificationPermission(): Permission {
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

/** True when this device receives web push (then the socket path doesn't duplicate it). */
export const pushActive = () => pushConfigured() && notificationPermission() === 'granted' && !!readToken();

/**
 * Register this device for push with the signed-in account. Safe to call on
 * every login — the server upserts the token to the current user.
 */
export async function enablePush() {
  if (!pushConfigured() || notificationPermission() !== 'granted') return;
  try {
    const reg = await registration;
    if (!reg) return;
    const [{ initializeApp, getApps }, { getMessaging, getToken, isSupported }] = await Promise.all([import('firebase/app'), import('firebase/messaging')]);
    if (!(await isSupported())) return;
    const app = getApps()[0] ?? initializeApp(FIREBASE);
    const token = await getToken(getMessaging(app), { vapidKey: FIREBASE.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return;
    await api.post('/notifications/tokens', { token, platform: 'WEB' });
    writeToken(token);
  } catch {
    // Push is an enhancement; in-app and socket notifications still work.
  }
}

/** Stop pushes to this device for the account that is signing out. */
export async function disablePush() {
  const token = readToken();
  writeToken(null);
  if (token) await api.delete(`/notifications/tokens/${encodeURIComponent(token)}`).catch(() => undefined);
}

/** Show a system notification (when allowed). Used for live socket events while the tab is hidden. */
export async function showSystemNotification(n: { title: string; body?: string; url: string; tag?: string; urgent?: boolean }) {
  if (notificationPermission() !== 'granted') return;
  const reg = await registration;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: n.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: n.tag,
    data: { url: n.url },
    requireInteraction: !!n.urgent,
    vibrate: n.urgent ? [300, 100, 300, 100, 300] : [150],
  };
  if (reg) await reg.showNotification(n.title, options);
  else new Notification(n.title, options);
}
