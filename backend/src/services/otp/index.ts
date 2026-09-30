import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';

export interface OtpMessage {
  /** E.164, e.g. +919876543210 */
  phone: string;
  code: string;
  expiresInSeconds: number;
}

/** Pluggable SMS delivery. `console` for development, `msg91` for production (add others here). */
export interface OtpProvider {
  readonly name: string;
  /** True when the code may be echoed back to the client (development only). */
  readonly exposesCode: boolean;
  send(message: OtpMessage): Promise<void>;
}

class ConsoleOtpProvider implements OtpProvider {
  readonly name = 'console';
  readonly exposesCode = env.NODE_ENV === 'development';

  async send({ phone, code, expiresInSeconds }: OtpMessage) {
    // Deliberately bypasses the pino redaction: this provider exists only for local development.
    logger.info(`[DEV OTP] ${phone} → ${code} (valid ${expiresInSeconds}s)`);
  }
}

/**
 * MSG91 Flow API (DLT-registered template). The template must contain an `##otp##`
 * variable; OTP_API_KEY is the MSG91 auth key, OTP_TEMPLATE_ID the flow template.
 * The code is never logged.
 */
export class Msg91OtpProvider implements OtpProvider {
  readonly name = 'msg91';
  readonly exposesCode = false;

  async send({ phone, code }: OtpMessage) {
    let ok = false;
    try {
      const res = await fetch('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: env.OTP_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ template_id: env.OTP_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: phone.replace(/^\+/, ''), otp: code }] }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as { type?: string };
      ok = res.ok && body.type !== 'error';
      if (!ok) logger.error({ status: res.status, provider: this.name }, 'OTP SMS rejected by provider');
    } catch (err) {
      logger.error({ err: (err as Error).name, provider: this.name }, 'OTP SMS request failed');
    }
    if (!ok) throw new AppError(503, 'OTP_SEND_FAILED', 'We could not send the OTP right now. Please try again in a minute.');
  }
}

export const otpProvider: OtpProvider = env.OTP_PROVIDER === 'msg91' ? new Msg91OtpProvider() : new ConsoleOtpProvider();
