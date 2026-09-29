import { ADMIN_ROLES } from '@fixora/shared-types';
import { createAuthStore } from '@fixora/web-core';
import { api } from '../services/api';

/** Admin session — any of SUPER_ADMIN / ADMIN / OPERATIONS / SUPPORT / FINANCE. */
export const {
  store: authStore,
  actions: authActions,
  useAuth,
} = createAuthStore({ api, audience: 'admin', allowedRoles: ADMIN_ROLES });
