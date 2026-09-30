import { BookingStatus as B, SocketEvent, type BookingStatus, type ChatInfoDto, type MessageDto, type Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { bookingAccess } from './access.service';
import { emitBookingEvent } from './realtime.service';
import { isOwnUploadPath } from './storage.service';

/** Chat opens once a technician is on the job and closes when the booking is finished. */
const CHAT_OPEN: BookingStatus[] = [
  B.TECHNICIAN_ASSIGNED,
  B.TECHNICIAN_ACCEPTED,
  B.TECHNICIAN_EN_ROUTE,
  B.TECHNICIAN_ARRIVED,
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
  B.SERVICE_COMPLETED,
  B.PAYMENT_PENDING,
  B.DISPUTED,
];

type Auth = { userId: string; role: Role };

const toMessage = (m: {
  id: string;
  bookingId: string;
  senderId: string;
  body: string | null;
  imageUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
  sender: { name: string | null; role: Role };
}): MessageDto => ({
  id: m.id,
  bookingId: m.bookingId,
  senderId: m.senderId,
  senderRole: m.sender.role === 'CUSTOMER' ? 'CUSTOMER' : m.sender.role === 'TECHNICIAN' ? 'TECHNICIAN' : 'STAFF',
  senderName: m.sender.name ?? (m.sender.role === 'CUSTOMER' ? 'Customer' : 'RapidFix'),
  body: m.body,
  imageUrl: m.imageUrl,
  readAt: m.readAt?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

export async function chatInfo(bookingId: string, auth: Auth): Promise<ChatInfoDto> {
  const { booking, as } = await bookingAccess(bookingId, auth);
  const other = as === 'TECHNICIAN' ? { ...booking.customer.user, role: 'CUSTOMER' as const } : booking.technician ? { ...booking.technician.user, role: 'TECHNICIAN' as const } : null;
  return {
    bookingId: booking.id,
    code: booking.code ?? '',
    service: booking.service.name,
    counterpart: {
      name: other?.name ?? (other?.role === 'CUSTOMER' ? 'Customer' : 'Technician'),
      phone: CHAT_OPEN.includes(booking.status) && booking.status !== B.TECHNICIAN_ASSIGNED ? (other?.phone ?? null) : null,
      avatarUrl: other?.avatarUrl ?? null,
      role: other?.role ?? 'TECHNICIAN',
    },
    canSend: as !== 'STAFF' && !!booking.technician && CHAT_OPEN.includes(booking.status),
  };
}

export async function listMessages(bookingId: string, auth: Auth, before?: string): Promise<MessageDto[]> {
  await bookingAccess(bookingId, auth);
  const rows = await prisma.message.findMany({
    where: { bookingId, ...(before && { createdAt: { lt: new Date(before) } }) },
    include: { sender: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.reverse().map(toMessage);
}

export async function sendMessage(bookingId: string, auth: Auth, input: { body?: string; imageUrl?: string }): Promise<MessageDto> {
  const { booking, as, participants } = await bookingAccess(bookingId, auth);
  if (as === 'STAFF') throw AppError.forbidden('Staff can read but not send chat messages.', 'STAFF_READ_ONLY');
  if (!booking.technician || !CHAT_OPEN.includes(booking.status)) {
    throw AppError.conflict('Chat is available while a technician is on your booking.', 'CHAT_CLOSED');
  }
  const body = input.body?.trim() || null;
  if (!body && !input.imageUrl) throw AppError.badRequest('Type a message or add a photo', 'EMPTY_MESSAGE');
  if (input.imageUrl && !isOwnUploadPath(input.imageUrl)) throw AppError.badRequest('Invalid attachment', 'INVALID_ATTACHMENT');

  const m = await prisma.message.create({
    data: { bookingId, senderId: auth.userId, body, imageUrl: input.imageUrl ?? null },
    include: { sender: { select: { name: true, role: true } } },
  });
  const dto = toMessage(m);
  emitBookingEvent(bookingId, participants, SocketEvent.NEW_MESSAGE, { message: dto });

  // Nudge the other side through the notification outbox (push when they're away).
  const recipient = participants.find((p) => p !== auth.userId);
  if (recipient) {
    await prisma.notification.create({
      data: {
        userId: recipient,
        type: 'NEW_MESSAGE',
        title: `${dto.senderName} · ${booking.service.name}`,
        body: body ?? '📷 Photo',
        data: { bookingId },
      },
    });
  }
  return dto;
}

/** Marks the other side's messages as read; tells them via socket (read ticks). */
export async function markRead(bookingId: string, auth: Auth): Promise<number> {
  const { participants } = await bookingAccess(bookingId, auth);
  const { count } = await prisma.message.updateMany({
    where: { bookingId, senderId: { not: auth.userId }, readAt: null },
    data: { readAt: new Date() },
  });
  if (count) emitBookingEvent(bookingId, participants, SocketEvent.MESSAGES_READ, { readerId: auth.userId });
  return count;
}
