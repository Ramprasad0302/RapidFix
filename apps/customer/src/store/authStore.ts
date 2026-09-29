import { Role } from '@fixora/shared-types';
import { createAuthStore } from '@fixora/web-core';
import { api } from '../services/api';

/**
 * Customer session. Guests are first-class: a failed/expired session simply
 * drops back to guest browsing — never a forced login screen.
 */
export const {
  store: authStore,
  actions: authActions,
  useAuth,
} = createAuthStore({ api, audience: 'customer', allowedRoles: [Role.CUSTOMER] });
