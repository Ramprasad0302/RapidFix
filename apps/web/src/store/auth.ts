import { ADMIN_ROLES, isAdminRole, Role } from '@fixora/shared-types';
import { createAuthStore } from '@fixora/web-core';
import { api } from '../lib/api';

/**
 * One session for the whole app. The signed-in role decides which area the
 * user lands in; guests browse the customer area freely.
 */
export const {
  store: authStore,
  actions: authActions,
  useAuth,
} = createAuthStore({ api, knownRoles: [Role.CUSTOMER, Role.TECHNICIAN, ...ADMIN_ROLES] });

/** Where each role lives after login. */
export function homeFor(role: Role | null | undefined): string {
  if (role === Role.TECHNICIAN) return '/technician';
  if (role && isAdminRole(role)) return '/admin';
  return '/';
}
