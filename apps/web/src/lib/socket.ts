import { io, type Socket } from 'socket.io-client';
import { SocketEvent } from '@fixora/shared-types';
import { api } from './api';

/**
 * One Socket.IO connection per signed-in session. The access token is read on
 * every (re)connect, so a refreshed token is picked up automatically. Low-network
 * friendly: long timeouts, automatic reconnection with backoff.
 */
let socket: Socket | null = null;

export function connectSocket(getToken: () => string | null, onEvent: (event: SocketEvent, payload: unknown) => void) {
  disconnectSocket();
  const s = io(import.meta.env.VITE_SOCKET_URL, {
    auth: (cb) => cb({ token: getToken() }),
    transports: ['websocket', 'polling'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 20_000,
    timeout: 20_000,
  });
  for (const event of Object.values(SocketEvent)) s.on(event, (payload: unknown) => onEvent(event, payload));
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
