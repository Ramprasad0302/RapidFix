/* RapidFix service worker: works offline (app shell + static files cached on the
   device), install-to-home-screen, system notifications and web push (FCM).

   App data (services, bookings, profile) is saved separately by the page
   (src/lib/offlineCache.ts); this worker never caches API responses. */

// Replaced at build time (vite.config.ts → offlineShell plugin): build id + every built file.
const BUILD = 'dev';
const PRECACHE = [];

const SHELL = 'rapidfix-shell-' + BUILD;
const RUNTIME = 'rapidfix-runtime-v1';
const INDEX = '/index.html';
const OFFLINE_URL = '/offline.html';
const NAV_TIMEOUT_MS = 4000;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// Saved copies are matched by URL only: script requests carry headers (Origin,
// Accept-Encoding) that a server's Vary header would otherwise make "different".
const MATCH = { ignoreVary: true };
const match = (req) => caches.match(typeof req === 'string' ? req : req.url, MATCH);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // One failed file must not stop the rest from being cached.
      .then((c) => Promise.allSettled([INDEX, OFFLINE_URL, ...PRECACHE].map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Keep this build and the one before it (a page opened before the update may still load its chunks).
        const shells = keys.filter((k) => k.startsWith('rapidfix-shell-') && k !== SHELL).sort().reverse();
        const stale = keys.filter((k) => k.startsWith('rapidfix-') && k !== SHELL && k !== RUNTIME && k !== shells[0]);
        return Promise.all(stale.map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

/** Pages: fresh from the network when it answers quickly, otherwise the saved app shell. */
async function navigate(request) {
  const cache = await caches.open(SHELL);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(INDEX, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    /* offline */
  }
  const saved = (await match(INDEX)) || (await match(OFFLINE_URL));
  if (saved) {
    network.catch(() => undefined);
    return saved;
  }
  return network; // nothing saved yet: wait for the network
}

/** Built files have content hashes: cached copy forever. */
async function cacheFirst(request) {
  const hit = await match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone());
  return res;
}

/** Icons, images, sounds, fonts: answer from the device, refresh in the background. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') return event.respondWith(navigate(request));
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request));
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/uploads/')) return;
    return event.respondWith(staleWhileRevalidate(request));
  }
  if (FONT_HOSTS.includes(url.hostname)) event.respondWith(staleWhileRevalidate(request));
});

function show(title, options) {
  return self.registration.showNotification(title || 'RapidFix', {
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
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
      // A new job stays on screen and vibrates like a call until the technician opens it.
      requireInteraction: urgent,
      vibrate: urgent ? [600, 200, 600, 200, 600, 200, 600, 200, 600] : [150],
      silent: false,
      ...(urgent && { actions: [{ action: 'open', title: 'View & accept' }] }),
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
