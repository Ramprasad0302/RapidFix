import { bookingRoom, userRoom, type SocketEvent } from '@fixora/shared-types';
import { logger } from '../config/logger';
import { getIoOrNull, STAFF_ROOM } from '../sockets';

/** Push an event to one user's private room. A no-op when sockets aren't running (tests, scripts). */
export function emitToUser(userId: string, event: SocketEvent, payload: Record<string, unknown>) {
  emitToRooms([userRoom(userId)], event, payload);
}

/**
 * Booking-scoped event: the booking room plus each participant's private room
 * (so it arrives even before a screen joins the room). Socket.IO delivers once
 * per socket even when it sits in several of these rooms.
 */
export function emitBookingEvent(bookingId: string, participantUserIds: string[], event: SocketEvent, payload: Record<string, unknown>, opts: { staff?: boolean } = {}) {
  emitToRooms([bookingRoom(bookingId), ...participantUserIds.map(userRoom), ...(opts.staff ? [STAFF_ROOM] : [])], event, { bookingId, ...payload });
}

export function emitToStaff(event: SocketEvent, payload: Record<string, unknown>) {
  emitToRooms([STAFF_ROOM], event, payload);
}

function emitToRooms(rooms: string[], event: SocketEvent, payload: Record<string, unknown>) {
  const io = getIoOrNull();
  if (!io) return;
  try {
    io.to(rooms).emit(event, payload);
  } catch (err) {
    logger.warn({ err, event }, 'socket emit failed');
  }
}
