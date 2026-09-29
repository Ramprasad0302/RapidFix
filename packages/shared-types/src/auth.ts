import type { Role, TechnicianVerificationStatus } from './enums';

/** Which app a session belongs to. Each gets its own httpOnly refresh cookie. */
export type AuthAudience = 'customer' | 'technician' | 'admin';

export interface AuthUser {
  id: string;
  role: Role;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  technician?: {
    id: string;
    verificationStatus: TechnicianVerificationStatus;
    isOnline: boolean;
  };
}

/** Returned by verify-otp, admin login and refresh. The refresh token travels only as an httpOnly cookie. */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  isNewUser?: boolean;
}

export interface SendOtpResult {
  /** Seconds before another OTP may be requested. */
  resendInSeconds: number;
  expiresInSeconds: number;
  /** Development only (OTP_PROVIDER=console). Never present in production. */
  devCode?: string;
}
