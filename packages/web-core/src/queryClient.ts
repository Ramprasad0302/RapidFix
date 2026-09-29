import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './apiClient';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        // Retry only transient failures; a 4xx will not fix itself.
        retry: (failureCount, error) =>
          failureCount < 3 &&
          (!(error instanceof ApiRequestError) || error.isNetworkError || (error.status ?? 0) >= 500),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      },
      mutations: { retry: false },
    },
  });
}
