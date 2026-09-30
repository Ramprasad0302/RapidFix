import { isAdminRole, type Role } from '@fixora/shared-types';

/**
 * Where tapping a notification should land, for the signed-in role.
 * Used by the web app (toasts, system notifications) and by the server for push links.
 */
export function notificationLink(role: Role, type: string, data: Record<string, unknown> | null | undefined): string {
  const bookingId = typeof data?.bookingId === 'string' ? data.bookingId : null;
  if (isAdminRole(role)) {
    if (type === 'COMPLAINT') return '/admin/complaints';
    if (type === 'NEW_TECHNICIAN') return '/admin/technicians';
    return bookingId ? `/admin/bookings?id=${bookingId}` : '/admin';
  }
  if (role === 'TECHNICIAN') {
    if (!bookingId) return type === 'PAYMENT' ? '/technician/earnings' : '/technician/notifications';
    return type === 'NEW_MESSAGE' ? `/technician/jobs/${bookingId}/chat` : type === 'NEW_JOB' ? '/technician' : `/technician/jobs/${bookingId}`;
  }
  if (!bookingId) return '/notifications';
  return type === 'NEW_MESSAGE' ? `/bookings/${bookingId}/chat` : `/bookings/${bookingId}`;
}
