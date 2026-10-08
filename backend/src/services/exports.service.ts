import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { maskAadhaar } from './franchise.service';
import { bookingScope, customerScope, technicianScope, type Scope } from './franchiseScope';

/**
 * Spreadsheet downloads (CSV, opens in Excel / Google Sheets). Head office
 * gets everything; a franchise manager gets only their franchise.
 * Money is in rupees here (not paise) because people read these.
 */

export const EXPORT_KINDS = ['franchises', 'technicians', 'customers', 'addresses', 'bookings'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const MAX_ROWS = 50_000;
const rupees = (paise: number | null | undefined) => ((paise ?? 0) / 100).toFixed(2);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const time = (d: Date | null | undefined) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) : '');

function cell(v: unknown) {
  const s = v == null ? '' : String(v);
  // Formula-injection guard: a leading = + - @ would run as a formula in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const csv = (header: string[], rows: unknown[][]) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

export async function exportCsv(kind: ExportKind, scope: Scope, range: { from?: Date; to?: Date }): Promise<{ filename: string; body: string }> {
  const created = range.from || range.to ? { createdAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } } : {};
  const stamp = new Date().toISOString().slice(0, 10);
  const prefix = scope ? `rapidfix-${scope.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'rapidfix';
  const filename = `${prefix}-${kind}-${stamp}.csv`;

  switch (kind) {
    case 'franchises': {
      if (scope) throw AppError.forbidden();
      const rows = await prisma.franchise.findMany({ include: { locations: { select: { name: true } }, _count: { select: { technicians: true, customers: true, bookings: true } } }, orderBy: { code: 'asc' } });
      return {
        filename,
        body: csv(
          ['Code', 'Franchise', 'Town', 'District', 'State', 'Status', 'Manager', 'Mobile', 'Email', 'Date of birth', 'Address', 'Pincode', 'Aadhaar', 'PAN', 'GSTIN', 'Business name', 'Commission %', 'Agreement start', 'Agreement end', 'Deposit (Rs)', 'Bank holder', 'IFSC', 'Account (last 4)', 'UPI', 'Localities', 'Technicians', 'Customers', 'Bookings', 'Created'],
          rows.map((f) => [
            f.code, f.name, f.town, f.district, f.state, f.status, f.ownerName, f.ownerPhone, f.ownerEmail, day(f.ownerDateOfBirth), f.ownerAddress, f.ownerPincode,
            maskAadhaar(f.aadhaarLast4), f.panNumber, f.gstin, f.businessName, Number(f.commissionPercent), day(f.agreementStart), day(f.agreementEnd), rupees(f.depositAmount),
            f.bankAccountHolder, f.bankIfsc, f.bankAccountLast4, f.upiId, f.locations.map((l) => l.name).join('; '), f._count.technicians, f._count.customers, f._count.bookings, time(f.createdAt),
          ]),
        ),
      };
    }
    case 'technicians': {
      const rows = await prisma.technician.findMany({
        where: { ...technicianScope(scope), user: { role: 'TECHNICIAN' } },
        include: { user: true, franchise: { select: { name: true } }, skills: { include: { category: { select: { name: true } } } }, wallet: true },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });
      return {
        filename,
        body: csv(
          ['Name', 'Mobile', 'Email', 'Franchise', 'Verification', 'Account status', 'Online', 'Skills', 'Experience (yrs)', 'Address', 'Village / Town', 'District', 'State', 'Pincode', 'Service radius (km)', 'Rating', 'Reviews', 'Completed jobs', 'Wallet (Rs)', 'Joined'],
          rows.map((t) => [
            t.user.name, t.user.phone, t.user.email, t.franchise?.name ?? 'RapidFix direct', t.verificationStatus, t.user.status, t.isOnline ? 'Yes' : 'No',
            t.skills.map((s) => s.category.name).join('; '), t.experienceYears, t.addressLine, t.villageTown, t.district, t.state, t.pincode, t.serviceRadiusKm,
            t.ratingAvg.toFixed(1), t.ratingCount, t.completedJobs, rupees(t.wallet?.balance), time(t.createdAt),
          ]),
        ),
      };
    }
    case 'customers': {
      const rows = await prisma.customer.findMany({
        where: { AND: [customerScope(scope)], user: { role: 'CUSTOMER' } },
        include: { user: true, franchise: { select: { name: true } }, _count: { select: { bookings: true, addresses: true } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });
      return {
        filename,
        body: csv(
          ['Name', 'Mobile', 'Email', 'Date of birth', 'Franchise', 'City', 'Status', 'Bookings', 'Saved addresses', 'Referral code', 'Joined', 'Last login'],
          rows.map((c) => [c.user.name, c.user.phone, c.user.email, day(c.user.dateOfBirth), c.franchise?.name ?? 'RapidFix direct', c.city, c.user.status, c._count.bookings, c._count.addresses, c.referralCode, time(c.createdAt), time(c.user.lastLoginAt)]),
        ),
      };
    }
    case 'addresses': {
      const rows = await prisma.address.findMany({
        where: { deletedAt: null, customer: { AND: [customerScope(scope)] } },
        include: { customer: { include: { user: { select: { name: true, phone: true } }, franchise: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });
      return {
        filename,
        body: csv(
          ['Customer', 'Mobile', 'Franchise', 'Label', 'House / Door no.', 'Street', 'Area', 'Village / Town', 'District', 'State', 'Pincode', 'Landmark', 'Latitude', 'Longitude', 'Default', 'Added'],
          rows.map((a) => [
            a.customer.user.name, a.customer.user.phone, a.customer.franchise?.name ?? 'RapidFix direct', a.label, a.houseNo, a.street, a.area, a.villageTown, a.district, a.state, a.pincode, a.landmark,
            a.latitude ?? '', a.longitude ?? '', a.isDefault ? 'Yes' : 'No', time(a.createdAt),
          ]),
        ),
      };
    }
    case 'bookings': {
      const rows = await prisma.booking.findMany({
        where: { ...bookingScope(scope), ...created },
        include: {
          service: { select: { name: true, category: { select: { name: true } } } },
          customer: { include: { user: { select: { name: true, phone: true } } } },
          technician: { include: { user: { select: { name: true, phone: true } } } },
          franchise: { select: { name: true } },
          location: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
      });
      return {
        filename,
        body: csv(
          ['Booking ID', 'Created', 'Status', 'Service', 'Category', 'Customer', 'Customer mobile', 'Technician', 'Technician mobile', 'Franchise', 'Locality', 'Address', 'Scheduled for', 'Total (Rs)', 'RapidFix commission (Rs)', 'Technician earning (Rs)', 'Payment method', 'Payment status', 'Completed'],
          rows.map((b) => {
            const a = b.addressSnapshot as { houseNo?: string; area?: string; villageTown?: string; pincode?: string } | null;
            return [
              b.code, time(b.createdAt), b.status, b.service.name, b.service.category.name, b.customer.user.name, b.customer.user.phone, b.technician?.user.name, b.technician?.user.phone,
              b.franchise?.name ?? 'RapidFix direct', b.location?.name, [a?.houseNo, a?.area, a?.villageTown, a?.pincode].filter(Boolean).join(', '), time(b.scheduledFor),
              rupees(b.totalAmount), rupees(b.commissionAmount), rupees(b.technicianEarning), b.paymentMethod, b.paymentStatus, time(b.completedAt),
            ];
          }),
        ),
      };
    }
  }
}
