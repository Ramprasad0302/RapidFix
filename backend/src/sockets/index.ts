import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { userRoom, type Role } from '@fixora/shared-types';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../services/token.service';

export interface SocketData {
  userId: string;
  role: Role;
}

let io: Server | null = null;

/**
 * Socket.IO bootstrap. Every connection must present a valid access token
 * (`io(url, { auth: { token } })`) and is joined to its private `user:{id}` room.
 * Booking rooms and domain events are added in Phase 7.
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
    logger.debug({ socketId: socket.id, userId, role }, 'socket connected');
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}
