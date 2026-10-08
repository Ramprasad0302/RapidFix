import type { Role, TechnicianVerificationStatus } from './enums';

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
  /** Customers only: false until name, email, date of birth and an address are saved. */
  profileComplete?: boolean;
  /** Franchise managers only: the franchise they run. */
  franchise?: { id: string; code: string; name: string; town: string };
}

/**
 * Returned by verify-otp, staff email login and refresh. The refresh token
 * travels only as an httpOnly cookie; the client routes by `user.role`.
 */
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
