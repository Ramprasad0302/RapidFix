import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const hmacSha256 = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

/** URL-safe opaque token (refresh tokens, etc.). */
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');

/** Uniformly random 6-digit code. */
export const generateOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomReferralCode(length = 6): string {
  let out = 'FX';
  for (let i = 0; i < length; i++) out += REFERRAL_ALPHABET[randomInt(0, REFERRAL_ALPHABET.length)];
  return out;
}
