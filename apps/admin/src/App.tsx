import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@fixora/web-core';
import { RouterProvider } from 'react-router';
import { router } from './routes';

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
