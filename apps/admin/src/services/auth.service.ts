import type { AuthSession } from '@fixora/shared-types';
import { unwrap } from '@fixora/web-core';
import { api } from './api';

export const adminLogin = (email: string, password: string) =>
  unwrap<AuthSession>(api.post('/auth/admin/login', { email, password }, { skipAuthRefresh: true }));
