/**
 * API response shapes shared by the backend (producer) and web app (consumer).
 * Money is always integer paise. Dates are ISO strings.
 */
import type {
  AddressLabel,
  BookingStatus,
  DiscountType,
  PaymentMethod,
  PaymentStatus,
  Role,
  TechnicianVerificationStatus,
  UserStatus,
} from './enums';

// ─── Catalogue ───────────────────────────────────────────────────────────

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  iconKey: string;
  imageUrl: string | null;
  professionalTitle: string;
  serviceCount: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  iconKey: string;
}

export interface ServiceSummaryDto {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  imageUrl: string | null;
  basePrice: number;
  visitCharge: number;
  durationMinMinutes: number;
  durationMaxMinutes: number;
  isPopular: boolean;
  category: CategoryRef;
}

export interface ServiceDetailDto extends ServiceSummaryDto {
  description: string;
  inclusions: string[];
  exclusions: string[];
  warrantyDays: number;
}

export interface LocationDto {
  id: string;
  name: string;
  district: string;
  state: string;
  /** "AP" */
  stateCode: string;
  latitude: number;
  longitude: number;
}

export interface NearbyTechnicianDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number;
  distanceKm: number;
  /** Primary skill's category — lets the card deep-link into booking. */
  categorySlug: string | null;
}

// ─── Offers & pricing ────────────────────────────────────────────────────

export interface OfferDto {
  id: string;
  code: string;
  /** Marketing name, e.g. "AC Service Offer" */
  title: string;
  description: string;
  /** e.g. "FLAT 20% OFF", "FLAT ₹100 OFF" */
  badge: string;
  discountType: DiscountType;
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  endsAt: string;
  terms: string[];
  highlights: string[];
  isFirstBookingOnly: boolean;
  category: CategoryRef | null;
  service: { id: string; name: string; slug: string } | null;
}

export interface PriceBreakdownDto {
  serviceCharge: number;
  visitCharge: number;
  additionalCharges: number;
  subtotal: number;
  discount: number;
  taxPercent: number;
  tax: number;
  total: number;
  coupon: { code: string; valid: boolean; message: string | null } | null;
}

// ─── Addresses ───────────────────────────────────────────────────────────

export interface AddressDto {
  id: string;
  label: AddressLabel;
  houseNo: string;
  street: string;
  area: string;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export type AddressSnapshot = Omit<AddressDto, 'id' | 'isDefault'>;

// ─── Bookings ────────────────────────────────────────────────────────────

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineStepDto {
  key: string;
  label: string;
  at: string | null;
  state: TimelineState;
}

export interface BookingServiceRef {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  iconKey: string;
}

export interface BookingTechnicianDto {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  title: string;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number;
  isVerified: boolean;
  /** Straight-line distance from the booking address, when both locations are known. */
  distanceKm: number | null;
  etaMinutes: number | null;
  /** Live position — shared with the customer only while the technician is en route. */
  location: { lat: number; lng: number } | null;
}

export interface BookingListItemDto {
  id: string;
  code: string;
  status: BookingStatus;
  service: BookingServiceRef;
  scheduleType: 'NOW' | 'SCHEDULED';
  scheduledFor: string;
  timeSlot: string;
  /** "Tanuku, AP" */
  locality: string;
  totalAmount: number;
  technicianName: string | null;
  timeline: TimelineStepDto[];
}

export interface BookingDetailDto extends BookingListItemDto {
  description: string;
  photos: string[];
  videoUrl: string | null;
  address: AddressSnapshot;
  price: {
    serviceCharge: number;
    visitCharge: number;
    additionalCharges: number;
    /** Spare parts the technician bought for the job. */
    spareParts: number;
    discount: number;
    tax: number;
    total: number;
  };
  couponCode: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  technician: BookingTechnicianDto | null;
  canCancel: boolean;
  canReschedule: boolean;
  cancellationReason: string | null;
  createdAt: string;
  additionalChargeItems: AdditionalChargeDto[];
  sparePartItems: SparePartDto[];
  payment: PaymentInfoDto | null;
  review: ReviewInfoDto | null;
  /** Razorpay keys are configured on the server. */
  onlinePaymentAvailable: boolean;
  /** Still to be paid (total minus what was already paid online); 0 once settled or cancelled. */
  amountDue: number;
  /** To pay now, before the booking goes to technicians (the advance or the full bill); 0 once paid. */
  payNow: number;
}

export interface CustomerBookingStatsDto {
  upcoming: number;
  active: number;
  completed: number;
  cancelled: number;
}

// ─── Customer account ────────────────────────────────────────────────────

export interface CustomerProfileDto {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  city: string | null;
  language: string;
  notificationsEnabled: boolean;
  marketingOptIn: boolean;
  referralCode: string;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

// ─── Technician ──────────────────────────────────────────────────────────

export type TechnicianJobAction = 'ACCEPT' | 'REJECT' | 'EN_ROUTE' | 'ARRIVED' | 'START' | 'COMPLETE';

export interface TechnicianJobDto {
  id: string;
  code: string;
  status: BookingStatus;
  service: BookingServiceRef;
  customerName: string;
  scheduleType: 'NOW' | 'SCHEDULED';
  scheduledFor: string;
  timeSlot: string;
  locality: string;
  totalAmount: number;
}

export interface TechnicianJobDetailDto extends TechnicianJobDto {
  customerPhone: string | null;
  address: AddressSnapshot;
  latitude: number | null;
  longitude: number | null;
  description: string;
  photos: string[];
  technicianNotes: string | null;
  timeline: TimelineStepDto[];
  actions: TechnicianJobAction[];
  price: { serviceCharge: number; visitCharge: number; additionalCharges: number; spareParts: number; discount: number; tax: number; total: number };
  additionalChargeItems: AdditionalChargeDto[];
  sparePartItems: SparePartDto[];
  payment: PaymentInfoDto | null;
  canRequestAdditionalCharge: boolean;
  /** From starting the work until the bill is paid. */
  canEditSpareParts: boolean;
  canCollectPayment: boolean;
  /** Left to collect from the customer (0 when the customer prepaid online). */
  amountDue: number;
  /** The technician can show a Razorpay QR / send a payment link. */
  onlinePaymentAvailable: boolean;
}

export interface TechnicianProfileSummary {
  id: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  title: string;
  isOnline: boolean;
  verificationStatus: TechnicianVerificationStatus;
  ratingAvg: number;
  ratingCount: number;
  experienceYears: number;
  skills: CategoryRef[];
}

export interface TechnicianDashboardDto {
  profile: TechnicianProfileSummary;
  today: { jobs: number; completed: number; earnings: number };
  schedule: TechnicianJobDto[];
}

export interface EarningsLedgerRow {
  bookingId: string;
  code: string;
  service: string;
  gross: number;
  commission: number;
  net: number;
  date: string;
}

export interface TechnicianEarningsDto {
  today: number;
  week: number;
  month: number;
  total: number;
  /** Month-over-month growth; null when last month had no earnings. */
  monthGrowthPct: number | null;
  completedJobs: number;
  cancelledJobs: number;
  ratingAvg: number;
  ledger: EarningsLedgerRow[];
}

export interface TechnicianRequestDto {
  assignmentId: string;
  bookingId: string;
  code: string;
  service: { name: string; slug: string; iconKey: string; imageUrl: string | null };
  locality: string;
  area: string;
  distanceKm: number | null;
  scheduleType: 'NOW' | 'SCHEDULED';
  scheduledFor: string;
  timeSlot: string;
  description: string;
  /** Technician's share after RapidFix commission (paise). */
  estimatedEarning: number;
  offeredAt: string;
  expiresAt: string;
  isManual: boolean;
}

// ─── Dispatch ────────────────────────────────────────────────────────────

export interface AssignmentCandidateDto {
  technicianId: string;
  name: string;
  avatarUrl: string | null;
  title: string;
  isOnline: boolean;
  distanceKm: number | null;
  ratingAvg: number;
  activeJobs: number;
  score: number;
  eligible: boolean;
  /** Why an ineligible technician was skipped. */
  reason: string | null;
}

// ─── Public trust content ────────────────────────────────────────────────

export interface PublicStatsDto {
  verifiedProfessionals: number;
  jobsCompleted: number;
  averageRating: number;
  townsServed: number;
  maxWarrantyDays: number;
}

export interface FeaturedReviewDto {
  id: string;
  /** "Rajesh K." */
  name: string;
  town: string;
  service: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface GeoAddressDto {
  title: string;
  formatted: string;
  houseNo: string;
  street: string;
  area: string;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
}

export interface GeoPlaceDto {
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

// ─── Admin ───────────────────────────────────────────────────────────────

export interface KpiDto {
  total: number;
  thisMonth: number;
  /** vs last month; null when last month was 0. */
  growthPct: number | null;
}

export type DashboardRange = 'today' | '7d' | '30d';

export interface AdminDashboardDto {
  range: DashboardRange;
  kpis: { customers: KpiDto; technicians: KpiDto; bookings: KpiDto; revenue: KpiDto };
  bookingsOverview: { date: string; completed: number; active: number; cancelled: number }[];
  categoryShare: { name: string; iconKey: string; count: number; pct: number }[];
  summary: { newBookings: number; activeServices: number; completed: number; cancelled: number };
  recentBookings: {
    id: string;
    code: string;
    customerName: string;
    customerAvatarUrl: string | null;
    service: string;
    technicianName: string | null;
    technicianAvatarUrl: string | null;
    scheduledFor: string;
    status: BookingStatus;
    amount: number;
  }[];
  liveTechnicians: { id: string; name: string; avatarUrl: string | null; title: string; isOnline: boolean }[];
  revenue: {
    points: { date: string; revenue: number }[];
    total: number;
    growthPct: number | null;
    thisPeriod: number;
    payouts: number;
    payoutsGrowthPct: number | null;
    payoutsThisPeriod: number;
  };
  topServices: { name: string; iconKey: string; count: number; pct: number }[];
  recentReviews: { id: string; customerName: string; service: string; rating: number; comment: string | null; createdAt: string }[];
}

export interface AdminUserRowDto {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  role: Role;
  status: UserStatus;
  technicianStatus: TechnicianVerificationStatus | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UploadResultDto {
  /** Server-relative path, e.g. /uploads/2026/09/abc.jpg */
  path: string;
  kind: 'image' | 'video';
  size: number;
}

// ─── Chat ────────────────────────────────────────────────────────────────

export interface MessageDto {
  id: string;
  bookingId: string;
  senderId: string;
  senderRole: 'CUSTOMER' | 'TECHNICIAN' | 'STAFF';
  senderName: string;
  body: string | null;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ChatInfoDto {
  bookingId: string;
  code: string;
  service: string;
  counterpart: { name: string; phone: string | null; avatarUrl: string | null; role: 'CUSTOMER' | 'TECHNICIAN' };
  canSend: boolean;
  /** Chat blocked by this user ('me') or by the other person ('them'). */
  blockedBy: 'me' | 'them' | null;
}

// ─── Work & money ────────────────────────────────────────────────────────

export interface AdditionalChargeDto {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  respondedAt: string | null;
}

/** A spare part the technician bought for the job (on the bill and invoice). Amounts in paise. */
export interface SparePartDto {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  /** Photo of the shop bill (public upload path), if the technician added one. */
  billPhotoUrl: string | null;
  createdAt: string;
}

export interface PaymentInfoDto {
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  method: 'CASH' | 'UPI' | 'RAZORPAY';
  amount: number;
  paidAt: string | null;
  invoiceNumber: string | null;
  refundedAmount: number;
  /** Paid online through Razorpay so far (booking advance and/or balance). */
  paidOnline: number;
}

export interface ReviewInfoDto {
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface RazorpayOrderDto {
  orderId: string;
  keyId: string;
  amount: number;
  currency: 'INR';
  bookingCode: string;
  prefill: { name: string; contact: string; email: string };
}

/** A Razorpay payment link the technician shows as a QR code (also texted to the customer). */
export interface PaymentLinkDto {
  linkId: string;
  shortUrl: string;
  amount: number;
  expiresAt: string | null;
}

export interface InvoiceDto {
  invoiceNumber: string;
  issuedAt: string;
  status: 'PAID' | 'DUE' | 'REFUNDED';
  seller: { name: string; tagline: string; developer: string; supportPhone: string; supportEmail: string };
  customer: { name: string; phone: string | null; address: string };
  technician: { name: string } | null;
  bookingCode: string;
  service: string;
  serviceDate: string;
  items: { name: string; quantity: number; unitPrice: number; amount: number; kind?: 'SPARE_PART' }[];
  /** Spare parts included in the subtotal. */
  spareParts: number;
  subtotal: number;
  discount: number;
  couponCode: string | null;
  taxPercent: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paidAt: string | null;
}

export interface WalletTxnDto {
  id: string;
  type: 'EARNING_CREDIT' | 'COMMISSION_DEBIT' | 'PAYOUT_DEBIT' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface WalletDto {
  balance: number;
  totalEarned: number;
  totalPaidOut: number;
  transactions: WalletTxnDto[];
}

export interface PayoutDetailsDto {
  payoutUpiId: string | null;
  bankAccountHolder: string | null;
  bankIfsc: string | null;
  bankAccountLast4: string | null;
}

export interface TechnicianDocumentDto {
  id: string;
  type: 'AADHAAR' | 'PAN' | 'DRIVING_LICENSE' | 'CERTIFICATE' | 'PROFILE_PHOTO' | 'OTHER';
  fileUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  remarks: string | null;
  createdAt: string;
}

export interface TechnicianPerformanceDto {
  offersReceived: number;
  offersAccepted: number;
  acceptanceRate: number | null;
  jobsCompleted: number;
  jobsCancelled: number;
  ratingAvg: number;
  ratingCount: number;
  ratingBreakdown: { stars: number; count: number }[];
}

export interface ComplaintDto {
  id: string;
  bookingId: string | null;
  bookingCode: string | null;
  raisedBy: { id: string; name: string | null; role: Role };
  assignedTo: { id: string; name: string | null } | null;
  category: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TechnicianDetailsDto extends TechnicianProfileSummary {
  email: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  alternatePhone: string | null;
  hasOwnTools: boolean;
  hasVehicle: boolean;
  bio: string | null;
  languages: string[];
  serviceRadiusKm: number;
  addressLine: string | null;
  villageTown: string;
  district: string;
  state: string;
  pincode: string;
  baseLatitude: number | null;
  baseLongitude: number | null;
  rejectionReason: string | null;
  /** ID numbers given at sign-up: Aadhaar shows only its last 4 digits. */
  kyc: { aadhaarLast4: string | null; panNumber: string | null };
}

export interface TechnicianReviewDto {
  id: string;
  rating: number;
  comment: string | null;
  customerName: string;
  service: string;
  bookingCode: string | null;
  createdAt: string;
}

/** "Services I do": the technician's categories with every service in them, ticked = does it. */
export interface TechnicianServicesDto {
  categories: {
    id: string;
    name: string;
    services: { id: string; name: string; selected: boolean }[];
  }[];
}
