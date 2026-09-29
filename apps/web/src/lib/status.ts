import { BookingStatus as B, type BookingStatus } from '@fixora/shared-types';

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple';

interface Meta {
  label: string;
  tone: Tone;
}

/** How each status reads to a customer. */
const CUSTOMER: Record<BookingStatus, Meta> = {
  [B.PENDING]: { label: 'Booked', tone: 'blue' },
  [B.SEARCHING]: { label: 'Finding Technician', tone: 'purple' },
  [B.TECHNICIAN_ASSIGNED]: { label: 'Upcoming', tone: 'amber' },
  [B.TECHNICIAN_ACCEPTED]: { label: 'Upcoming', tone: 'amber' },
  [B.TECHNICIAN_EN_ROUTE]: { label: 'Technician En Route', tone: 'blue' },
  [B.TECHNICIAN_ARRIVED]: { label: 'Technician Arrived', tone: 'blue' },
  [B.SERVICE_STARTED]: { label: 'In Progress', tone: 'blue' },
  [B.ADDITIONAL_CHARGE_REQUESTED]: { label: 'Approval Needed', tone: 'amber' },
  [B.ADDITIONAL_CHARGE_APPROVED]: { label: 'In Progress', tone: 'blue' },
  [B.SERVICE_COMPLETED]: { label: 'Payment Pending', tone: 'amber' },
  [B.PAYMENT_PENDING]: { label: 'Payment Pending', tone: 'amber' },
  [B.PAYMENT_COMPLETED]: { label: 'Completed', tone: 'green' },
  [B.CUSTOMER_CANCELLED]: { label: 'Cancelled', tone: 'red' },
  [B.TECHNICIAN_CANCELLED]: { label: 'Cancelled', tone: 'red' },
  [B.ADMIN_CANCELLED]: { label: 'Cancelled', tone: 'red' },
  [B.NO_SHOW]: { label: 'No Show', tone: 'red' },
  [B.DISPUTED]: { label: 'Under Review', tone: 'amber' },
  [B.REFUNDED]: { label: 'Refunded', tone: 'gray' },
};

/** Technician / admin wording. */
const STAFF: Partial<Record<BookingStatus, Meta>> = {
  [B.PENDING]: { label: 'Booked', tone: 'blue' },
  [B.SEARCHING]: { label: 'Booked', tone: 'blue' },
  [B.TECHNICIAN_ASSIGNED]: { label: 'Assigned', tone: 'amber' },
  [B.TECHNICIAN_ACCEPTED]: { label: 'Upcoming', tone: 'amber' },
  [B.TECHNICIAN_EN_ROUTE]: { label: 'En Route', tone: 'blue' },
  [B.TECHNICIAN_ARRIVED]: { label: 'Arrived', tone: 'blue' },
  [B.SERVICE_STARTED]: { label: 'In Progress', tone: 'blue' },
};

export const statusMeta = (status: BookingStatus, audience: 'customer' | 'staff' = 'customer'): Meta =>
  (audience === 'staff' && STAFF[status]) || CUSTOMER[status];

export const TONE_CLASSES: Record<Tone, string> = {
  blue: 'bg-fixora-blue-soft text-fixora-blue',
  green: 'bg-success-soft text-success',
  amber: 'bg-warning-soft text-warning',
  red: 'bg-danger-soft text-danger',
  gray: 'bg-slate-100 text-slate-600',
  purple: 'bg-violet-50 text-violet-600',
};

/** Statuses that show the live progress tracker on booking cards. */
export const TRACKED: BookingStatus[] = [
  B.TECHNICIAN_ASSIGNED,
  B.TECHNICIAN_ACCEPTED,
  B.TECHNICIAN_EN_ROUTE,
  B.TECHNICIAN_ARRIVED,
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
];
