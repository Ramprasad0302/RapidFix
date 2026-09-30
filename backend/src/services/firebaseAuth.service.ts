import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

/**
 * Verifies Firebase Authentication ID tokens (phone sign-in) without the Admin SDK.
 * The app sends Firebase's ID token after the user enters the SMS code; we check
 * Google's signature, audience (our project), issuer, expiry and freshness, then
 * trust the phone number in it. Google rotates the signing keys; we cache them for
 * as long as Google's Cache-Control allows.
 */
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** A phone sign-in older than this can't be exchanged for a RapidFix session. */
const MAX_AUTH_AGE_SECONDS = 10 * 60;

let cache: { certs: Record<string, string>; expiresAt: number; fetchedAt: number } | null = null;
const unavailable = () => new AppError(503, 'FIREBASE_UNAVAILABLE', 'Phone verification is temporarily unavailable. Please try again.');

async function signingCerts(forceRefresh = false): Promise<Record<string, string>> {
  if (cache && (forceRefresh ? Date.now() - cache.fetchedAt < 60_000 : cache.expiresAt > Date.now())) return cache.certs;
  let certs: Record<string, string>;
  let res: Response;
  try {
    res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw unavailable();
    certs = (await res.json()) as Record<string, string>;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw unavailable();
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cache = { certs, expiresAt: Date.now() + maxAge * 1000, fetchedAt: Date.now() };
  return certs;
}

/** Test hook: forget cached keys. */
export const resetFirebaseCertCache = () => {
  cache = null;
};

interface FirebaseClaims {
  sub: string;
  phone_number?: string;
  auth_time?: number;
  firebase?: { sign_in_provider?: string };
}

/** Returns the verified E.164 phone number from a Firebase ID token. */
export async function verifyFirebasePhoneToken(idToken: string): Promise<string> {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new AppError(503, 'FIREBASE_NOT_CONFIGURED', 'Phone verification is not set up yet.');

  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
  if (!kid || decoded?.header.alg !== 'RS256') throw AppError.unauthorized('Invalid verification. Please try again.', 'INVALID_FIREBASE_TOKEN');

  let certs = await signingCerts();
  if (!certs[kid]) certs = await signingCerts(true); // keys rotated since we cached them
  const cert = certs[kid];
  if (!cert) throw AppError.unauthorized('Invalid verification. Please try again.', 'INVALID_FIREBASE_TOKEN');

  let claims: FirebaseClaims;
  try {
    claims = jwt.verify(idToken, cert, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    }) as FirebaseClaims;
  } catch (err) {
    logger.info({ reason: (err as Error).name }, 'firebase token rejected');
    throw AppError.unauthorized('Your verification expired. Please request a new OTP.', 'INVALID_FIREBASE_TOKEN');
  }

  if (!claims.sub || claims.firebase?.sign_in_provider !== 'phone' || !claims.phone_number) {
    throw AppError.unauthorized('Please sign in with your mobile number.', 'INVALID_FIREBASE_TOKEN');
  }
  if (!claims.auth_time || Date.now() / 1000 - claims.auth_time > MAX_AUTH_AGE_SECONDS) {
    throw AppError.unauthorized('Your verification expired. Please request a new OTP.', 'FIREBASE_TOKEN_STALE');
  }
  return claims.phone_number;
}
