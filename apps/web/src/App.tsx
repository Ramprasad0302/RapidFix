import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { createQueryClient } from '@fixora/web-core';
import { router } from './app/router';
import { useRealtime } from './app/useRealtime';
import { ToastHost } from './components/ToastHost';
import { authStore } from './store/auth';

export const queryClient = createQueryClient();

// Never let one user's cached data survive into the next session.
authStore.subscribe((state, prev) => {
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
