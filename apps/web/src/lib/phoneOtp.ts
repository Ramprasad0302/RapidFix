import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import type { AuthSession } from '@fixora/shared-types';
import { toE164India } from '@fixora/shared-utils';
import { authApi } from './endpoints';
import { firebaseConfigured, getFirebaseApp } from './firebase';

/**
 * How the login screens send and check the OTP. The server decides the mode
 * (GET /app-config → otpProvider):
 *  - `server`   — our API sends the SMS (console in development, MSG91 in production)
 *  - `firebase` — Firebase sends the SMS from the browser (invisible reCAPTCHA);
 *                 the resulting Firebase ID token is exchanged at /auth/firebase
 */
export interface OtpSender {
  send(phone: string): Promise<{ resendInSeconds: number; devCode?: string }>;
  verify(phone: string, code: string): Promise<AuthSession>;
}

export class OtpError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const serverOtp: OtpSender = {
  send: (phone) => authApi.sendOtp(phone),
  verify: (phone, code) => authApi.verifyOtp(phone, code),
};

/** The page renders <div id={RECAPTCHA_CONTAINER} /> once; Firebase attaches the invisible check to it. */
export const RECAPTCHA_CONTAINER = 'recaptcha-container';
let verifier: RecaptchaVerifier | null = null;
let pending: ConfirmationResult | null = null;

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': 'Please enter a valid 10-digit mobile number.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/quota-exceeded': 'We can’t send more codes right now. Please try again later.',
  'auth/invalid-verification-code': 'That OTP is incorrect. Please check and try again.',
  'auth/code-expired': 'This OTP has expired. Please request a new one.',
  'auth/captcha-check-failed': 'Security check failed. Please try again.',
  'auth/network-request-failed': 'No internet connection. Please check and try again.',
  'auth/missing-verification-code': 'Please enter the 6-digit OTP.',
  'auth/unauthorized-domain': 'This website address isn’t allowed for phone sign-in yet (add it in Firebase → Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Phone sign-in is not enabled in Firebase yet.',
};

function friendly(e: unknown): OtpError {
  const code = (e as { code?: string })?.code;
  if (e instanceof OtpError) return e;
  if (code && FIREBASE_MESSAGES[code]) return new OtpError(FIREBASE_MESSAGES[code], code);
  if (e && typeof e === 'object' && 'message' in e && !code) return e as OtpError; // our API errors
  return new OtpError('Couldn’t verify right now. Please try again.', code);
}

async function firebaseAuth() {
  const [app, mod] = await Promise.all([getFirebaseApp(), import('firebase/auth')]);
  const auth = mod.getAuth(app);
  auth.languageCode = 'en';
  return { auth, mod };
}

async function freshVerifier() {
  const { auth, mod } = await firebaseAuth();
  verifier?.clear();
  verifier = new mod.RecaptchaVerifier(auth, RECAPTCHA_CONTAINER, { size: 'invisible' });
  return verifier;
}

export const firebaseOtp: OtpSender = {
  async send(phone) {
    if (!firebaseConfigured()) throw new OtpError('Phone sign-in isn’t set up in this app build (missing VITE_FIREBASE_* settings).');
    try {
      const { auth, mod } = await firebaseAuth();
      pending = await mod.signInWithPhoneNumber(auth, toE164India(phone), verifier ?? (await freshVerifier()));
      return { resendInSeconds: 30 };
    } catch (e) {
      // A used/expired reCAPTCHA can't be reused — start clean next time.
      verifier?.clear();
      verifier = null;
      throw friendly(e);
    }
  },
  async verify(_phone, code) {
    if (!pending) throw new OtpError('Please request an OTP first.');
    try {
      const cred = await pending.confirm(code);
      const idToken = await cred.user.getIdToken();
      const session = await authApi.firebaseLogin(idToken);
      // RapidFix keeps its own session; the Firebase one isn't needed any more.
      const { auth } = await firebaseAuth();
      await auth.signOut().catch(() => undefined);
      pending = null;
      return session;
    } catch (e) {
      throw friendly(e);
    }
  },
};

/** Call when the login page unmounts. */
export function disposeRecaptcha() {
  verifier?.clear();
  verifier = null;
}
