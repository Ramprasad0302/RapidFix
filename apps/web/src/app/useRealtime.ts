import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { SocketEvent } from '@fixora/shared-types';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { authStore, useAuth } from '../store/auth';

/**
 * Keeps screens live: any booking event refreshes the affected queries.
 * (Polling stays as a fallback for flaky connections.)
 */
export function useRealtime(queryClient: QueryClient) {
  const userId = useAuth((s) => (s.status === 'authenticated' ? s.user?.id : null));
  const role = useAuth((s) => s.user?.role);

  useEffect(() => {
    if (!userId) {
      disconnectSocket();
      return;
    }
    connectSocket(
      () => authStore.getState().accessToken,
      (event) => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        if (role === 'TECHNICIAN') {
          void queryClient.invalidateQueries({ queryKey: ['tech'] });
          if (event === SocketEvent.BOOKING_REQUEST && 'vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
        } else {
          void queryClient.invalidateQueries({ queryKey: ['customer'] });
        }
      },
    );
    return () => disconnectSocket();
  }, [userId, role, queryClient]);
}
