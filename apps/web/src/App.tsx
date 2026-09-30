import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@fixora/web-core';
import { router } from './app/router';
import { useRealtime } from './app/useRealtime';
import { ToastHost } from './components/ToastHost';
import { enablePush, registerServiceWorker } from './lib/notifications';
import { unlockAudio } from './lib/ringtone';
import { authStore } from './store/auth';

export const queryClient = createQueryClient();

// Service worker: installable app, offline page, system notifications; taps route inside the app.
registerServiceWorker((path) => void router.navigate(path));

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
    </QueryClientProvider>
  );
}
