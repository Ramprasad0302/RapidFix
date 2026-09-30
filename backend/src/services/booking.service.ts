import {
  BOOKING_TAB_STATUSES,
  BookingStatus as B,
  SocketEvent,
  CUSTOMER_CANCELLABLE,
  CUSTOMER_RESCHEDULABLE,
  TIME_SLOTS,
  type AddressSnapshot,
  type BookingDetailDto,
  type BookingListItemDto,
  type BookingStatus,
  type BookingTab,
  type CustomerBookingStatsDto,
  type PaymentInfoDto,
} from '@fixora/shared-types';
import { formatBookingCode, haversineKm, type AddressInput } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { locality } from '../utils/locality';
import { transitionBooking } from './bookingState';
import { buildTimeline } from './bookingTimeline';
import { dispatchBooking } from './assignment.service';
import { geocodeAddress } from './geo.service';
import { estimatePrice } from './pricing.service';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { razorpayConfigured } from './payment.service';
import { emitBookingEvent } from './realtime.service';
import { isOwnUploadPath } from './storage.service';

const IST_OFFSET_MS = 330 * 60_000;
/** Average in-town two-wheeler speed used for ETA estimates. */
const TOWN_SPEED_KMPH = 20;

export const bookingInclude = {
  service: { include: { category: true } },
  technician: {
    include: {
      user: { select: { name: true, phone: true, avatarUrl: true } },
      skills: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } }, take: 1 },
    },
  },
  coupon: { select: { code: true } },
  statusHistory: { select: { toStatus: true, createdAt: true } },
  additionalCharges: { orderBy: { requestedAt: 'asc' } },
  payment: true,
  review: true,
} as const satisfies Prisma.BookingInclude;

type ChargeRow = { id: string; title: string; description: string | null; amount: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; requestedAt: Date; respondedAt: Date | null };
export const toChargeDto = (c: ChargeRow) => ({
  id: c.id,
  title: c.title,
  description: c.description,
  amount: c.amount,
  status: c.status,
  requestedAt: c.requestedAt.toISOString(),
  respondedAt: c.respondedAt?.toISOString() ?? null,
});
type PaymentRow = { status: PaymentInfoDto['status']; method: PaymentInfoDto['method']; amount: number; paidAt: Date | null; invoiceNumber: string | null; refundedAmount: number } | null;
export const toPaymentInfo = (p: PaymentRow): PaymentInfoDto | null =>
  p ? { status: p.status, method: p.method, amount: p.amount, paidAt: p.paidAt?.toISOString() ?? null, invoiceNumber: p.invoiceNumber, refundedAmount: p.refundedAmount } : null;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export const technicianTitle = (skills: { category: { professionalTitle: string } }[]) =>
  skills[0]?.category.professionalTitle ?? 'Technician';

const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function toListItem(b: BookingRow): BookingListItemDto {
  const snap = b.addressSnapshot as unknown as AddressSnapshot;
  return {
    id: b.id,
    code: b.code ?? '',
    status: b.status,
    service: {
      id: b.service.id,
      name: b.service.name,
      slug: b.service.slug,
      imageUrl: b.service.imageUrl,
      iconKey: b.service.category.iconKey,
    },
    scheduleType: b.scheduleType,
    scheduledFor: b.scheduledFor.toISOString(),
    timeSlot: b.timeSlot,
    locality: locality(snap),
    totalAmount: b.totalAmount,
    technicianName: b.technician?.user.name ?? null,
    timeline: buildTimeline('customer', b.status, b.statusHistory, b.createdAt),
  };
}

const TECH_CONTACT_VISIBLE: BookingStatus[] = [
  B.TECHNICIAN_ACCEPTED,
  B.TECHNICIAN_EN_ROUTE,
  B.TECHNICIAN_ARRIVED,
  B.SERVICE_STARTED,
  B.ADDITIONAL_CHARGE_REQUESTED,
  B.ADDITIONAL_CHARGE_APPROVED,
  B.SERVICE_COMPLETED,
  B.PAYMENT_PENDING,
];

export function toCustomerDetail(b: BookingRow): BookingDetailDto {
  const t = b.technician;
  let distanceKm: number | null = null;
  let etaMinutes: number | null = null;
  if (t && t.lastLatitude != null && t.lastLongitude != null && b.latitude != null && b.longitude != null) {
    distanceKm = Math.round(haversineKm(t.lastLatitude, t.lastLongitude, b.latitude, b.longitude) * 10) / 10;
    if (b.status === B.TECHNICIAN_EN_ROUTE) etaMinutes = Math.max(2, Math.ceil((distanceKm / TOWN_SPEED_KMPH) * 60));
  }
  return {
    ...toListItem(b),
    description: b.description,
    photos: asStringArray(b.photos),
    videoUrl: b.videoUrl,
    address: b.addressSnapshot as unknown as AddressSnapshot,
    price: {
      serviceCharge: b.serviceCharge,
      visitCharge: b.visitCharge,
      additionalCharges: b.additionalChargesTotal,
      discount: b.discountAmount,
      tax: b.taxAmount,
      total: b.totalAmount,
    },
    couponCode: b.coupon?.code ?? null,
    paymentMethod: b.paymentMethod,
    paymentStatus: b.paymentStatus,
    technician: t
      ? {
          id: t.id,
          name: t.user.name ?? 'RapidFix Professional',
          // The customer sees the number only once the technician has accepted the job.
          phone: TECH_CONTACT_VISIBLE.includes(b.status) ? t.user.phone : null,
          avatarUrl: t.user.avatarUrl,
          title: technicianTitle(t.skills),
          ratingAvg: t.ratingAvg,
          ratingCount: t.ratingCount,
          experienceYears: t.experienceYears,
          isVerified: t.verificationStatus === 'VERIFIED',
          distanceKm,
          etaMinutes,
          location:
            b.status === B.TECHNICIAN_EN_ROUTE && t.lastLatitude != null && t.lastLongitude != null
              ? { lat: t.lastLatitude, lng: t.lastLongitude }
              : null,
        }
      : null,
    canCancel: CUSTOMER_CANCELLABLE.includes(b.status),
    canReschedule: CUSTOMER_RESCHEDULABLE.includes(b.status),
    cancellationReason: b.cancellationReason,
    createdAt: b.createdAt.toISOString(),
    additionalChargeItems: b.additionalCharges.map(toChargeDto),
    payment: toPaymentInfo(b.payment),
    review: b.review ? { rating: b.review.rating, comment: b.review.comment, createdAt: b.review.createdAt.toISOString() } : null,
    onlinePaymentAvailable: razorpayConfigured(),
  };
}

// ─── Scheduling ──────────────────────────────────────────────────────────

/** "2026-10-01" + "14-16" → the slot start instant (IST). */
export function slotStart(date: string, slotId: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const slot = TIME_SLOTS.find((s) => s.id === slotId);
  if (!slot) throw AppError.badRequest('Choose a valid time slot', 'INVALID_SLOT');
  return new Date(Date.UTC(y, m - 1, d, slot.startHour, 0) - IST_OFFSET_MS);
}

export interface ScheduleInput {
  scheduleType: 'NOW' | 'SCHEDULED';
  date?: string | undefined;
  timeSlot?: string | undefined;
}

export function resolveSchedule(input: ScheduleInput): { scheduledFor: Date; timeSlot: string } {
  if (input.scheduleType === 'NOW') {
    return { scheduledFor: new Date(), timeSlot: input.timeSlot ?? 'NOW' };
  }
  if (!input.date || !input.timeSlot) throw AppError.badRequest('Choose a date and time slot', 'SCHEDULE_REQUIRED');
  const scheduledFor = slotStart(input.date, input.timeSlot);
  const slotEnd = scheduledFor.getTime() + 2 * 3_600_000;
  if (slotEnd <= Date.now()) throw AppError.badRequest('That time slot has already passed', 'SLOT_IN_PAST');
  if (scheduledFor.getTime() > Date.now() + 30 * 86_400_000) {
    throw AppError.badRequest('Bookings can be scheduled up to 30 days ahead', 'SLOT_TOO_FAR');
  }
  return { scheduledFor, timeSlot: input.timeSlot };
}

// ─── Create ──────────────────────────────────────────────────────────────

export interface CreateBookingInput extends ScheduleInput {
  serviceId: string;
  description: string;
  photos: string[];
  videoUrl?: string | null | undefined;
  addressId?: string | undefined;
  address?: AddressInput | undefined;
  saveAddress: boolean;
  couponCode?: string | undefined;
  paymentMethod: 'CASH' | 'UPI' | 'RAZORPAY';
}

async function resolveLocationId(lat: number | null | undefined, lng: number | null | undefined, town: string) {
  const locations = await prisma.location.findMany({ where: { isActive: true } });
  if (lat != null && lng != null) {
    const near = locations
      .map((l) => ({ l, d: haversineKm(lat, lng, l.latitude, l.longitude) }))
      .filter(({ l, d }) => d <= l.radiusKm)
      .sort((a, b) => a.d - b.d)[0];
    if (near) return near.l.id;
  }
  return locations.find((l) => l.name.toLowerCase() === town.trim().toLowerCase())?.id ?? null;
}

export async function createBooking(customerId: string, userId: string, input: CreateBookingInput): Promise<BookingDetailDto> {
  for (const p of [...input.photos, ...(input.videoUrl ? [input.videoUrl] : [])]) {
    if (!isOwnUploadPath(p)) throw AppError.badRequest('Invalid attachment', 'INVALID_ATTACHMENT');
  }
  const { scheduledFor, timeSlot } = resolveSchedule(input);

  // Double-tap / flaky-network retry protection: same request within 2 minutes returns the same booking.
  const duplicate = await prisma.booking.findFirst({
    where: {
      customerId,
      serviceId: input.serviceId,
      timeSlot,
      createdAt: { gte: new Date(Date.now() - 120_000) },
      status: { in: [B.PENDING, B.SEARCHING] },
      ...(input.scheduleType === 'SCHEDULED' && { scheduledFor }),
    },
    include: bookingInclude,
  });
  if (duplicate) return toCustomerDetail(duplicate);

  // No GPS pin on a typed address? Geocode it so dispatch can measure distance.
  if (input.address && (input.address.latitude == null || input.address.longitude == null) && env.NODE_ENV !== 'test') {
    const point = await geocodeAddress(input.address);
    if (point) input = { ...input, address: { ...input.address, ...point } };
  }

  const { service, breakdown, coupon } = await estimatePrice(input.serviceId, input.couponCode, customerId);
  if (breakdown.coupon && !breakdown.coupon.valid) {
    throw AppError.badRequest(breakdown.coupon.message ?? 'Coupon is not valid', 'COUPON_INVALID');
  }

  const bookingId = await prisma.$transaction(async (tx) => {
    // Address: an owned saved address, or a new one (kept hidden unless the customer chose to save it).
    let address;
    if (input.addressId) {
      address = await tx.address.findFirst({ where: { id: input.addressId, customerId, deletedAt: null } });
      if (!address) throw AppError.notFound('Address not found', 'ADDRESS_NOT_FOUND');
    } else if (input.address) {
      const a = input.address;
      if (input.saveAddress && a.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      address = await tx.address.create({
        data: {
          customerId,
          label: a.label,
          houseNo: a.houseNo,
          street: a.street,
          area: a.area,
          villageTown: a.villageTown,
          district: a.district,
          state: a.state,
          pincode: a.pincode,
          landmark: a.landmark,
          latitude: a.latitude ?? null,
          longitude: a.longitude ?? null,
          isDefault: input.saveAddress && a.isDefault,
          deletedAt: input.saveAddress ? null : new Date(),
        },
      });
    } else {
      throw AppError.badRequest('Add a service address', 'ADDRESS_REQUIRED');
    }

    const snapshot: AddressSnapshot = {
      label: address.label,
      houseNo: address.houseNo,
      street: address.street,
      area: address.area,
      villageTown: address.villageTown,
      district: address.district,
      state: address.state,
      pincode: address.pincode,
      landmark: address.landmark,
      latitude: address.latitude,
      longitude: address.longitude,
    };

    if (coupon) {
      const { count } = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          isActive: true,
          ...(coupon.usageLimit != null && { usedCount: { lt: coupon.usageLimit } }),
        },
        data: { usedCount: { increment: 1 } },
      });
      if (count === 0) throw AppError.badRequest('This offer is fully redeemed', 'COUPON_INVALID');
    }

    const created = await tx.booking.create({
      data: {
        customerId,
        serviceId: service.id,
        addressId: address.id,
        locationId: await resolveLocationId(address.latitude, address.longitude, address.villageTown),
        couponId: coupon?.id ?? null,
        status: B.PENDING,
        description: input.description,
        photos: input.photos,
        videoUrl: input.videoUrl ?? null,
        scheduleType: input.scheduleType,
        scheduledFor,
        timeSlot,
        addressSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        latitude: address.latitude,
        longitude: address.longitude,
        serviceCharge: breakdown.serviceCharge,
        visitCharge: breakdown.visitCharge,
        discountAmount: breakdown.discount,
        taxAmount: breakdown.tax,
        totalAmount: breakdown.total,
        paymentMethod: input.paymentMethod,
        items: {
          create: [
            { type: 'SERVICE', name: service.name, unitPrice: service.basePrice, amount: service.basePrice },
            ...(service.visitCharge
              ? [{ type: 'VISIT' as const, name: 'Visit charge', unitPrice: service.visitCharge, amount: service.visitCharge }]
              : []),
          ],
        },
        statusHistory: { create: { fromStatus: null, toStatus: B.PENDING, changedById: userId } },
      },
    });
    await tx.booking.update({
      where: { id: created.id },
      data: { code: formatBookingCode(created.createdAt.getFullYear(), created.seq) },
    });
    if (coupon) {
      await tx.couponUsage.create({
        data: { couponId: coupon.id, customerId, bookingId: created.id, discountAmount: breakdown.discount },
      });
    }
    // Hand over to dispatch (TechnicianAssignmentService arrives in Phase 6).
    await transitionBooking(tx, created, B.SEARCHING, { actorId: userId, note: 'Looking for a professional' });

    await tx.notification.create({
      data: {
        userId,
        type: 'BOOKING_CONFIRMED',
        title: 'Booking confirmed',
        body: `Your ${service.name} booking is confirmed. We're finding the right professional for you.`,
        data: { bookingId: created.id },
      },
    });
    return created.id;
  });

  // Start finding a technician right away (tests drive dispatch explicitly).
  if (env.NODE_ENV !== 'test') {
    void dispatchBooking(bookingId).catch((err) => logger.error({ err, bookingId }, 'initial dispatch failed'));
  }
  const full = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: bookingInclude });
  return toCustomerDetail(full);
}

// ─── Read ────────────────────────────────────────────────────────────────

export async function listCustomerBookings(customerId: string, tab: BookingTab | 'all', page: number, pageSize: number) {
  const where: Prisma.BookingWhereInput = {
    customerId,
    ...(tab !== 'all' && { status: { in: [...BOOKING_TAB_STATUSES[tab]] } }),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: [{ scheduledFor: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items: rows.map(toListItem), total };
}

/** Ownership is part of the query: another customer's booking is simply "not found". */
async function findOwned(customerId: string, id: string) {
  const booking = await prisma.booking.findFirst({ where: { id, customerId }, include: bookingInclude });
  if (!booking) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  return booking;
}

export async function getCustomerBooking(customerId: string, id: string) {
  return toCustomerDetail(await findOwned(customerId, id));
}

export async function customerStats(customerId: string): Promise<CustomerBookingStatsDto> {
  const grouped = await prisma.booking.groupBy({ by: ['status'], where: { customerId }, _count: { _all: true } });
  const count = (statuses: readonly BookingStatus[]) =>
    grouped.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  return {
    upcoming: count(BOOKING_TAB_STATUSES.upcoming),
    active: count(BOOKING_TAB_STATUSES.active),
    completed: count(BOOKING_TAB_STATUSES.completed),
    cancelled: count(BOOKING_TAB_STATUSES.cancelled),
  };
}

// ─── Customer actions ────────────────────────────────────────────────────

export async function cancelCustomerBooking(customerId: string, userId: string, id: string, reason?: string) {
  const booking = await findOwned(customerId, id);
  if (!CUSTOMER_CANCELLABLE.includes(booking.status)) {
    throw AppError.conflict('This booking can no longer be cancelled. Please contact support.', 'NOT_CANCELLABLE');
  }
  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, booking, B.CUSTOMER_CANCELLED, {
      actorId: userId,
      note: reason,
      data: { cancelledAt: new Date(), cancellationReason: reason ?? 'Cancelled by customer' },
    });
    // Give the coupon back.
    const usage = await tx.couponUsage.findUnique({ where: { bookingId: booking.id } });
    if (usage) {
      await tx.couponUsage.delete({ where: { id: usage.id } });
      await tx.coupon.update({ where: { id: usage.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    if (booking.technicianId) {
      await tx.technician.updateMany({
        where: { id: booking.technicianId, activeJobCount: { gt: 0 } },
        data: { activeJobCount: { decrement: 1 } },
      });
    }
    // Withdraw any open job offer and tell the technician.
    await tx.bookingAssignment.updateMany({ where: { bookingId: booking.id, status: 'OFFERED' }, data: { status: 'CANCELLED', respondedAt: new Date() } });
    const techUserId = await technicianUserId(tx, booking.technicianId);
    if (techUserId) {
      await tx.notification.create({
        data: { userId: techUserId, type: 'BOOKING_CANCELLED', title: 'Job cancelled', body: `${booking.code} was cancelled by the customer.`, data: { bookingId: booking.id } },
      });
    }
  });
  const techUserId = await technicianUserId(prisma, booking.technicianId);
  emitBookingEvent(booking.id, [userId, techUserId].filter((x): x is string => !!x), SocketEvent.BOOKING_CANCELLED, {});
  return getCustomerBooking(customerId, id);
}

async function technicianUserId(db: Prisma.TransactionClient, technicianId: string | null) {
  if (!technicianId) return null;
  return (await db.technician.findUnique({ where: { id: technicianId }, select: { userId: true } }))?.userId ?? null;
}

export async function rescheduleCustomerBooking(customerId: string, userId: string, id: string, input: ScheduleInput) {
  const booking = await findOwned(customerId, id);
  if (!CUSTOMER_RESCHEDULABLE.includes(booking.status)) {
    throw AppError.conflict('This booking can no longer be rescheduled.', 'NOT_RESCHEDULABLE');
  }
  const { scheduledFor, timeSlot } = resolveSchedule(input);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data: { scheduledFor, timeSlot, scheduleType: input.scheduleType, version: { increment: 1 } },
    });
    if (count === 0) throw AppError.conflict('This booking was just updated. Please refresh.', 'STALE_BOOKING');
    await tx.bookingStatusHistory.create({
      data: { bookingId: booking.id, fromStatus: booking.status, toStatus: booking.status, changedById: userId, note: 'Rescheduled' },
    });
    const techUserId = await technicianUserId(tx, booking.technicianId);
    if (techUserId) {
      await tx.notification.create({
        data: { userId: techUserId, type: 'BOOKING_RESCHEDULED', title: 'Job rescheduled', body: `${booking.code} moved to ${scheduledFor.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`, data: { bookingId: booking.id } },
      });
    }
  });
  const techUserId = await technicianUserId(prisma, booking.technicianId);
  emitBookingEvent(booking.id, [userId, techUserId].filter((x): x is string => !!x), SocketEvent.BOOKING_UPDATED, { rescheduled: true });
  return getCustomerBooking(customerId, id);
}
