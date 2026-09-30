import {
  BadgePercent,
  Bell,
  CalendarCheck2,
  ChartColumn,
  CircleAlert,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  Settings2,
  Shapes,
  Star,
  UserCog,
  UserRound,
  UsersRound,
  WalletCards,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Permission } from '@fixora/shared-types';

export interface AdminNavItem {
  slug: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  description: string;
}

export const MAIN_NAV: AdminNavItem[] = [
  { slug: '', label: 'Dashboard', icon: LayoutDashboard, permission: Permission.DASHBOARD_VIEW, description: 'Business overview' },
  { slug: 'bookings', label: 'Bookings', icon: CalendarCheck2, permission: Permission.BOOKINGS_MANAGE, description: 'Search bookings, assign or reassign technicians, cancel and resolve disputes.' },
  { slug: 'customers', label: 'Customers', icon: UserRound, permission: Permission.CUSTOMERS_MANAGE, description: 'Customer profiles, bookings, payments, suspend and reactivate.' },
  { slug: 'technicians', label: 'Technicians', icon: UsersRound, permission: Permission.TECHNICIANS_MANAGE, description: 'Approve documents, verify, suspend or block partners.' },
  { slug: 'services', label: 'Services', icon: Wrench, permission: Permission.CATALOG_MANAGE, description: 'Service prices, durations, inclusions and commission.' },
  { slug: 'categories', label: 'Categories', icon: Shapes, permission: Permission.CATALOG_MANAGE, description: 'Categories and subcategories shown on the customer app.' },
  { slug: 'offers', label: 'Offers & Coupons', icon: BadgePercent, permission: Permission.OFFERS_MANAGE, description: 'Create coupons, category, location and first-booking offers.' },
  { slug: 'payments', label: 'Payments', icon: CreditCard, permission: Permission.PAYMENTS_MANAGE, description: 'Transactions, refunds, cash / UPI / Razorpay reconciliation.' },
  { slug: 'payouts', label: 'Payouts', icon: WalletCards, permission: Permission.PAYOUTS_MANAGE, description: 'Technician wallet balances and payouts.' },
  { slug: 'reviews', label: 'Reviews', icon: Star, permission: Permission.REVIEWS_MANAGE, description: 'Moderate customer reviews.' },
  { slug: 'complaints', label: 'Complaints', icon: CircleAlert, permission: Permission.COMPLAINTS_MANAGE, description: 'Customer and partner complaints.' },
  { slug: 'notifications', label: 'Notifications', icon: Bell, permission: Permission.NOTIFICATIONS_MANAGE, description: 'Announcements to customers and partners.' },
  { slug: 'reports', label: 'Reports', icon: ChartColumn, permission: Permission.REPORTS_VIEW, description: 'Bookings, revenue, commission and performance reports.' },
  { slug: 'settings', label: 'Settings', icon: Settings, permission: Permission.SETTINGS_MANAGE, description: 'Tax, dispatch and platform settings.' },
];

export const ADMIN_NAV: AdminNavItem[] = [
  { slug: 'users', label: 'Users & Roles', icon: UserCog, permission: Permission.USERS_MANAGE, description: 'Change what each person can do in RapidFix.' },
  { slug: 'audit-logs', label: 'Audit Logs', icon: FileText, permission: Permission.AUDIT_VIEW, description: 'Every sensitive admin action, who did it and when.' },
  { slug: 'system-settings', label: 'System Settings', icon: Settings2, permission: Permission.SETTINGS_MANAGE, description: 'Integrations: SMS, payments, maps and notifications.' },
];

export const ALL_NAV = [...MAIN_NAV, ...ADMIN_NAV];
