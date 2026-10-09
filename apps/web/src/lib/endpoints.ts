import type {
  AuthUser,
  AdminBookingDetailDto,
  AdminBookingRowDto,
  AdminCategoryDto,
  AdminCouponDto,
  AdminCustomerDetailDto,
  AdminCustomerRowDto,
  AdminPaymentsDto,
  AdminPayoutDto,
  AdminReviewDto,
  AdminServiceDto,
  AdminTechnicianDetailDto,
  AdminTechnicianRowDto,
  AdminWalletRowDto,
  AuditLogDto,
  BroadcastDto,
  ChatInfoDto,
  ComplaintDto,
  InvoiceDto,
  MessageDto,
  Paged,
  PayoutDetailsDto,
  PaymentLinkDto,
  RazorpayOrderDto,
  ReportDto,
  SettingDto,
  SystemStatusDto,
  TechnicianDetailsDto,
  TechnicianDocumentDto,
  TechnicianPerformanceDto,
  TechnicianReviewDto,
  TechnicianVerificationStatus,
  UserStatus,
  WalletDto,
  AddressDto,
  AdminDashboardDto,
  AdminUserRowDto,
  AssignmentCandidateDto,
  FeaturedReviewDto,
  GeoAddressDto,
  GeoPlaceDto,
  PublicStatsDto,
  TechnicianRequestDto,
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
  TechnicianServicesDto,
  UploadResultDto,
  FranchiseDetailDto,
  FranchiseReportDto,
  FranchiseRowDto,
  FranchiseStatus,
  LocationInput,
  MyFranchiseDto,
} from '@fixora/shared-types';
import type { AddressInput, FranchiseFormInput } from '@fixora/shared-utils';
import { unwrap } from '@fixora/web-core';
import { api } from './api';

/** Launch event opening screen (Super Admin switch). */
export interface LaunchStateDto {
  enabled: boolean;
  headline: string;
  subline: string;
  id: string;
}

/** Every API call the app makes, typed end to end. */

// ─── Auth ────────────────────────────────────────────────────────────────
export const authApi = {
  /** Erase this account (Google Play requirement). */
  deleteAccount: () => unwrap<{ deleted: boolean }>(api.delete('/auth/account', { data: { confirm: 'DELETE' } })),
  sendOtp: (phone: string) => unwrap<SendOtpResult>(api.post('/auth/send-otp', { phone }, { skipAuthRefresh: true })),
  verifyOtp: (phone: string, otp: string) =>
    unwrap<AuthSession>(api.post('/auth/verify-otp', { phone, otp }, { skipAuthRefresh: true })),
  firebaseLogin: (idToken: string) => unwrap<AuthSession>(api.post('/auth/firebase', { idToken }, { skipAuthRefresh: true })),
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
  nearby: (lat: number, lng: number, opts: { radiusKm?: number; limit?: number } = {}) =>
    unwrap<NearbyTechnicianDto[]>(api.get('/technicians/nearby', { params: { lat, lng, ...opts } })),
  offers: (category?: string) => unwrap<OfferDto[]>(api.get('/offers', { params: { category } })),
  offer: (code: string) => unwrap<OfferDto>(api.get(`/offers/${encodeURIComponent(code)}`)),
  estimate: (serviceId: string, couponCode?: string) =>
    unwrap<PriceBreakdownDto>(api.post('/bookings/estimate', { serviceId, couponCode: couponCode || undefined })),
};

export const trustApi = {
  stats: () => unwrap<PublicStatsDto>(api.get('/stats/public')),
  reviews: () => unwrap<FeaturedReviewDto[]>(api.get('/reviews/featured')),
  appConfig: () => unwrap<{ supportPhone: string; supportEmail: string; otpProvider: 'server' | 'firebase'; onlinePayments?: boolean; bookingAdvance?: number; assistant?: boolean; autoCancelMinutes?: number; launch?: LaunchStateDto }>(api.get('/app-config')),
};

// ─── Geocoding (server-side proxy) ───────────────────────────────────────
export interface ServiceAreaCheckDto {
  served: boolean;
  town: string | null;
  distanceKm: number | null;
  areas: { name: string; radiusKm: number }[];
}
export const serviceAreaApi = {
  check: (lat: number, lng: number) => unwrap<ServiceAreaCheckDto>(api.get('/service-area', { params: { lat, lng } })),
  interest: (body: { name?: string; phone?: string; label?: string; lat?: number; lng?: number }) =>
    unwrap<{ saved: boolean }>(api.post('/service-area/interest', body)),
};

/** District / state for a pincode (India Post directory). */
export interface PincodeInfoDto {
  pincode: string;
  district: string;
  state: string;
  places: string[];
  block: string;
}

export const geoApi = {
  pincode: (pin: string) => unwrap<PincodeInfoDto>(api.get(`/geo/pincode/${pin}`)),
  ifsc: (code: string) => unwrap<{ ifsc: string; bank: string; branch: string; city: string; state: string }>(api.get(`/geo/ifsc/${code}`)),
  reverse: (lat: number, lng: number) => unwrap<GeoAddressDto>(api.get('/geo/reverse', { params: { lat, lng } })),
  search: (q: string, near?: { lat: number; lng: number }) =>
    unwrap<GeoPlaceDto[]>(api.get('/geo/search', { params: { q, ...(near && { lat: near.lat, lng: near.lng }) } })),
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
    email: string;
    dateOfBirth?: string;
    city?: string;
    language?: string;
    notificationsEnabled?: boolean;
    marketingOptIn?: boolean;
    avatarUrl?: string | null;
  }) => unwrap<CustomerProfileDto>(api.put('/customer/profile', body)),
  /** Finish sign-up: name, email, date of birth and (for new customers) the first address. */
  onboarding: (body: { name: string; email: string; dateOfBirth: string; address?: AddressInput }) =>
    unwrap<AuthUser>(api.post('/customer/onboarding', body)),
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
  syncPayment: (id: string) => unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/payment/sync`)),
  payLater: (id: string) => unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/payment/pay-later`)),
  upiLink: (id: string) => unwrap<PaymentLinkDto>(api.post(`/customer/bookings/${id}/payment/upi-link`)),
  razorpayOrder: (id: string) => unwrap<RazorpayOrderDto>(api.post(`/customer/bookings/${id}/payment/razorpay-order`)),
  razorpayVerify: (id: string, body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/payment/razorpay-verify`, body)),
  respondCharge: (id: string, chargeId: string, decision: 'approve' | 'reject') =>
    unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/additional-charges/${chargeId}/${decision}`)),
  review: (id: string, body: { rating: number; comment?: string }) => unwrap<BookingDetailDto>(api.post(`/customer/bookings/${id}/review`, body)),
};

// ─── Shared booking resources (customer, assigned technician, staff) ─────
export const bookingApi = {
  chat: (id: string) => unwrap<ChatInfoDto>(api.get(`/bookings/${id}/chat`)),
  messages: (id: string, before?: string) => unwrap<MessageDto[]>(api.get(`/bookings/${id}/messages`, { params: { before } })),
  send: (id: string, body: { body?: string; imageUrl?: string }) => unwrap<MessageDto>(api.post(`/bookings/${id}/messages`, body)),
  markRead: (id: string) => unwrap<{ read: number }>(api.post(`/bookings/${id}/messages/read`)),
  reportChat: (id: string, body: { reason: string; details?: string; block: boolean }) => unwrap<ChatInfoDto>(api.post(`/bookings/${id}/chat/report`, body)),
  blockChat: (id: string) => unwrap<ChatInfoDto>(api.post(`/bookings/${id}/chat/block`)),
  unblockChat: (id: string) => unwrap<ChatInfoDto>(api.delete(`/bookings/${id}/chat/block`)),
  invoice: (id: string) => unwrap<InvoiceDto>(api.get(`/bookings/${id}/invoice`)),
};

export const COMPLAINT_CATEGORIES = [
  'Service quality',
  'Technician behaviour',
  'Pricing / billing',
  'Payment',
  'Delay / no-show',
  'App issue',
  'Chat message',
  'Other',
] as const;

export const complaintApi = {
  raise: (body: { bookingId?: string; category: (typeof COMPLAINT_CATEGORIES)[number]; subject: string; description: string }) =>
    unwrap<ComplaintDto>(api.post('/complaints', body)),
  mine: () => unwrap<ComplaintDto[]>(api.get('/complaints/mine')),
};

export interface PartnerRegistration {
  name: string;
  email?: string;
  experienceYears: number;
  bio?: string | null;
  languages: string[];
  serviceRadiusKm: number;
  addressLine?: string;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  alternatePhone?: string | null;
  hasOwnTools?: boolean;
  hasVehicle?: boolean;
  skills: string[];
  serviceIds?: string[];
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  payoutUpiId?: string | null;
  aadhaarNumber?: string;
  panNumber?: string | null;
}

export const partnerApi = {
  register: (body: PartnerRegistration) => unwrap<AuthSession>(api.post('/partner/register', body)),
};

/** Private KYC file → object URL (the request carries the access token; files are never public). */
export async function fetchPrivateFile(path: string) {
  // A query string, not /files/private/…/x.jpg: Hostinger's CDN treats addresses ending in .jpg as
  // static files and blocks the signed-in request for them.
  const res = await api.get<Blob>('/files/private-file', { params: { path }, responseType: 'blob' });
  return URL.createObjectURL(res.data);
}

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
  services: () => unwrap<TechnicianServicesDto>(api.get('/technician/services')),
  setServices: (serviceIds: string[]) => unwrap<TechnicianServicesDto>(api.put('/technician/services', { serviceIds })),
  setOnline: (online: boolean, coords?: { lat: number; lng: number }) =>
    unwrap<TechnicianProfileSummary>(api.post(online ? '/technician/online' : '/technician/offline', coords ?? {})),
  jobs: (tab: TechnicianTabParam) =>
    unwrap<{ items: TechnicianJobDto[]; counts: Record<Exclude<TechnicianTabParam, 'all'>, number> }>(
      api.get('/technician/jobs', { params: { tab } }),
    ),
  job: (id: string) => unwrap<TechnicianJobDetailDto>(api.get(`/technician/jobs/${id}`)),
  requests: () => unwrap<TechnicianRequestDto[]>(api.get('/technician/requests')),
  act: (id: string, action: TechnicianJobAction, reason?: string, position?: { lat: number; lng: number }) =>
    unwrap<TechnicianJobDetailDto | null>(api.post(`/technician/jobs/${id}/${ACTION_PATH[action]}`, { reason, ...position })),
  saveNotes: (id: string, notes: string) => unwrap<TechnicianJobDetailDto>(api.put(`/technician/jobs/${id}/notes`, { notes })),
  earnings: (month?: string) => unwrap<TechnicianEarningsDto>(api.get('/technician/earnings', { params: { month } })),
  details: () => unwrap<TechnicianDetailsDto>(api.get('/technician/profile/details')),
  updateProfile: (body: Omit<PartnerRegistration, 'skills'> & { avatarUrl?: string | null }) =>
    unwrap<TechnicianDetailsDto>(api.put('/technician/profile', body)),
  locationKey: () => unwrap<{ token: string; expiresIn: number }>(api.post('/technician/location-key')),
  pingLocation: (lat: number, lng: number) => unwrap<{ accepted: boolean; travelling: boolean }>(api.post('/technician/location', { lat, lng })),
  payoutDetails: () => unwrap<PayoutDetailsDto>(api.get('/technician/payout-details')),
  savePayoutDetails: (body: { payoutUpiId?: string; bankAccountHolder?: string; bankIfsc?: string; bankAccountNumber?: string }) =>
    unwrap<PayoutDetailsDto>(api.put('/technician/payout-details', body)),
  documents: () => unwrap<TechnicianDocumentDto[]>(api.get('/technician/documents')),
  addDocument: (type: TechnicianDocumentDto['type'], fileUrl: string) =>
    unwrap<TechnicianDocumentDto>(api.post('/technician/documents', { type, fileUrl })),
  deleteDocument: (id: string) => unwrap<{ deleted: boolean }>(api.delete(`/technician/documents/${id}`)),
  wallet: () => unwrap<WalletDto>(api.get('/technician/wallet')),
  reviews: () => unwrap<TechnicianReviewDto[]>(api.get('/technician/reviews')),
  performance: () => unwrap<TechnicianPerformanceDto>(api.get('/technician/performance')),
  requestCharge: (id: string, body: { title: string; description?: string; amount: number }) =>
    unwrap<TechnicianJobDetailDto>(api.post(`/technician/jobs/${id}/additional-charges`, body)),
  addSparePart: (id: string, body: { name: string; quantity: number; unitPrice: number; billPhotoUrl?: string | null }) =>
    unwrap<TechnicianJobDetailDto>(api.post(`/technician/jobs/${id}/spare-parts`, body)),
  removeSparePart: (id: string, partId: string) => unwrap<TechnicianJobDetailDto>(api.delete(`/technician/jobs/${id}/spare-parts/${partId}`)),
  paymentLink: (id: string) => unwrap<PaymentLinkDto>(api.post(`/technician/jobs/${id}/payment-link`)),
  checkPaymentLink: (id: string, linkId: string) => unwrap<{ paid: boolean }>(api.get(`/technician/jobs/${id}/payment-link/${encodeURIComponent(linkId)}`)),
  collectPayment: (id: string, method: 'CASH' | 'UPI') => unwrap<TechnicianJobDetailDto>(api.post(`/technician/jobs/${id}/collect-payment`, { method })),
};

export const documentUploadApi = {
  /** KYC documents are stored privately (served only through /files/private). */
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap<UploadResultDto>(api.post('/uploads', form, { params: { private: 1 }, timeout: 120_000 }));
  },
};

// ─── Admin ───────────────────────────────────────────────────────────────
export const adminApi = {
  dashboard: (range: DashboardRange) => unwrap<AdminDashboardDto>(api.get('/admin/dashboard', { params: { range } })),
  users: async (params: { q?: string; role?: Role; page: number; pageSize: number }) => {
    const res = await api.get<ApiSuccess<AdminUserRowDto[]>>('/admin/users', { params });
    return { items: res.data.data, meta: res.data.meta! };
  },
  candidates: (bookingId: string) => unwrap<AssignmentCandidateDto[]>(api.get(`/admin/bookings/${bookingId}/candidates`)),
  assign: (bookingId: string, technicianId: string) =>
    unwrap<{ assigned: boolean }>(api.post(`/admin/bookings/${bookingId}/assign`, { technicianId })),
  changeRole: (id: string, role: Role) => unwrap<{ id: string; role: Role }>(api.patch(`/admin/users/${id}/role`, { role })),
};

export type BookingGroup = 'all' | 'searching' | 'upcoming' | 'inProgress' | 'awaitingPayment' | 'completed' | 'cancelled' | 'disputed';
export type CouponInput = Omit<AdminCouponDto, 'id' | 'usedCount'>;
export type ServiceInput = Omit<AdminServiceDto, 'id' | 'slug' | 'categoryName' | 'bookings'>;
export type CategoryInput = Omit<AdminCategoryDto, 'id' | 'slug' | 'services'>;
type PageParams = { page: number; pageSize: number };

export const adminModulesApi = {
  bookings: (params: { q?: string; group?: BookingGroup; from?: string; to?: string } & PageParams) =>
    unwrap<Paged<AdminBookingRowDto>>(api.get('/admin/bookings', { params: { ...params, group: params.group === 'all' ? undefined : params.group } })),
  booking: (id: string) => unwrap<AdminBookingDetailDto>(api.get(`/admin/bookings/${id}`)),
  cancelBooking: (id: string, reason: string) => unwrap<AdminBookingDetailDto>(api.post(`/admin/bookings/${id}/cancel`, { reason })),
  openDispute: (id: string, note: string) => unwrap<AdminBookingDetailDto>(api.post(`/admin/bookings/${id}/dispute`, { note })),
  resolveDispute: (id: string, resolution: 'PAYMENT_PENDING' | 'PAYMENT_COMPLETED' | 'REFUND' | 'CANCEL', note: string) =>
    unwrap<AdminBookingDetailDto>(api.post(`/admin/bookings/${id}/dispute/resolve`, { resolution, note })),
  refund: (bookingId: string, body: { amount?: number; reason: string }) => unwrap<{ refunded: boolean }>(api.post(`/admin/payments/${bookingId}/refund`, body)),

  customers: (params: { q?: string; status?: UserStatus } & PageParams) => unwrap<Paged<AdminCustomerRowDto>>(api.get('/admin/customers', { params })),
  customer: (id: string) => unwrap<AdminCustomerDetailDto>(api.get(`/admin/customers/${id}`)),
  setUserStatus: (userId: string, status: UserStatus, reason?: string) => unwrap<{ updated: boolean }>(api.post(`/admin/users/${userId}/status`, { status, reason })),

  technicians: (params: { q?: string; verification?: TechnicianVerificationStatus; online?: boolean } & PageParams) =>
    unwrap<Paged<AdminTechnicianRowDto>>(api.get('/admin/technicians', { params })),
  liveTechnicians: () => unwrap<AdminTechnicianRowDto[]>(api.get('/admin/technicians/live')),
  technician: (id: string) => unwrap<AdminTechnicianDetailDto>(api.get(`/admin/technicians/${id}`)),
  launch: () => unwrap<LaunchStateDto>(api.get('/admin/launch')),
  setLaunch: (body: { enabled: boolean; headline?: string; subline?: string }) => unwrap<LaunchStateDto>(api.put('/admin/launch', body)),
  revealTechnicianAadhaar: (id: string) => unwrap<{ aadhaar: string | null; bankAccount: string | null }>(api.post(`/admin/technicians/${id}/aadhaar`)),
  setVerification: (id: string, status: TechnicianVerificationStatus, reason?: string) =>
    unwrap<AdminTechnicianDetailDto>(api.post(`/admin/technicians/${id}/verification`, { status, reason })),
  setSkills: (id: string, categoryIds: string[]) => unwrap<AdminTechnicianDetailDto>(api.put(`/admin/technicians/${id}/skills`, { categoryIds })),
  reviewDocument: (id: string, status: 'APPROVED' | 'REJECTED', remarks?: string) =>
    unwrap<{ reviewed: boolean }>(api.post(`/admin/technicians/documents/${id}`, { status, remarks })),

  categories: () => unwrap<AdminCategoryDto[]>(api.get('/admin/categories')),
  saveCategory: (id: string | null, body: CategoryInput) =>
    unwrap<unknown>(id ? api.put(`/admin/categories/${id}`, body) : api.post('/admin/categories', body)),
  services: (params: { categoryId?: string; q?: string }) => unwrap<AdminServiceDto[]>(api.get('/admin/services', { params })),
  saveService: (id: string | null, body: ServiceInput) => unwrap<unknown>(id ? api.put(`/admin/services/${id}`, body) : api.post('/admin/services', body)),
  offers: () => unwrap<AdminCouponDto[]>(api.get('/admin/offers')),
  saveOffer: (id: string | null, body: CouponInput) => unwrap<unknown>(id ? api.put(`/admin/offers/${id}`, body) : api.post('/admin/offers', body)),

  payments: (params: { from?: string; to?: string; method?: string; status?: string } & PageParams) =>
    unwrap<AdminPaymentsDto>(api.get('/admin/payments', { params })),
  wallets: (q?: string) => unwrap<AdminWalletRowDto[]>(api.get('/admin/payouts/wallets', { params: { q } })),
  payouts: () => unwrap<AdminPayoutDto[]>(api.get('/admin/payouts')),
  createPayout: (body: { technicianId: string; amount: number; method: 'UPI' | 'BANK_TRANSFER' | 'CASH'; reference: string }) =>
    unwrap<unknown>(api.post('/admin/payouts', body)),

  reviews: (params: { rating?: number; visible?: boolean } & PageParams) => unwrap<Paged<AdminReviewDto>>(api.get('/admin/reviews', { params })),
  setReviewVisibility: (id: string, isVisible: boolean) => unwrap<{ updated: boolean }>(api.patch(`/admin/reviews/${id}`, { isVisible })),
  complaints: (params: { status?: ComplaintDto['status'] } & PageParams) => unwrap<Paged<ComplaintDto>>(api.get('/admin/complaints', { params })),
  updateComplaint: (id: string, body: { status?: ComplaintDto['status']; resolution?: string; assignToMe?: boolean }) =>
    unwrap<ComplaintDto>(api.patch(`/admin/complaints/${id}`, body)),
  broadcasts: () => unwrap<BroadcastDto[]>(api.get('/admin/notifications/broadcasts')),
  broadcast: (body: { audience: BroadcastDto['audience']; title: string; body: string }) => unwrap<unknown>(api.post('/admin/notifications/broadcast', body)),

  report: (from: string, to: string) => unwrap<ReportDto>(api.get('/admin/reports', { params: { from, to } })),
  settings: () => unwrap<SettingDto[]>(api.get('/admin/settings')),
  updateSetting: (key: string, value: unknown) => unwrap<SettingDto[]>(api.put(`/admin/settings/${encodeURIComponent(key)}`, { value })),
  auditLogs: (params: { action?: string; q?: string } & PageParams) => unwrap<Paged<AuditLogDto>>(api.get('/admin/audit-logs', { params })),
  auditActions: () => unwrap<string[]>(api.get('/admin/audit-logs/actions')),
  system: () => unwrap<SystemStatusDto>(api.get('/admin/system')),
  serviceArea: () => unwrap<AdminServiceAreaDto>(api.get('/admin/service-area')),
  updateServiceArea: (id: string, body: { isActive?: boolean; radiusKm?: number }) => unwrap<unknown>(api.patch(`/admin/service-area/${id}`, body)),
  createLocality: (body: LocationInput) => unwrap<{ id: string }>(api.post('/admin/service-area', body)),
  setLocalityFranchise: (id: string, franchiseId: string | null) => unwrap<unknown>(api.put(`/admin/service-area/${id}/franchise`, { franchiseId })),
};

export const franchiseApi = {
  list: () => unwrap<FranchiseRowDto[]>(api.get('/admin/franchises')),
  detail: (id: string) => unwrap<FranchiseDetailDto>(api.get(`/admin/franchises/${id}`)),
  create: (body: FranchiseFormInput) => unwrap<FranchiseDetailDto>(api.post('/admin/franchises', body)),
  update: (id: string, body: FranchiseFormInput) => unwrap<FranchiseDetailDto>(api.put(`/admin/franchises/${id}`, body)),
  setStatus: (id: string, status: FranchiseStatus, reason?: string) => unwrap<FranchiseDetailDto>(api.post(`/admin/franchises/${id}/status`, { status, reason })),
  revealAadhaar: (id: string) => unwrap<{ aadhaar: string }>(api.post(`/admin/franchises/${id}/aadhaar`)),
  report: (from: string, to: string) => unwrap<FranchiseReportDto>(api.get('/admin/franchises/report', { params: { from, to } })),
  mine: () => unwrap<MyFranchiseDto>(api.get('/admin/franchise/me')),
  setTechnicianFranchise: (technicianId: string, franchiseId: string | null) => unwrap<unknown>(api.put(`/admin/technicians/${technicianId}/franchise`, { franchiseId })),
};

export type ExportKind = 'franchises' | 'technicians' | 'customers' | 'addresses' | 'bookings';
/** Downloads a CSV (opens in Excel / Google Sheets) through the signed-in session. */
export async function downloadExport(kind: ExportKind, range: { from?: string; to?: string } = {}) {
  const res = await api.get<Blob>(`/admin/exports/${kind}`, { params: range, responseType: 'blob', timeout: 120_000 });
  const name = /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ?? `rapidfix-${kind}.csv`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface AdminServiceAreaDto {
  locations: { id: string; name: string; district: string; state: string; latitude: number; longitude: number; radiusKm: number; isActive: boolean; franchiseId: string | null; franchise: string | null }[];
  interest: { id: string; name: string | null; phone: string | null; label: string; latitude: number | null; longitude: number | null; createdAt: string }[];
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const assistantApi = {
  chat: (messages: AssistantMessage[]) => unwrap<{ reply: string }>(api.post('/assistant/chat', { messages }, { timeout: 60_000 })),
};
