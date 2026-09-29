import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@fixora/web-core';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { authStore } from './store/authStore';

const queryClient = createQueryClient();

// Never let one user's cached data survive into the next session.
authStore.subscribe((state, prev) => {
  if (prev.status === 'authenticated' && state.status !== 'authenticated') queryClient.clear();
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
