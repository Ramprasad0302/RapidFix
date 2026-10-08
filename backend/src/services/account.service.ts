import { unlink } from 'node:fs/promises';
import { isAdminRole, Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { BookingStatus as B } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { recordAudit } from './audit.service';
import { isOwnPrivatePath, privateFilePath } from './storage.service';
import { revokeAllForUser } from './token.service';

/** Bookings in these states are finished — anything else is still open. */
const FINISHED = [B.PAYMENT_COMPLETED, B.CUSTOMER_CANCELLED, B.ADMIN_CANCELLED, B.TECHNICIAN_CANCELLED, B.REFUNDED, B.NO_SHOW];

/**
 * "Delete my account" (Google Play account-deletion requirement).
 *
 * Personal data is erased: name, phone, email, photo, date of birth, saved
 * addresses, devices, notifications, KYC documents and payout details. Booking,
 * invoice and payment records are kept — anonymised — because tax law requires
 * them. The phone number is freed, so the person can sign up again later as new.
 */
export async function deleteAccount(userId: string, ip?: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { customer: { select: { id: true } }, technician: { select: { id: true, wallet: { select: { balance: true } } } } },
  });
  if (isAdminRole(user.role)) throw AppError.forbidden('Staff accounts are removed by a super admin.', 'STAFF_ACCOUNT');

  const open = await prisma.booking.count({
    where: {
      status: { notIn: FINISHED },
      OR: [...(user.customer ? [{ customerId: user.customer.id }] : []), ...(user.technician ? [{ technicianId: user.technician.id }] : [])],
    },
  });
  if (open) throw AppError.conflict('Please finish or cancel your open bookings before deleting your account.', 'OPEN_BOOKINGS');
  if ((user.technician?.wallet?.balance ?? 0) > 0) {
    throw AppError.conflict('You have unpaid earnings. Please contact RapidFix support to settle them before deleting your account.', 'WALLET_BALANCE');
  }

  const documents = user.technician ? await prisma.technicianDocument.findMany({ where: { technicianId: user.technician.id }, select: { fileUrl: true } }) : [];

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { name: 'Deleted user', phone: null, email: null, avatarUrl: null, dateOfBirth: null, passwordHash: null, status: 'BLOCKED' },
    });
    await tx.notificationToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    if (user.customer) {
      // Addresses used by past bookings stay linked (the booking keeps its own copy); all are hidden and cleared.
      await tx.address.updateMany({
        where: { customerId: user.customer.id },
        data: { deletedAt: new Date(), isDefault: false, houseNo: '—', street: '', landmark: '', latitude: null, longitude: null },
      });
      await tx.customer.update({ where: { id: user.customer.id }, data: { city: null, notificationsEnabled: false, marketingOptIn: false } });
    }
    if (user.technician) {
      await tx.technicianDocument.deleteMany({ where: { technicianId: user.technician.id } });
      await tx.technician.update({
        where: { id: user.technician.id },
        data: {
          verificationStatus: 'BLOCKED',
          isOnline: false,
          bio: null,
          addressLine: '',
          alternatePhone: null,
          baseLatitude: null,
          baseLongitude: null,
          lastLatitude: null,
          lastLongitude: null,
          payoutUpiId: null,
          bankAccountHolder: null,
          bankIfsc: null,
          bankAccountEnc: null,
          bankAccountLast4: null,
        },
      });
    }
  });
  await revokeAllForUser(userId);
  // KYC files are removed from disk after the database change is safely committed.
  for (const d of documents) {
    if (!isOwnPrivatePath(d.fileUrl)) continue;
    await prisma.privateFile.deleteMany({ where: { path: d.fileUrl } });
    await unlink(privateFilePath(d.fileUrl)).catch(() => undefined);
  }
  await recordAudit({ actorId: userId, actorRole: user.role as Role, action: 'ACCOUNT_DELETED', entity: 'User', entityId: userId, ip }).catch((err) =>
    logger.warn({ err }, 'account deletion audit failed'),
  );
}
