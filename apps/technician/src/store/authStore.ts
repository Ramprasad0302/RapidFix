import { Role } from '@fixora/shared-types';
import { createAuthStore } from '@fixora/web-core';
import { api } from '../services/api';

/** Technician session. When it ends, route guards send the user to /login. */
export const {
  store: authStore,
  actions: authActions,
  useAuth,
} = createAuthStore({ api, audience: 'technician', allowedRoles: [Role.TECHNICIAN] });
