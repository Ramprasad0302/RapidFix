import { describe, expect, it } from 'vitest';
import { fcmMessage } from '../src/services/push.service';

describe('FCM message per device', () => {
  const msg = { title: 'New service request', body: 'Fan repair · 2 km away', data: { type: 'NEW_JOB', url: '/technician', bookingId: 'b1' } };

  it('Android app gets a data-only, high-priority message so it rings while closed', () => {
    const m = fcmMessage('tok', 'ANDROID', msg);
    expect(m).not.toHaveProperty('notification');
    expect(m).toMatchObject({ data: { title: msg.title, body: msg.body, type: 'NEW_JOB', bookingId: 'b1' }, android: { priority: 'high', ttl: '300s' } });
  });

  it('browsers get a notification message with a link', () => {
    const m = fcmMessage('tok', 'WEB', msg);
    expect(m).toMatchObject({ notification: { title: msg.title }, webpush: { headers: { Urgency: 'high' } } });
    expect((m as { webpush: { fcm_options: { link: string } } }).webpush.fcm_options.link).toMatch(/\/technician$/);
  });

  it('iPhone app gets an Apple alert that rings the chosen tone and expires with the offer', () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const m = fcmMessage('tok', 'IOS', { ...msg, data: { ...msg.data, expiresAt } }) as unknown as {
      apns: { headers: Record<string, string>; payload: { aps: Record<string, unknown> } };
    };
    expect(m).toMatchObject({ notification: { title: msg.title, body: msg.body } });
    expect(m.apns.payload.aps).toMatchObject({ sound: 'rapidfix_alert.caf', 'interruption-level': 'time-sensitive' });
    expect(m.apns.headers['apns-expiration']).toBe(String(Math.floor(Date.parse(expiresAt) / 1000)));
    expect(m.apns.headers['apns-collapse-id']).toBe('job-b1');

    const update = fcmMessage('tok', 'IOS', { title: 'Booking confirmed', body: 'x', data: { type: 'BOOKING' } }) as unknown as typeof m;
    expect(update.apns.payload.aps).toMatchObject({ sound: 'default', 'interruption-level': 'active' });
    expect(update.apns.headers).not.toHaveProperty('apns-expiration');
  });
});
