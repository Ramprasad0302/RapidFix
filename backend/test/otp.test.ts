import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { env } from '../src/config/env';
import { Msg91OtpProvider, otpProvider } from '../src/services/otp';
import { AppError } from '../src/utils/AppError';
import { API, request, resetDb } from './helpers';

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});
afterAll(() => prisma.$disconnect());

describe('MSG91 provider', () => {
  it('posts the code to the flow API without the + prefix', async () => {
    Object.assign(env, { OTP_API_KEY: 'test-auth-key', OTP_TEMPLATE_ID: 'tmpl_1' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ type: 'success' }), { status: 200 }));
    await new Msg91OtpProvider().send({ phone: '+919876543210', code: '482913', expiresInSeconds: 300 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://control.msg91.com/api/v5/flow');
    expect((init!.headers as Record<string, string>).authkey).toBe('test-auth-key');
    expect(JSON.parse(init!.body as string)).toMatchObject({ template_id: 'tmpl_1', recipients: [{ mobiles: '919876543210', otp: '482913' }] });
  });

  it('turns a provider rejection into a friendly 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ type: 'error', message: 'Invalid template' }), { status: 200 }));
    await expect(new Msg91OtpProvider().send({ phone: '+919876543210', code: '111111', expiresInSeconds: 300 })).rejects.toMatchObject({ statusCode: 503, code: 'OTP_SEND_FAILED' });
  });
});

describe('send-otp when SMS delivery fails', () => {
  it('does not start the resend cooldown, so the user can retry at once', async () => {
    const send = vi.spyOn(otpProvider, 'send').mockRejectedValueOnce(new AppError(503, 'OTP_SEND_FAILED', 'Try again'));
    await request().post(`${API}/auth/send-otp`).send({ phone: '9876543210' }).expect(503);
    expect(await prisma.otpCode.count()).toBe(0);

    send.mockResolvedValueOnce(undefined);
    await request().post(`${API}/auth/send-otp`).send({ phone: '9876543210' }).expect(200);
    expect(await prisma.otpCode.count()).toBe(1);
  });
});
