import { unwrap } from '@fixora/web-core';
import { api } from './api';

export interface CustomerProfile {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  customer: { referralCode: string } | null;
}

export const getProfile = () => unwrap<CustomerProfile>(api.get('/customer/profile'));

export const updateProfile = (input: { name: string; email: string }) =>
  unwrap<CustomerProfile>(api.put('/customer/profile', input));
