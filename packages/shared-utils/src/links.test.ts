import { describe, expect, it } from 'vitest';
import { notificationLink } from './links';

describe('notificationLink', () => {
  it('routes each role to its own area', () => {
    expect(notificationLink('CUSTOMER', 'TECHNICIAN_EN_ROUTE', { bookingId: 'b1' })).toBe('/bookings/b1');
    expect(notificationLink('CUSTOMER', 'NEW_MESSAGE', { bookingId: 'b1' })).toBe('/bookings/b1/chat');
    expect(notificationLink('TECHNICIAN', 'NEW_JOB', { bookingId: 'b1' })).toBe('/technician');
    expect(notificationLink('TECHNICIAN', 'PAYMENT', { bookingId: 'b1' })).toBe('/technician/jobs/b1');
    expect(notificationLink('SUPPORT', 'COMPLAINT', {})).toBe('/admin/complaints');
    expect(notificationLink('CUSTOMER', 'ANNOUNCEMENT', null)).toBe('/notifications');
  });
});
