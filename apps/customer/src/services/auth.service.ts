import type { AuthSession, SendOtpResult } from '@fixora/shared-types';
import { unwrap } from '@fixora/web-core';
import { api } from './api';

export const sendCustomerOtp = (phone: string) =>
  unwrap<SendOtpResult>(api.post('/auth/customer/send-otp', { phone }, { skipAuthRefresh: true }));

export const verifyCustomerOtp = (phone: string, otp: string) =>
  unwrap<AuthSession>(api.post('/auth/customer/verify-otp', { phone, otp }, { skipAuthRefresh: true }));
