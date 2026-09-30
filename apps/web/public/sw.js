/* RapidFix service worker: install-to-home-screen, offline fallback,
   system notifications and web push (Firebase Cloud Messaging payloads). */
const CACHE = 'rapidfix-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/brand/logo-full.webp'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Pages always come from the network (fresh deploys); only when the device is
// offline do we show the branded offline page. API calls are never cached.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

function show(title, options) {
  return self.registration.showNotification(title || 'RapidFix', {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    ...options,
  });
}

// Push from FCM (sent by the API): { notification: { title, body }, data: { url, type, bookingId, ... } }
self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: 'RapidFix', body: event.data ? event.data.text() : '' } };
  }
  const n = payload.notification || {};
  const data = payload.data || {};
  const urgent = data.type === 'NEW_JOB';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // The open app already shows this as an in-app toast.
      if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      return show(n.title, {
      body: n.body,
      data,
      tag: data.notificationId || data.bookingId || undefined,
      renotify: !!data.bookingId,
      requireInteraction: urgent,
      vibrate: urgent ? [300, 100, 300, 100, 300] : [150],
      });
    }),
  );
});

// Tap → focus an open RapidFix tab (and route it) or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        win.postMessage({ type: 'rapidfix:navigate', url });
        return win.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
