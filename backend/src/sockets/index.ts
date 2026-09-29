import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';

let io: Server | null = null;

/**
 * Socket.IO bootstrap. Authentication (JWT handshake), booking rooms and
 * domain events are wired in Phase 2 / Phase 7.
 */
export function initSockets(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGINS, credentials: true },
    // Tolerate slow rural networks before declaring a client gone.
    pingInterval: 25_000,
    pingTimeout: 30_000,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}
