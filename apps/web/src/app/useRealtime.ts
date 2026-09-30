import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { isAdminRole, SocketEvent, type BookingDetailDto, type MessageDto } from '@fixora/shared-types';
import { notificationLink } from '@fixora/shared-utils';
import { pushActive, showSystemNotification } from '../lib/notifications';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { authStore, useAuth } from '../store/auth';
import { toast } from '../store/toast';

/** Chat screens register here so a message arriving on an open chat isn't also toasted. */
export const openChats = new Set<string>();

/**
 * Keeps screens live. Location pings patch the cache in place (no refetch);
 * chat messages are appended; every other booking event refreshes the affected
 * queries. Polling stays as a slow fallback for flaky connections.
 */
export function useRealtime(queryClient: QueryClient) {
  const userId = useAuth((s) => (s.status === 'authenticated' ? s.user?.id : null));
  const role = useAuth((s) => s.user?.role);

  useEffect(() => {
    if (!userId || !role) {
      disconnectSocket();
      return;
    }
    const staff = isAdminRole(role);
    connectSocket(
      () => authStore.getState().accessToken,
      (event, p) => {
        const bookingId = typeof p.bookingId === 'string' ? p.bookingId : null;

        if (event === SocketEvent.TECHNICIAN_LOCATION_UPDATED) {
          if (bookingId && typeof p.lat === 'number' && typeof p.lng === 'number') {
            queryClient.setQueryData<BookingDetailDto>(['customer', 'booking', bookingId], (b) =>
              b?.technician
                ? {
                    ...b,
                    technician: {
                      ...b.technician,
                      location: { lat: p.lat as number, lng: p.lng as number },
                      distanceKm: (p.distanceKm as number | null) ?? b.technician.distanceKm,
                      etaMinutes: (p.etaMinutes as number | null) ?? b.technician.etaMinutes,
                    },
                  }
                : b,
            );
          }
          return; // staff live map listens with useSocketEvent
        }

        if (event === SocketEvent.NEW_MESSAGE && bookingId) {
          const message = p.message as MessageDto | undefined;
          if (message) {
            queryClient.setQueryData<MessageDto[]>(['chat', bookingId, 'messages'], (list) =>
              list && !list.some((m) => m.id === message.id) ? [...list, message] : list,
            );
          }
          return;
        }
        if (event === SocketEvent.MESSAGES_READ && bookingId) {
          void queryClient.invalidateQueries({ queryKey: ['chat', bookingId, 'messages'] });
          return;
        }

        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        if (event === SocketEvent.NOTIFICATION) {
          const chatFor = (p.data as { bookingId?: string } | null)?.bookingId;
          const muted = p.type === 'NEW_MESSAGE' && chatFor && openChats.has(chatFor);
          if (typeof p.title === 'string' && !muted) {
            if (document.visibilityState === 'visible') toast(p.title);
            // Backgrounded tab: raise a system notification (unless web push already delivers it).
            else if (!pushActive()) {
              const type = typeof p.type === 'string' ? p.type : '';
              void showSystemNotification({
                title: p.title,
                body: typeof p.body === 'string' ? p.body : undefined,
                url: notificationLink(role, type, p.data as Record<string, unknown> | null),
                tag: typeof p.id === 'string' ? p.id : undefined,
                urgent: type === 'NEW_JOB',
              });
            }
          }
          return;
        }

        if (role === 'TECHNICIAN') {
          void queryClient.invalidateQueries({ queryKey: ['tech'] });
          if (event === SocketEvent.BOOKING_REQUEST && 'vibrate' in navigator) navigator.vibrate?.([200, 100, 200]);
        } else if (staff) {
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
        } else {
          void queryClient.invalidateQueries({ queryKey: ['customer'] });
        }
      },
    );
    return () => disconnectSocket();
  }, [userId, role, queryClient]);
}
