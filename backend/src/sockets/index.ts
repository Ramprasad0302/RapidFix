import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { bookingRoom, isAdminRole, userRoom, type Role } from '@fixora/shared-types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { bookingAccess } from '../services/access.service';
import { verifyAccessToken } from '../services/token.service';

export interface SocketData {
  userId: string;
  role: Role;
}

/** All staff sockets — live technician map, new-booking alerts. */
export const STAFF_ROOM = 'role:staff';

let io: Server | null = null;

/**
 * Every connection presents a valid access token (`io(url, { auth: { token } })`)
 * and joins its private `user:{id}` room (staff also join `role:staff`).
 * Screens that show one booking emit `join_booking`; membership of
 * `booking:{id}` is granted only to that booking's customer, technician or staff.
 */
export function initSockets(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    // Tolerate slow rural networks before declaring a client gone.
    pingInterval: 25_000,
    pingTimeout: 30_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') throw new Error('missing token');
      const { sub, role } = verifyAccessToken(token);
      (socket.data as SocketData) = { userId: sub, role };
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data as SocketData;
    void socket.join(userRoom(userId));
    if (isAdminRole(role)) void socket.join(STAFF_ROOM);

    socket.on('join_booking', async (bookingId: unknown, ack?: (r: { ok: boolean }) => void) => {
      try {
        if (typeof bookingId !== 'string') throw new Error('bad id');
        await bookingAccess(bookingId, { userId, role });
        await socket.join(bookingRoom(bookingId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });
    socket.on('leave_booking', (bookingId: unknown) => {
      if (typeof bookingId === 'string') void socket.leave(bookingRoom(bookingId));
    });
    logger.debug({ socketId: socket.id, userId, role }, 'socket connected');
  });

  return io;
}

export function getIoOrNull(): Server | null {
  return io;
}
