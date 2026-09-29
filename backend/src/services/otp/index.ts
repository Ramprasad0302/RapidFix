import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface OtpMessage {
  /** E.164, e.g. +919876543210 */
  phone: string;
  code: string;
  expiresInSeconds: number;
}

/** Pluggable SMS delivery. Add MSG91 / Twilio implementations here for production. */
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

export const otpProvider: OtpProvider = new ConsoleOtpProvider();
