import type { Role } from './enums';

/** Standard envelope for every `/api/v1` response. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  message: string;
  code: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Minimal JWT payload — never put PII here. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Socket.IO event names shared by server and clients. */
export const SocketEvent = {
  BOOKING_CREATED: 'booking_created',
  BOOKING_REQUEST: 'booking_request',
  BOOKING_ACCEPTED: 'booking_accepted',
  BOOKING_REJECTED: 'booking_rejected',
  TECHNICIAN_ASSIGNED: 'technician_assigned',
  TECHNICIAN_LOCATION_UPDATED: 'technician_location_updated',
  TECHNICIAN_ARRIVED: 'technician_arrived',
  SERVICE_STARTED: 'service_started',
  ADDITIONAL_CHARGE_REQUESTED: 'additional_charge_requested',
  ADDITIONAL_CHARGE_APPROVED: 'additional_charge_approved',
  SERVICE_COMPLETED: 'service_completed',
  PAYMENT_UPDATED: 'payment_updated',
  BOOKING_CANCELLED: 'booking_cancelled',
  NEW_MESSAGE: 'new_message',
} as const;
export type SocketEvent = (typeof SocketEvent)[keyof typeof SocketEvent];

export const bookingRoom = (bookingId: string) => `booking:${bookingId}`;
export const userRoom = (userId: string) => `user:${userId}`;
