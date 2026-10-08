import type {
  AdditionalChargeDto,
  SparePartDto,
  AddressSnapshot,
  ComplaintDto,
  PaymentInfoDto,
  TechnicianDocumentDto,
  TimelineStepDto,
} from './dto';
import type { BookingStatus, FranchiseStatus, Role, TechnicianVerificationStatus, UserStatus } from './enums';

/** Admin module contracts. Money in paise, dates ISO. */

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Bookings ────────────────────────────────────────────────────────────

export interface AdminBookingRowDto {
  id: string;
  code: string;
  status: BookingStatus;
  service: string;
  category: string;
  customerName: string;
  customerPhone: string | null;
  technicianName: string | null;
  scheduledFor: string;
  timeSlot: string;
  scheduleType: 'NOW' | 'SCHEDULED';
  locality: string;
  /** Franchise that owns the booking (null = RapidFix head office). */
  franchise: string | null;
  totalAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
}

export interface AdminBookingDetailDto extends AdminBookingRowDto {
  description: string;
  photos: string[];
  address: AddressSnapshot;
  customer: { id: string; userId: string; name: string | null; phone: string | null; email: string | null };
  technician: { id: string; userId: string; name: string | null; phone: string | null; ratingAvg: number } | null;
  price: { serviceCharge: number; visitCharge: number; additionalCharges: number; spareParts: number; discount: number; tax: number; total: number };
  commissionAmount: number | null;
  technicianEarning: number | null;
  couponCode: string | null;
  payment: PaymentInfoDto | null;
  transactions: { id: string; type: string; status: string; amount: number; provider: string; providerRef: string | null; createdAt: string }[];
  history: { from: BookingStatus | null; to: BookingStatus; note: string | null; by: string | null; at: string }[];
  assignments: { technicianName: string; status: string; isManual: boolean; distanceKm: number | null; offeredAt: string; respondedAt: string | null }[];
  additionalChargeItems: AdditionalChargeDto[];
  sparePartItems: SparePartDto[];
  complaints: ComplaintDto[];
  review: { rating: number; comment: string | null } | null;
  timeline: TimelineStepDto[];
  cancellationReason: string | null;
  canCancel: boolean;
  canAssign: boolean;
  canResolveDispute: boolean;
  canRefund: boolean;
}

// ─── People ──────────────────────────────────────────────────────────────

export interface AdminCustomerRowDto {
  id: string;
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  franchise: string | null;
  status: UserStatus;
  bookings: number;
  spent: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminCustomerDetailDto extends AdminCustomerRowDto {
  referralCode: string;
  addresses: number;
  bookingsList: AdminBookingRowDto[];
  payments: { bookingCode: string; amount: number; method: string; status: string; paidAt: string | null }[];
  reviews: { id: string; rating: number; comment: string | null; service: string; technician: string; createdAt: string }[];
  complaints: ComplaintDto[];
}

export interface AdminTechnicianRowDto {
  id: string;
  userId: string;
  name: string | null;
  phone: string | null;
  title: string;
  skills: string[];
  villageTown: string;
  district: string;
  franchise: string | null;
  franchiseId: string | null;
  verificationStatus: TechnicianVerificationStatus;
  userStatus: UserStatus;
  isOnline: boolean;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  activeJobs: number;
  walletBalance: number;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastLocationAt: string | null;
  /** ID proofs uploaded and waiting for review. */
  pendingDocuments: number;
  createdAt: string;
}

export interface AdminTechnicianDetailDto extends AdminTechnicianRowDto {
  email: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  alternatePhone: string | null;
  hasOwnTools: boolean;
  hasVehicle: boolean;
  bio: string | null;
  experienceYears: number;
  languages: string[];
  serviceRadiusKm: number;
  addressLine: string;
  state: string;
  pincode: string;
  rejectionReason: string | null;
  skillIds: string[];
  documents: TechnicianDocumentDto[];
  /** ID numbers given at sign-up (full Aadhaar only through the audited reveal). */
  kyc: { aadhaarLast4: string | null; panNumber: string | null };
  bookings: AdminBookingRowDto[];
  earnings: { month: number; total: number; totalPaidOut: number; balance: number };
  payout: { upiId: string | null; bankAccountHolder: string | null; bankIfsc: string | null; bankAccountLast4: string | null };
  reviews: { id: string; rating: number; comment: string | null; customer: string; createdAt: string }[];
  complaints: ComplaintDto[];
}

// ─── Catalogue & offers ──────────────────────────────────────────────────

export interface AdminCategoryDto {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  tagline: string;
  professionalTitle: string;
  iconKey: string;
  imageUrl: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  services: number;
  commission: { type: 'PERCENTAGE' | 'FIXED'; value: number } | null;
}

export interface AdminServiceDto {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  imageUrl: string | null;
  basePrice: number;
  visitCharge: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  inclusions: string[];
  exclusions: string[];
  warrantyDays: number;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  commission: { type: 'PERCENTAGE' | 'FIXED'; value: number } | null;
  bookings: number;
}

export interface AdminCouponDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  terms: string[];
  highlights: string[];
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  perCustomerLimit: number;
  usedCount: number;
  isFirstBookingOnly: boolean;
  categoryId: string | null;
  serviceId: string | null;
  locationId: string | null;
  isActive: boolean;
}

// ─── Money ───────────────────────────────────────────────────────────────

export interface AdminPaymentsDto {
  summary: {
    revenue: number;
    commission: number;
    technicianEarnings: number;
    tax: number;
    refunds: number;
    byMethod: { method: string; amount: number; count: number }[];
    failed: number;
    pending: number;
  };
  transactions: {
    id: string;
    bookingId: string;
    bookingCode: string;
    customerName: string;
    type: 'CHARGE' | 'REFUND';
    status: string;
    method: string;
    amount: number;
    providerRef: string | null;
    createdAt: string;
  }[];
  total: number;
}

export interface AdminWalletRowDto {
  technicianId: string;
  name: string | null;
  phone: string | null;
  balance: number;
  totalEarned: number;
  totalPaidOut: number;
  upiId: string | null;
  bankAccountLast4: string | null;
  bankIfsc: string | null;
}

export interface AdminPayoutDto {
  id: string;
  technicianId: string;
  technicianName: string | null;
  amount: number;
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED';
  method: string;
  reference: string | null;
  processedAt: string | null;
  createdAt: string;
}

// ─── Feedback, comms, platform ───────────────────────────────────────────

export interface AdminReviewDto {
  id: string;
  bookingCode: string;
  service: string;
  customerName: string | null;
  technicianName: string | null;
  rating: number;
  comment: string | null;
  isVisible: boolean;
  createdAt: string;
}

export interface BroadcastDto {
  id: string;
  audience: 'CUSTOMERS' | 'TECHNICIANS' | 'ALL';
  title: string;
  body: string;
  recipients: number;
  sentBy: string | null;
  createdAt: string;
}

export interface ReportDto {
  from: string;
  to: string;
  bookings: number;
  completed: number;
  cancelled: number;
  cancellationRate: number;
  revenue: number;
  commission: number;
  technicianEarnings: number;
  averageBookingValue: number;
  newCustomers: number;
  repeatCustomers: number;
  newTechnicians: number;
  averageRating: number;
  ratings: number;
  daily: { date: string; bookings: number; completed: number; revenue: number }[];
  topServices: { name: string; bookings: number; revenue: number }[];
  topLocations: { name: string; bookings: number; revenue: number }[];
  technicianPerformance: { name: string; jobs: number; earnings: number; rating: number; acceptanceRate: number | null }[];
}

export interface SettingDto {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string | null;
}

export interface AuditLogDto {
  id: string;
  actorName: string | null;
  actorRole: Role | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: string;
}

export interface SystemStatusDto {
  environment: string;
  version: string;
  database: { ok: boolean; latencyMs: number };
  integrations: { name: string; configured: boolean; detail: string }[];
  workers: { name: string; detail: string }[];
}

// ─── Franchises ──────────────────────────────────────────────────────────

export interface FranchiseLocalityDto {
  id: string;
  name: string;
  district: string;
  state: string;
  radiusKm: number;
  isActive: boolean;
}

/** Money in paise. `share` = franchise's cut of RapidFix's commission at the agreed %. */
export interface FranchiseStatsDto {
  bookings: number;
  completed: number;
  cancelled: number;
  revenue: number;
  commission: number;
  share: number;
  technicians: number;
  customers: number;
}

export interface FranchiseRowDto {
  id: string;
  code: string;
  name: string;
  town: string;
  district: string;
  state: string;
  status: FranchiseStatus;
  ownerName: string;
  ownerPhone: string;
  commissionPercent: number;
  agreementStart: string;
  agreementEnd: string | null;
  localities: FranchiseLocalityDto[];
  /** This calendar month (IST). */
  month: FranchiseStatsDto;
  /** All time. */
  total: FranchiseStatsDto;
  createdAt: string;
}

export interface FranchiseDetailDto extends FranchiseRowDto {
  userId: string;
  ownerEmail: string | null;
  ownerDateOfBirth: string | null;
  ownerAddress: string;
  ownerPincode: string;
  /** "XXXX XXXX 1234" — the full number is shown only on request (audited). */
  aadhaarMasked: string;
  aadhaarFrontUrl: string;
  aadhaarBackUrl: string | null;
  panNumber: string | null;
  panPhotoUrl: string | null;
  gstin: string | null;
  businessName: string | null;
  agreementUrl: string | null;
  depositAmount: number;
  bankAccountHolder: string | null;
  bankIfsc: string | null;
  bankAccountLast4: string | null;
  upiId: string | null;
  emergencyContact: string | null;
  notes: string | null;
}

export interface FranchiseInput {
  name: string;
  town: string;
  district: string;
  state: string;
  ownerName: string;
  /** 10-digit Indian mobile; the manager signs in with it (OTP). Fixed after creation. */
  ownerPhone: string;
  ownerEmail?: string | null;
  ownerDateOfBirth?: string | null;
  ownerAddress: string;
  ownerPincode: string;
  /** 12 digits. Optional on edit (blank keeps the saved one). */
  aadhaarNumber?: string;
  aadhaarFrontUrl: string;
  aadhaarBackUrl?: string | null;
  panNumber?: string | null;
  panPhotoUrl?: string | null;
  gstin?: string | null;
  businessName?: string | null;
  commissionPercent: number;
  agreementStart: string;
  agreementEnd?: string | null;
  agreementUrl?: string | null;
  depositAmount?: number;
  bankAccountHolder?: string | null;
  bankIfsc?: string | null;
  /** Optional on edit (blank keeps the saved one). */
  bankAccountNumber?: string | null;
  upiId?: string | null;
  emergencyContact?: string | null;
  notes?: string | null;
  localityIds: string[];
}

export interface FranchiseReportDto {
  from: string;
  to: string;
  rows: (FranchiseStatsDto & { franchiseId: string | null; code: string; name: string; status: FranchiseStatus | null; commissionPercent: number })[];
  totals: FranchiseStatsDto;
}

/** The signed-in franchise manager's own summary (dashboard banner). */
export interface MyFranchiseDto {
  id: string;
  code: string;
  name: string;
  town: string;
  commissionPercent: number;
  localities: FranchiseLocalityDto[];
  month: FranchiseStatsDto;
  total: FranchiseStatsDto;
}

export interface LocationInput {
  name: string;
  district: string;
  state: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  isActive?: boolean;
  franchiseId?: string | null;
}
