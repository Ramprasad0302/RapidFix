import type { AuthSession, SendOtpResult } from '@fixora/shared-types';
import { unwrap } from '@fixora/web-core';
import { api } from './api';

export const sendTechnicianOtp = (phone: string) =>
  unwrap<SendOtpResult>(api.post('/auth/technician/send-otp', { phone }, { skipAuthRefresh: true }));

export const verifyTechnicianOtp = (phone: string, otp: string) =>
  unwrap<AuthSession>(api.post('/auth/technician/verify-otp', { phone, otp }, { skipAuthRefresh: true }));
