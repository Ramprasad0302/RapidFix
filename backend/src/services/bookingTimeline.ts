import { BookingStatus as B, type BookingStatus, type TimelineStepDto } from '@fixora/shared-types';

interface StepDef {
  key: string;
  label: string;
  /** Statuses that mean this step has been reached. */
  statuses: BookingStatus[];
}

const AFTER_ARRIVAL: BookingStatus[] = [
  B.TECHNICIAN_ARRIVED,
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
];
const DONE: BookingStatus[] = [B.SERVICE_COMPLETED, B.PAYMENT_PENDING, B.PAYMENT_COMPLETED];

const CUSTOMER_STEPS: StepDef[] = [
  { key: 'BOOKED', label: 'Booked', statuses: [B.PENDING, B.SEARCHING] },
  { key: 'ASSIGNED', label: 'Assigned', statuses: [B.TECHNICIAN_ASSIGNED, B.TECHNICIAN_ACCEPTED] },
  { key: 'EN_ROUTE', label: 'En Route', statuses: [B.TECHNICIAN_EN_ROUTE] },
  { key: 'ARRIVED', label: 'Arrived', statuses: AFTER_ARRIVAL },
  { key: 'COMPLETED', label: 'Completed', statuses: DONE },
];

const TECHNICIAN_STEPS: StepDef[] = [
  { key: 'ASSIGNED', label: 'Assigned', statuses: [B.TECHNICIAN_ASSIGNED, B.TECHNICIAN_ACCEPTED] },
  { key: 'EN_ROUTE', label: 'En Route', statuses: [B.TECHNICIAN_EN_ROUTE] },
  { key: 'IN_PROGRESS', label: 'In Progress', statuses: AFTER_ARRIVAL },
  { key: 'COMPLETED', label: 'Completed', statuses: DONE },
];

export interface HistoryEntry {
  toStatus: BookingStatus;
  createdAt: Date;
}

/**
 * Progress steps with the time each was first reached. Steps before the
 * current one are `done`; completion marks every step `done`.
 */
export function buildTimeline(
  variant: 'customer' | 'technician',
  status: BookingStatus,
  history: HistoryEntry[],
  createdAt: Date,
): TimelineStepDto[] {
  const steps = variant === 'customer' ? CUSTOMER_STEPS : TECHNICIAN_STEPS;
  const sorted = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const currentIndex = steps.findIndex((s) => s.statuses.includes(status));
  const completed = DONE.includes(status);

  return steps.map((step, i) => {
    const reachedAt =
      step.key === 'BOOKED' ? createdAt : sorted.find((h) => step.statuses.includes(h.toStatus))?.createdAt ?? null;
    const state =
      completed || (currentIndex >= 0 && i < currentIndex) ? 'done' : i === currentIndex ? 'current' : 'upcoming';
    return { key: step.key, label: step.label, at: state === 'upcoming' ? null : (reachedAt?.toISOString() ?? null), state };
  });
}
