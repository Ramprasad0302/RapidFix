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
});
