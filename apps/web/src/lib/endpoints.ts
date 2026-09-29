import type {
  AddressDto,
  AdminDashboardDto,
  AdminUserRowDto,
  ApiSuccess,
  AuthSession,
  BookingDetailDto,
  BookingListItemDto,
  CategoryDto,
  CustomerBookingStatsDto,
  CustomerProfileDto,
  DashboardRange,
  LocationDto,
  NearbyTechnicianDto,
  NotificationDto,
  OfferDto,
  PriceBreakdownDto,
  Role,
  SendOtpResult,
  ServiceDetailDto,
  ServiceSummaryDto,
  TechnicianDashboardDto,
  TechnicianEarningsDto,
  TechnicianJobAction,
  TechnicianJobDetailDto,
  TechnicianJobDto,
  TechnicianProfileSummary,
  UploadResultDto,
} from '@fixora/shared-types';
import type { AddressInput } from '@fixora/shared-utils';
import { unwrap } from '@fixora/web-core';
import { api } from './api';

/** Every API call the app makes, typed end to end. */

// ─── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
  sendOtp: (phone: string) => unwrap<SendOtpResult>(api.post('/auth/send-otp', { phone }, { skipAuthRefresh: true })),
  verifyOtp: (phone: string, otp: string) =>
    unwrap<AuthSession>(api.post('/auth/verify-otp', { phone, otp }, { skipAuthRefresh: true })),
  passwordLogin: (email: string, password: string) =>
    unwrap<AuthSession>(api.post('/auth/login', { email, password }, { skipAuthRefresh: true })),
};

// ─── Public catalogue ────────────────────────────────────────────────────
export const catalogApi = {
  categories: () => unwrap<CategoryDto[]>(api.get('/services/categories')),
  services: (params: { category?: string; popular?: boolean; q?: string; limit?: number }) =>
    unwrap<ServiceSummaryDto[]>(api.get('/services', { params })),
  service: (idOrSlug: string) => unwrap<ServiceDetailDto>(api.get(`/services/${encodeURIComponent(idOrSlug)}`)),
  locations: () => unwrap<LocationDto[]>(api.get('/locations')),
  nearby: (lat: number, lng: number) => unwrap<NearbyTechnicianDto[]>(api.get('/technicians/nearby', { params: { lat, lng } })),
  offers: (category?: string) => unwrap<OfferDto[]>(api.get('/offers', { params: { category } })),
  offer: (code: string) => unwrap<OfferDto>(api.get(`/offers/${encodeURIComponent(code)}`)),
  estimate: (serviceId: string, couponCode?: string) =>
    unwrap<PriceBreakdownDto>(api.post('/bookings/estimate', { serviceId, couponCode: couponCode || undefined })),
};

// ─── Customer ────────────────────────────────────────────────────────────
export type BookingTabParam = 'all' | 'upcoming' | 'active' | 'completed' | 'cancelled';

export interface CreateBookingPayload {
  serviceId: string;
  description: string;
  photos: string[];
  videoUrl?: string | null;
  addressId?: string;
  address?: AddressInput;
  saveAddress: boolean;
  scheduleType: 'NOW' | 'SCHEDULED';
  date?: string;
  timeSlot?: string;
  couponCode?: string;
  paymentMethod: 'CASH' | 'UPI' | 'RAZORPAY';
}

export const customerApi = {
  profile: () => unwrap<CustomerProfileDto>(api.get('/customer/profile')),
  updateProfile: (body: {
    name: string;
    email?: string;
    city?: string;
    language?: string;
    notificationsEnabled?: boolean;
    marketingOptIn?: boolean;
    avatarUrl?: string | null;
  }) => unwrap<CustomerProfileDto>(api.put('/customer/profile', body)),
  stats: () => unwrap<CustomerBookingStatsDto>(api.get('/customer/bookings/stats')),
  bookings: (tab: BookingTabParam) =>
    unwrap<BookingListItemDto[]>(api.get('/customer/bookings', { params: { tab, pageSize: 50 } })),
  booking: (id: string) => unwrap<BookingDetailDto>(api.get(`/customer/bookings/${id}`)),
  createBooking: (body: CreateBookingPayload) => unwrap<BookingDetailDto>(api.post('/customer/bookings', body)),
  cancelBooking: (id: string, reason?: string) =>
    unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/cancel`, { reason })),
  rescheduleBooking: (id: string, body: { scheduleType: 'NOW' | 'SCHEDULED'; date?: string; timeSlot?: string }) =>
    unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/reschedule`, body)),
  addresses: () => unwrap<AddressDto[]>(api.get('/customer/addresses')),
  createAddress: (body: AddressInput) => unwrap<AddressDto>(api.post('/customer/addresses', body)),
  updateAddress: (id: string, body: AddressInput) => unwrap<AddressDto>(api.put(`/customer/addresses/${id}`, body)),
  deleteAddress: (id: string) => unwrap<{ deleted: boolean }>(api.delete(`/customer/addresses/${id}`)),
};

// ─── Any signed-in user ──────────────────────────────────────────────────
export const notificationApi = {
  list: () => unwrap<NotificationDto[]>(api.get('/notifications')),
  unreadCount: () => unwrap<{ count: number }>(api.get('/notifications/unread-count')),
  readAll: () => unwrap<{ ok: boolean }>(api.post('/notifications/read-all')),
};

export const uploadApi = {
  upload: (file: File, kind: 'image' | 'any' = 'any') => {
    const form = new FormData();
    form.append('file', file);
    return unwrap<UploadResultDto>(
      api.post('/uploads', form, { params: kind === 'image' ? { kind } : undefined, timeout: 120_000 }),
    );
  },
};

// ─── Technician ──────────────────────────────────────────────────────────
export type TechnicianTabParam = 'all' | 'upcoming' | 'inProgress' | 'completed' | 'cancelled';
const ACTION_PATH: Record<TechnicianJobAction, string> = {
  ACCEPT: 'accept',
  REJECT: 'reject',
  EN_ROUTE: 'en-route',
  ARRIVED: 'arrived',
  START: 'start',
  COMPLETE: 'complete',
};

export const technicianApi = {
  dashboard: () => unwrap<TechnicianDashboardDto>(api.get('/technician/dashboard')),
  profile: () => unwrap<TechnicianProfileSummary>(api.get('/technician/profile')),
  setOnline: (online: boolean, coords?: { lat: number; lng: number }) =>
    unwrap<TechnicianProfileSummary>(api.post(online ? '/technician/online' : '/technician/offline', coords ?? {})),
  jobs: (tab: TechnicianTabParam) =>
    unwrap<{ items: TechnicianJobDto[]; counts: Record<Exclude<TechnicianTabParam, 'all'>, number> }>(
      api.get('/technician/jobs', { params: { tab } }),
    ),
  job: (id: string) => unwrap<TechnicianJobDetailDto>(api.get(`/technician/jobs/${id}`)),
  act: (id: string, action: TechnicianJobAction, reason?: string) =>
    unwrap<TechnicianJobDetailDto | null>(api.post(`/technician/jobs/${id}/${ACTION_PATH[action]}`, { reason })),
  saveNotes: (id: string, notes: string) => unwrap<TechnicianJobDetailDto>(api.put(`/technician/jobs/${id}/notes`, { notes })),
  earnings: (month?: string) => unwrap<TechnicianEarningsDto>(api.get('/technician/earnings', { params: { month } })),
};

// ─── Admin ───────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: (range: DashboardRange) => unwrap<AdminDashboardDto>(api.get('/admin/dashboard', { params: { range } })),
  users: async (params: { q?: string; role?: Role; page: number; pageSize: number }) => {
    const res = await api.get<ApiSuccess<AdminUserRowDto[]>>('/admin/users', { params });
    return { items: res.data.data, meta: res.data.meta! };
  },
  changeRole: (id: string, role: Role) => unwrap<{ id: string; role: Role }>(api.patch(`/admin/users/${id}/role`, { role })),
};
