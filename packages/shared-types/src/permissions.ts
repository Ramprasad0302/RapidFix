import { Role, type AdminRole } from './enums';

/** Fine-grained admin capabilities. Backend enforces; admin UI uses them to hide menu items. */
export const Permission = {
  DASHBOARD_VIEW: 'dashboard:view',
  BOOKINGS_MANAGE: 'bookings:manage',
  CUSTOMERS_MANAGE: 'customers:manage',
  TECHNICIANS_MANAGE: 'technicians:manage',
  CATALOG_MANAGE: 'catalog:manage',
  OFFERS_MANAGE: 'offers:manage',
  PAYMENTS_MANAGE: 'payments:manage',
  PAYOUTS_MANAGE: 'payouts:manage',
  REVIEWS_MANAGE: 'reviews:manage',
  COMPLAINTS_MANAGE: 'complaints:manage',
  NOTIFICATIONS_MANAGE: 'notifications:manage',
  REPORTS_VIEW: 'reports:view',
  SETTINGS_MANAGE: 'settings:manage',
  AUDIT_VIEW: 'audit:view',
  ADMINS_MANAGE: 'admins:manage',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL = Object.values(Permission);
const P = Permission;

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly Permission[]>> = {
  [Role.SUPER_ADMIN]: ALL,
  [Role.ADMIN]: ALL.filter((p) => p !== P.ADMINS_MANAGE),
  [Role.OPERATIONS]: [P.DASHBOARD_VIEW, P.BOOKINGS_MANAGE, P.TECHNICIANS_MANAGE, P.REVIEWS_MANAGE, P.REPORTS_VIEW],
  [Role.SUPPORT]: [P.DASHBOARD_VIEW, P.CUSTOMERS_MANAGE, P.COMPLAINTS_MANAGE, P.REVIEWS_MANAGE],
  [Role.FINANCE]: [P.DASHBOARD_VIEW, P.PAYMENTS_MANAGE, P.PAYOUTS_MANAGE, P.REPORTS_VIEW],
};

export function isAdminRole(role: Role): role is AdminRole {
  return role in ROLE_PERMISSIONS;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return isAdminRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}
