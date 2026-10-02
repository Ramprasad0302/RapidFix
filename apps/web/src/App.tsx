import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@fixora/web-core';
import { router } from './app/router';
import { useRealtime } from './app/useRealtime';
import { OfflineBanner } from './components/OfflineBanner';
import { ToastHost } from './components/ToastHost';
import { onNativeEvent } from './lib/nativeApp';
import { enablePush, registerServiceWorker } from './lib/notifications';
import { persistQueryCache, warmCatalog } from './lib/offlineCache';
import { unlockAudio } from './lib/ringtone';
import { authStore } from './store/auth';

export const queryClient = createQueryClient();

// Offline: show saved data straight away, and keep the full catalogue on the device.
persistQueryCache(queryClient);
const warm = () => void warmCatalog(queryClient);
if ('requestIdleCallback' in window) window.requestIdleCallback(() => setTimeout(warm, 3000));
else setTimeout(warm, 5000);
window.addEventListener('online', warm);

// Service worker: installable app, offline page, system notifications; taps route inside the app.
registerServiceWorker((path) => void router.navigate(path));

// Android app: a tapped notification opens its page here.
onNativeEvent((e) => {
  if (e.event !== 'navigate' || !e.url) return;
  const u = new URL(e.url, location.origin);
  void router.navigate(u.pathname + u.search);
});

// Browsers allow sound only after a tap: unlock it on the first one so a job request can ring.
window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });

// Never let one user's cached data survive into the next session.
authStore.subscribe((state, prev) => {
  // Each sign-in (re)links this device's push token to the account.
  if (state.status === 'authenticated' && (prev.status !== 'authenticated' || state.user?.id !== prev.user?.id)) void enablePush();
  if (prev.status === 'authenticated' && (state.status !== 'authenticated' || state.user?.id !== prev.user?.id)) {
    queryClient.clear();
  }
});

export function App() {
  useRealtime(queryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ToastHost />
      <OfflineBanner />
    </QueryClientProvider>
  );
}
