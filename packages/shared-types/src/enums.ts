/**
 * Domain enums shared by the API and all three frontends.
 * Declared as const objects (not TS enums) so they survive `verbatimModuleSyntax`
 * and match the string values Prisma stores in MySQL.
 */

export const Role = {
  CUSTOMER: 'CUSTOMER',
  TECHNICIAN: 'TECHNICIAN',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  OPERATIONS: 'OPERATIONS',
  SUPPORT: 'SUPPORT',
  FINANCE: 'FINANCE',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ADMIN_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.OPERATIONS,
  Role.SUPPORT,
  Role.FINANCE,
] as const satisfies readonly Role[];
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const BookingStatus = {
  PENDING: 'PENDING',
  SEARCHING: 'SEARCHING',
  TECHNICIAN_ASSIGNED: 'TECHNICIAN_ASSIGNED',
  TECHNICIAN_ACCEPTED: 'TECHNICIAN_ACCEPTED',
  TECHNICIAN_EN_ROUTE: 'TECHNICIAN_EN_ROUTE',
  TECHNICIAN_ARRIVED: 'TECHNICIAN_ARRIVED',
  SERVICE_STARTED: 'SERVICE_STARTED',
  ADDITIONAL_CHARGE_REQUESTED: 'ADDITIONAL_CHARGE_REQUESTED',
  ADDITIONAL_CHARGE_APPROVED: 'ADDITIONAL_CHARGE_APPROVED',
  SERVICE_COMPLETED: 'SERVICE_COMPLETED',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  CUSTOMER_CANCELLED: 'CUSTOMER_CANCELLED',
  TECHNICIAN_CANCELLED: 'TECHNICIAN_CANCELLED',
  ADMIN_CANCELLED: 'ADMIN_CANCELLED',
  NO_SHOW: 'NO_SHOW',
  DISPUTED: 'DISPUTED',
  REFUNDED: 'REFUNDED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const TechnicianVerificationStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  BLOCKED: 'BLOCKED',
} as const;
export type TechnicianVerificationStatus =
  (typeof TechnicianVerificationStatus)[keyof typeof TechnicianVerificationStatus];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BLOCKED: 'BLOCKED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  UPI: 'UPI',
  RAZORPAY: 'RAZORPAY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const AddressLabel = {
  HOME: 'HOME',
  WORK: 'WORK',
  OTHER: 'OTHER',
} as const;
export type AddressLabel = (typeof AddressLabel)[keyof typeof AddressLabel];

export const AdditionalChargeStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type AdditionalChargeStatus =
  (typeof AdditionalChargeStatus)[keyof typeof AdditionalChargeStatus];

export const TIME_SLOTS = [
  { id: '09-11', label: '9 AM – 11 AM', startHour: 9, endHour: 11 },
  { id: '11-13', label: '11 AM – 1 PM', startHour: 11, endHour: 13 },
  { id: '14-16', label: '2 PM – 4 PM', startHour: 14, endHour: 16 },
  { id: '16-18', label: '4 PM – 6 PM', startHour: 16, endHour: 18 },
  { id: '18-20', label: '6 PM – 8 PM', startHour: 18, endHour: 20 },
] as const;
export type TimeSlotId = (typeof TIME_SLOTS)[number]['id'];
