import { describe, expect, it } from 'vitest';
import { BOOKING_TRANSITIONS, BookingStatus as S, canTransition } from '@fixora/shared-types';

describe('booking state machine', () => {
  it('allows the happy path end to end', () => {
    const path = [
      S.PENDING,
      S.SEARCHING,
      S.TECHNICIAN_ASSIGNED,
      S.TECHNICIAN_ACCEPTED,
      S.TECHNICIAN_EN_ROUTE,
      S.TECHNICIAN_ARRIVED,
      S.SERVICE_STARTED,
      S.ADDITIONAL_CHARGE_REQUESTED,
      S.ADDITIONAL_CHARGE_APPROVED,
      S.SERVICE_COMPLETED,
      S.PAYMENT_PENDING,
      S.PAYMENT_COMPLETED,
    ];
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });

  it('rejects skipping steps', () => {
    expect(canTransition(S.SEARCHING, S.SERVICE_STARTED)).toBe(false);
    expect(canTransition(S.TECHNICIAN_ASSIGNED, S.SERVICE_COMPLETED)).toBe(false);
    expect(canTransition(S.PENDING, S.PAYMENT_COMPLETED)).toBe(false);
  });

  it('does not let a customer cancel once work has started', () => {
    expect(canTransition(S.SERVICE_STARTED, S.CUSTOMER_CANCELLED)).toBe(false);
    expect(canTransition(S.TECHNICIAN_ARRIVED, S.CUSTOMER_CANCELLED)).toBe(false);
  });

  it('sends a rejected assignment back to searching', () => {
    expect(canTransition(S.TECHNICIAN_ASSIGNED, S.SEARCHING)).toBe(true);
  });

  it('REFUNDED is terminal and every status has an entry', () => {
    expect(BOOKING_TRANSITIONS[S.REFUNDED]).toHaveLength(0);
    for (const s of Object.values(S)) expect(BOOKING_TRANSITIONS[s]).toBeDefined();
  });
});
