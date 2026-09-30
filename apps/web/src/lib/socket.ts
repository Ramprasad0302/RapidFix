import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SocketEvent } from '@fixora/shared-types';
import { api } from './api';

/**
 * One Socket.IO connection per signed-in session. The access token is read on
 * every (re)connect, so a refreshed token is picked up automatically. Low-network
 * friendly: long timeouts, automatic reconnection with backoff.
 */
let socket: Socket | null = null;
type Listener = (payload: Record<string, unknown>) => void;
const listeners = new Map<SocketEvent, Set<Listener>>();
/** Booking rooms the open screens want; re-joined after every reconnect. */
const rooms = new Map<string, number>();

export function connectSocket(getToken: () => string | null, onEvent: (event: SocketEvent, payload: Record<string, unknown>) => void) {
  disconnectSocket();
  const s = io(import.meta.env.VITE_SOCKET_URL, {
    auth: (cb) => cb({ token: getToken() }),
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 20_000,
    timeout: 20_000,
  });
  for (const event of Object.values(SocketEvent)) {
    s.on(event, (raw: unknown) => {
      const payload = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      onEvent(event, payload);
      listeners.get(event)?.forEach((l) => l(payload));
    });
  }
  s.on('connect', () => {
    for (const id of rooms.keys()) s.emit('join_booking', id);
  });
  s.on('connect_error', (err) => {
    // Expired access token: touch an authenticated endpoint (which refreshes it), then retry.
    if (err.message === 'UNAUTHORIZED') {
      setTimeout(() => {
        void api
          .get('/auth/me')
          .then(() => s.connect())
          .catch(() => undefined);
      }, 1500);
    }
  });
  socket = s;
  return s;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/** Join `booking:{id}` while the calling screen is mounted (server checks access). */
export function useBookingRoom(bookingId: string | null | undefined) {
  useEffect(() => {
    if (!bookingId) return;
    rooms.set(bookingId, (rooms.get(bookingId) ?? 0) + 1);
    if (socket?.connected) socket.emit('join_booking', bookingId);
    return () => {
      const n = (rooms.get(bookingId) ?? 1) - 1;
      if (n > 0) {
        rooms.set(bookingId, n);
        return;
      }
      rooms.delete(bookingId);
      socket?.emit('leave_booking', bookingId);
    };
  }, [bookingId]);
}

/** Subscribe to one socket event for the lifetime of the component. */
export function useSocketEvent(event: SocketEvent, handler: Listener) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const l: Listener = (p) => ref.current(p);
    const set = listeners.get(event) ?? new Set();
    set.add(l);
    listeners.set(event, set);
    return () => {
      set.delete(l);
    };
  }, [event]);
}
