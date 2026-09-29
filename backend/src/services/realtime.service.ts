import { userRoom, type SocketEvent } from '@fixora/shared-types';
import { logger } from '../config/logger';
import { getIoOrNull } from '../sockets';

/** Push an event to one user's private room. A no-op when sockets aren't running (tests, scripts). */
export function emitToUser(userId: string, event: SocketEvent, payload: Record<string, unknown>) {
  const io = getIoOrNull();
  if (!io) return;
  try {
    io.to(userRoom(userId)).emit(event, payload);
  } catch (err) {
    logger.warn({ err, event }, 'socket emit failed');
  }
}
