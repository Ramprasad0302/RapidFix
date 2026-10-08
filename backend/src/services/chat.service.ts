import { BookingStatus as B, SocketEvent, type BookingStatus, type ChatInfoDto, type MessageDto, type Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { bookingAccess } from './access.service';
import { emitBookingEvent } from './realtime.service';
import { raiseComplaint } from './work.service';
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

/** Who blocked whom on this booking's chat: 'me', 'them' or null. */
async function blockState(bookingId: string, userId: string): Promise<ChatInfoDto['blockedBy']> {
  const blocks = await prisma.chatBlock.findMany({ where: { bookingId }, select: { blockerId: true } });
  if (blocks.some((b) => b.blockerId === userId)) return 'me';
  return blocks.length ? 'them' : null;
}

export async function chatInfo(bookingId: string, auth: Auth): Promise<ChatInfoDto> {
  const { booking, as } = await bookingAccess(bookingId, auth);
  const other = as === 'TECHNICIAN' ? { ...booking.customer.user, role: 'CUSTOMER' as const } : booking.technician ? { ...booking.technician.user, role: 'TECHNICIAN' as const } : null;
  const blockedBy = as === 'STAFF' ? null : await blockState(bookingId, auth.userId);
  return {
    bookingId: booking.id,
    code: booking.code ?? '',
    service: booking.service.name,
    counterpart: {
      name: other?.name ?? (other?.role === 'CUSTOMER' ? 'Customer' : 'Technician'),
      phone: !blockedBy && CHAT_OPEN.includes(booking.status) && booking.status !== B.TECHNICIAN_ASSIGNED ? (other?.phone ?? null) : null,
      avatarUrl: other?.avatarUrl ?? null,
      role: other?.role ?? 'TECHNICIAN',
    },
    canSend: as !== 'STAFF' && !blockedBy && !!booking.technician && CHAT_OPEN.includes(booking.status),
    blockedBy,
  };
}

export async function listMessages(bookingId: string, auth: Auth, before?: string): Promise<MessageDto[]> {
  const { as } = await bookingAccess(bookingId, auth);
  // Someone you blocked: their messages are hidden from you.
  const hideOthers = as !== 'STAFF' && (await blockState(bookingId, auth.userId)) === 'me';
  const rows = await prisma.message.findMany({
    where: { bookingId, ...(hideOthers && { senderId: auth.userId }), ...(before && { createdAt: { lt: new Date(before) } }) },
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
  if (await blockState(bookingId, auth.userId)) throw AppError.conflict('This chat is closed. Contact RapidFix support if you need help.', 'CHAT_BLOCKED');
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

// ─── Report & block (App Store guideline 1.2) ────────────────────────────

/**
 * Report the other person in this chat: support gets a complaint with the
 * recent conversation attached (reviewed within 24 hours). Optionally blocks them too.
 */
export async function reportChat(bookingId: string, auth: Auth, input: { reason: string; details?: string; block: boolean }) {
  const { booking, as } = await bookingAccess(bookingId, auth);
  if (as === 'STAFF') throw AppError.forbidden('Staff can read but not report chats.', 'STAFF_READ_ONLY');
  const recent = await prisma.message.findMany({
    where: { bookingId, senderId: { not: auth.userId } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { body: true, imageUrl: true, createdAt: true },
  });
  const transcript = recent
    .reverse()
    .map((m) => `[${m.createdAt.toISOString().slice(0, 16).replace('T', ' ')}] ${m.body ?? ''}${m.imageUrl ? ` (photo: ${m.imageUrl})` : ''}`)
    .join('\n');
  const who = as === 'CUSTOMER' ? 'technician' : 'customer';
  await raiseComplaint(auth, {
    bookingId,
    category: 'Chat message',
    subject: `Reported ${who} in chat · ${booking.code ?? booking.id.slice(0, 8)}`.slice(0, 160),
    description: [`Reason: ${input.reason}`, input.details?.trim(), input.block ? 'The reporter also blocked this person.' : null, transcript && `Their recent messages:\n${transcript}`]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 6000),
  });
  if (input.block) await blockChat(bookingId, auth);
  return chatInfo(bookingId, auth);
}

export async function blockChat(bookingId: string, auth: Auth) {
  const { as } = await bookingAccess(bookingId, auth);
  if (as === 'STAFF') throw AppError.forbidden('Staff can read but not block chats.', 'STAFF_READ_ONLY');
  await prisma.chatBlock.upsert({
    where: { bookingId_blockerId: { bookingId, blockerId: auth.userId } },
    create: { bookingId, blockerId: auth.userId },
    update: {},
  });
  return chatInfo(bookingId, auth);
}

export async function unblockChat(bookingId: string, auth: Auth) {
  await bookingAccess(bookingId, auth);
  await prisma.chatBlock.deleteMany({ where: { bookingId, blockerId: auth.userId } });
  return chatInfo(bookingId, auth);
}
