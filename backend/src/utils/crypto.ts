import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

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

// ─── Field encryption (AES-256-GCM) for sensitive values at rest ─────────


/** Production requires DATA_ENCRYPTION_KEY; development derives a key so the app still runs. */
const dataKey = () =>
  env.DATA_ENCRYPTION_KEY ? Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex') : createHash('sha256').update(`dev:${env.JWT_REFRESH_SECRET}`).digest();

/** "v1:<iv>:<tag>:<ciphertext>" (base64url parts). */
export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), enc.toString('base64url')].join(':');
}

export function decryptField(value: string): string {
  const [v, iv, tag, data] = value.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
