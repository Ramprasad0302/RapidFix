/**
 * Development seed. All people, phones and emails are fictitious.
 * Admin credentials come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in backend/.env.
 * Customer/technician phones use the reserved 90000 000xx range; with
 * OTP_PROVIDER=console the OTP is printed in the API log.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { formatBookingCode } from '@fixora/shared-utils';
import { PrismaClient, type BookingStatus } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

const rs = (rupees: number) => rupees * 100;

const CATEGORIES = [
  { slug: 'ac-cooling', name: 'AC & Cooling', iconKey: 'snowflake' },
  { slug: 'electrical', name: 'Electrical', iconKey: 'zap' },
  { slug: 'plumbing', name: 'Plumbing', iconKey: 'droplet' },
  { slug: 'carpentry', name: 'Carpentry', iconKey: 'hammer' },
  { slug: 'painting', name: 'Painting', iconKey: 'paint-roller' },
  { slug: 'cleaning', name: 'Cleaning', iconKey: 'sparkles' },
  { slug: 'appliance-repair', name: 'Appliance Repair', iconKey: 'washing-machine' },
  { slug: 'cctv', name: 'CCTV', iconKey: 'cctv' },
  { slug: 'ro-service', name: 'RO Service', iconKey: 'glass-water' },
  { slug: 'pest-control', name: 'Pest Control', iconKey: 'bug' },
] as const;

type Cat = (typeof CATEGORIES)[number]['slug'];

const SERVICES: {
  cat: Cat;
  slug: string;
  name: string;
  price: number;
  visit: number;
  min: number;
  max: number;
  warranty: number;
  popular?: boolean;
  description: string;
  inc: string[];
  exc: string[];
}[] = [
  { cat: 'ac-cooling', slug: 'ac-repair', name: 'AC Repair', price: 299, visit: 99, min: 60, max: 120, warranty: 30, popular: true,
    description: 'Diagnosis and repair of split and window AC units — cooling issues, noise, water leakage and electrical faults.',
    inc: ['Complete diagnosis', 'Minor electrical fixes', 'Cooling performance check'], exc: ['Spare parts', 'Gas refilling', 'Compressor replacement'] },
  { cat: 'ac-cooling', slug: 'ac-general-service', name: 'AC General Service', price: 499, visit: 0, min: 45, max: 90, warranty: 15, popular: true,
    description: 'Deep cleaning of filters, coils and drain line with a jet pump for better cooling and lower bills.',
    inc: ['Filter & coil jet cleaning', 'Drain line flush', 'Gas pressure check'], exc: ['Gas refilling', 'Spare parts'] },
  { cat: 'ac-cooling', slug: 'ac-installation', name: 'AC Installation', price: 1199, visit: 0, min: 90, max: 180, warranty: 90,
    description: 'Professional installation of split or window AC including bracket fitting and vacuum test.',
    inc: ['Indoor & outdoor unit mounting', 'Up to 3 ft copper piping', 'Vacuum & leak test'], exc: ['Extra copper pipe', 'Stand / bracket', 'Wall core cutting'] },
  { cat: 'electrical', slug: 'electrician-visit', name: 'Electrician Visit', price: 149, visit: 0, min: 30, max: 60, warranty: 15, popular: true,
    description: 'Switches, sockets, wiring faults, MCB trips, fan and light installation.',
    inc: ['Fault diagnosis', 'Up to 30 min of labour'], exc: ['Wires, switches & parts'] },
  { cat: 'electrical', slug: 'fan-installation', name: 'Fan Installation', price: 199, visit: 0, min: 30, max: 45, warranty: 30,
    description: 'Ceiling or wall fan installation and regulator fitting.',
    inc: ['Fan mounting', 'Regulator connection'], exc: ['Fan hook / down-rod', 'New wiring'] },
  { cat: 'plumbing', slug: 'plumber-visit', name: 'Plumber Visit', price: 149, visit: 0, min: 30, max: 60, warranty: 15, popular: true,
    description: 'Leaking taps, blocked drains, pipe repairs and fittings.',
    inc: ['Leak diagnosis', 'Up to 30 min of labour'], exc: ['Pipes, taps & fittings'] },
  { cat: 'plumbing', slug: 'water-tank-cleaning', name: 'Water Tank Cleaning', price: 699, visit: 0, min: 90, max: 150, warranty: 0,
    description: 'Mechanised cleaning and disinfection of overhead or underground tanks up to 1000 L.',
    inc: ['Sludge removal', 'Anti-bacterial treatment'], exc: ['Tanks above 1000 L'] },
  { cat: 'carpentry', slug: 'carpenter-visit', name: 'Carpenter Visit', price: 199, visit: 0, min: 45, max: 90, warranty: 15,
    description: 'Door, window, cupboard and furniture repairs, hinges and locks.',
    inc: ['Inspection', 'Up to 45 min of labour'], exc: ['Wood, hardware & locks'] },
  { cat: 'painting', slug: 'room-painting', name: 'Room Painting', price: 2499, visit: 0, min: 360, max: 720, warranty: 180,
    description: 'Interior painting for one room up to 120 sq ft floor area with two coats.',
    inc: ['Surface preparation', 'Two coats of paint', 'Post-work cleanup'], exc: ['Paint material', 'Wall putty & waterproofing'] },
  { cat: 'cleaning', slug: 'bathroom-cleaning', name: 'Bathroom Deep Cleaning', price: 399, visit: 0, min: 60, max: 90, warranty: 0, popular: true,
    description: 'Hard-stain removal on tiles, fittings, mirrors and floor with safe chemicals.',
    inc: ['Tiles & floor scrubbing', 'Fixture descaling'], exc: ['Wall seepage repair'] },
  { cat: 'cleaning', slug: 'home-deep-cleaning', name: 'Full Home Deep Cleaning', price: 2999, visit: 0, min: 300, max: 480, warranty: 0,
    description: 'Room-by-room deep cleaning for a 2BHK home including kitchen and bathrooms.',
    inc: ['All rooms, kitchen & 2 bathrooms', 'Fan & window cleaning'], exc: ['Sofa / carpet shampooing'] },
  { cat: 'appliance-repair', slug: 'washing-machine-repair', name: 'Washing Machine Repair', price: 249, visit: 99, min: 60, max: 120, warranty: 30, popular: true,
    description: 'Top-load, front-load and semi-automatic washing machine repair.',
    inc: ['Diagnosis', 'Labour for repair'], exc: ['Spare parts', 'Motor / PCB replacement'] },
  { cat: 'appliance-repair', slug: 'refrigerator-repair', name: 'Refrigerator Repair', price: 249, visit: 99, min: 60, max: 120, warranty: 30,
    description: 'Cooling problems, noise, water leakage and thermostat faults for all fridge types.',
    inc: ['Diagnosis', 'Labour for repair'], exc: ['Gas refilling', 'Compressor & spare parts'] },
  { cat: 'appliance-repair', slug: 'tv-repair', name: 'TV Repair', price: 299, visit: 99, min: 60, max: 120, warranty: 30,
    description: 'LED / LCD / Smart TV repair — display, sound, power and board issues.',
    inc: ['Diagnosis', 'Labour for repair'], exc: ['Panel & spare parts'] },
  { cat: 'cctv', slug: 'cctv-installation', name: 'CCTV Installation', price: 999, visit: 0, min: 120, max: 240, warranty: 90,
    description: 'Installation of up to 4 cameras with DVR/NVR setup and mobile viewing.',
    inc: ['Mounting of 4 cameras', 'DVR setup', 'Mobile app configuration'], exc: ['Cameras, DVR & cabling'] },
  { cat: 'ro-service', slug: 'ro-service', name: 'RO Water Purifier Service', price: 349, visit: 0, min: 45, max: 90, warranty: 30, popular: true,
    description: 'Complete RO servicing including filter check, tank cleaning and TDS test.',
    inc: ['Tank cleaning', 'TDS check', 'Leak check'], exc: ['Filter & membrane replacement'] },
  { cat: 'pest-control', slug: 'cockroach-control', name: 'Cockroach & Ant Control', price: 799, visit: 0, min: 60, max: 90, warranty: 60,
    description: 'Odourless gel treatment for kitchen and bathrooms, safe for children and pets.',
    inc: ['Gel treatment', 'Kitchen & 2 bathrooms'], exc: ['Termite treatment'] },
];

const LOCATIONS = [
  { name: 'Tanuku', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.7547, longitude: 81.6818 },
  { name: 'Bhimavaram', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.5449, longitude: 81.5212 },
  { name: 'Tadepalligudem', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.8138, longitude: 81.5212 },
  { name: 'Eluru', district: 'Eluru', state: 'Andhra Pradesh', latitude: 16.7107, longitude: 81.0952 },
  { name: 'Rajahmundry', district: 'East Godavari', state: 'Andhra Pradesh', latitude: 17.0005, longitude: 81.804 },
];

const TECHNICIANS = [
  { phone: '+919000000101', name: 'Ravi Kumar', skills: ['ac-cooling', 'appliance-repair'], exp: 6, town: 0, rating: 4.8, jobs: 212, status: 'VERIFIED', online: true },
  { phone: '+919000000102', name: 'Suresh Babu', skills: ['electrical', 'cctv'], exp: 8, town: 0, rating: 4.7, jobs: 340, status: 'VERIFIED', online: true },
  { phone: '+919000000103', name: 'Prakash Rao', skills: ['plumbing', 'ro-service'], exp: 4, town: 1, rating: 4.6, jobs: 128, status: 'VERIFIED', online: false },
  { phone: '+919000000104', name: 'Mahesh Varma', skills: ['carpentry', 'painting'], exp: 10, town: 2, rating: 4.9, jobs: 402, status: 'VERIFIED', online: true },
  { phone: '+919000000105', name: 'Kiran Teja', skills: ['cleaning', 'pest-control'], exp: 3, town: 0, rating: 4.5, jobs: 76, status: 'VERIFIED', online: true },
  { phone: '+919000000106', name: 'Naveen Chandra', skills: ['ac-cooling'], exp: 2, town: 3, rating: 0, jobs: 0, status: 'PENDING', online: false },
] as const;

const CUSTOMERS = [
  { phone: '+919000000001', name: 'Test Customer One', email: 'customer1@fixora.local' },
  { phone: '+919000000002', name: 'Test Customer Two', email: 'customer2@fixora.local' },
  { phone: '+919000000003', name: 'Test Customer Three', email: null },
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env');

  console.log('Seeding FIXORA…');

  // ── Settings & commission ────────────────────────────────────────────
  const settings: Record<string, unknown> = {
    'pricing.taxPercent': 18,
    'dispatch.requestTimeoutSeconds': 30,
    'dispatch.maxAttempts': 5,
    'dispatch.searchRadiusKm': 15,
    'dispatch.weights': { skill: 1, distance: 0.5, rating: 0.3, workload: 0.2 },
    'booking.customerCancelWindowMinutes': 0,
    'support.phone': '+91 90000 00000',
    'support.email': 'support@fixora.local',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  }

  if (!(await prisma.commission.findFirst({ where: { scope: 'GLOBAL' } }))) {
    await prisma.commission.create({ data: { scope: 'GLOBAL', type: 'PERCENTAGE', value: 15 } });
  }

  // ── Locations ────────────────────────────────────────────────────────
  const locations = [];
  for (const l of LOCATIONS) {
    locations.push(
      await prisma.location.upsert({
        where: { name_district_state: { name: l.name, district: l.district, state: l.state } },
        update: {},
        create: l,
      }),
    );
  }

  // ── Catalogue ────────────────────────────────────────────────────────
  const catBySlug = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.serviceCategory.upsert({
      where: { slug: c.slug },
      update: { name: c.name, iconKey: c.iconKey, sortOrder: i },
      create: { ...c, sortOrder: i },
    });
    catBySlug.set(c.slug, row.id);
  }

  const svcBySlug = new Map<string, { id: string; price: number; visit: number; name: string }>();
  for (const [i, s] of SERVICES.entries()) {
    const data = {
      categoryId: catBySlug.get(s.cat)!,
      name: s.name,
      description: s.description,
      basePrice: rs(s.price),
      visitCharge: rs(s.visit),
      durationMinMinutes: s.min,
      durationMaxMinutes: s.max,
      inclusions: s.inc,
      exclusions: s.exc,
      warrantyDays: s.warranty,
      isPopular: s.popular ?? false,
      sortOrder: i,
    };
    const row = await prisma.service.upsert({ where: { slug: s.slug }, update: data, create: { slug: s.slug, ...data } });
    svcBySlug.set(s.slug, { id: row.id, price: row.basePrice, visit: row.visitCharge, name: row.name });
  }

  // ── Admins ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash },
    create: {
      role: 'SUPER_ADMIN',
      email: adminEmail,
      name: 'FIXORA Super Admin',
      passwordHash,
      adminUser: { create: { department: 'Management' } },
    },
  });
  for (const [role, email, name] of [
    ['OPERATIONS', 'ops@fixora.local', 'Ops Admin'],
    ['SUPPORT', 'support@fixora.local', 'Support Admin'],
    ['FINANCE', 'finance@fixora.local', 'Finance Admin'],
  ] as const) {
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { role, email, name, passwordHash, adminUser: { create: { department: role } } },
    });
  }

  // ── Technicians ──────────────────────────────────────────────────────
  const techIds: string[] = [];
  for (const t of TECHNICIANS) {
    const loc = locations[t.town]!;
    const user = await prisma.user.upsert({
      where: { phone_role: { phone: t.phone, role: 'TECHNICIAN' } },
      update: {},
      create: {
        role: 'TECHNICIAN',
        phone: t.phone,
        name: t.name,
        technician: {
          create: {
            experienceYears: t.exp,
            languages: ['Telugu', 'English'],
            villageTown: loc.name,
            district: loc.district,
            state: loc.state,
            pincode: '534211',
            baseLatitude: loc.latitude,
            baseLongitude: loc.longitude,
            lastLatitude: loc.latitude + 0.004,
            lastLongitude: loc.longitude + 0.004,
            lastLocationAt: new Date(),
            serviceRadiusKm: 15,
            verificationStatus: t.status,
            verifiedAt: t.status === 'VERIFIED' ? new Date() : null,
            isOnline: t.online,
            ratingAvg: t.rating,
            ratingCount: Math.round(t.jobs * 0.7),
            completedJobs: t.jobs,
            skills: { create: t.skills.map((s) => ({ categoryId: catBySlug.get(s)! })) },
            wallet: { create: {} },
          },
        },
      },
      include: { technician: true },
    });
    techIds.push(user.technician!.id);
  }

  // ── Customers & addresses ────────────────────────────────────────────
  const customers = [];
  for (const [i, c] of CUSTOMERS.entries()) {
    const user = await prisma.user.upsert({
      where: { phone_role: { phone: c.phone, role: 'CUSTOMER' } },
      update: {},
      create: {
        role: 'CUSTOMER',
        phone: c.phone,
        name: c.name,
        email: c.email,
        customer: {
          create: {
            referralCode: `FXTEST${i + 1}`,
            addresses: {
              create: {
                label: 'HOME',
                houseNo: `${12 + i}-4-${7 + i}`,
                street: 'Main Road',
                area: 'Sajjapuram',
                villageTown: 'Tanuku',
                district: 'West Godavari',
                state: 'Andhra Pradesh',
                pincode: '534211',
                landmark: 'Near Bus Stand',
                latitude: 16.7547 + i * 0.003,
                longitude: 81.6818 - i * 0.003,
                isDefault: true,
              },
            },
          },
        },
      },
      include: { customer: { include: { addresses: true } } },
    });
    customers.push(user.customer!);
  }

  // ── Coupons ──────────────────────────────────────────────────────────
  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const coupons = [
    { code: 'FIXAC20', title: 'FLAT 20% OFF', description: 'AC General Service', discountType: 'PERCENTAGE', discountValue: 20, maxDiscountAmount: rs(200), minOrderAmount: rs(399), categoryId: catBySlug.get('ac-cooling'), serviceId: svcBySlug.get('ac-general-service')!.id },
    { code: 'WELCOME100', title: '₹100 OFF', description: 'On your first FIXORA booking', discountType: 'FIXED', discountValue: rs(100), maxDiscountAmount: null, minOrderAmount: rs(249), isFirstBookingOnly: true },
    { code: 'SPARK15', title: '15% OFF', description: 'Electrical services', discountType: 'PERCENTAGE', discountValue: 15, maxDiscountAmount: rs(150), minOrderAmount: rs(149), categoryId: catBySlug.get('electrical') },
    { code: 'FLOW50', title: '₹50 OFF', description: 'Plumbing services', discountType: 'FIXED', discountValue: rs(50), maxDiscountAmount: null, minOrderAmount: rs(149), categoryId: catBySlug.get('plumbing') },
    { code: 'SHINE25', title: 'FLAT 25% OFF', description: 'Home deep cleaning', discountType: 'PERCENTAGE', discountValue: 25, maxDiscountAmount: rs(750), minOrderAmount: rs(999), categoryId: catBySlug.get('cleaning') },
  ] as const;
  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        ...c,
        terms: ['Valid once per customer', 'Cannot be combined with other offers', 'Final price may vary based on actual work required'],
        startsAt: now,
        endsAt: in90,
        usageLimit: 1000,
      },
    });
  }

  // ── Sample bookings ──────────────────────────────────────────────────
  if ((await prisma.booking.count()) === 0) {
    const tax = 18;
    const samples: { cust: number; svc: string; tech: number | null; status: BookingStatus; dayOffset: number; slot: string }[] = [
      { cust: 0, svc: 'ac-repair', tech: 0, status: 'TECHNICIAN_EN_ROUTE', dayOffset: 0, slot: '09-11' },
      { cust: 0, svc: 'ro-service', tech: null, status: 'SEARCHING', dayOffset: 1, slot: '11-13' },
      { cust: 0, svc: 'electrician-visit', tech: 1, status: 'PAYMENT_COMPLETED', dayOffset: -6, slot: '14-16' },
      { cust: 0, svc: 'bathroom-cleaning', tech: null, status: 'CUSTOMER_CANCELLED', dayOffset: -3, slot: '16-18' },
      { cust: 1, svc: 'ac-general-service', tech: 0, status: 'PAYMENT_COMPLETED', dayOffset: -2, slot: '09-11' },
      { cust: 1, svc: 'washing-machine-repair', tech: 0, status: 'TECHNICIAN_ACCEPTED', dayOffset: 1, slot: '14-16' },
      { cust: 2, svc: 'carpenter-visit', tech: 3, status: 'SERVICE_STARTED', dayOffset: 0, slot: '11-13' },
    ];
    const commissionPct = 15;
    for (const s of samples) {
      const svc = svcBySlug.get(s.svc)!;
      const cust = customers[s.cust]!;
      const addr = cust.addresses[0]!;
      const subtotal = svc.price + svc.visit;
      const taxAmount = Math.round((subtotal * tax) / 100);
      const done = s.status === 'PAYMENT_COMPLETED';
      const scheduledFor = new Date(now);
      scheduledFor.setDate(now.getDate() + s.dayOffset);
      scheduledFor.setHours(Number(s.slot.slice(0, 2)), 0, 0, 0);

      const booking = await prisma.booking.create({
        data: {
          customerId: cust.id,
          serviceId: svc.id,
          addressId: addr.id,
          technicianId: s.tech != null ? techIds[s.tech]! : null,
          locationId: locations[0]!.id,
          status: s.status,
          description: 'Sample booking created by seed script.',
          photos: [],
          scheduledFor,
          timeSlot: s.slot,
          addressSnapshot: { ...addr, latitude: addr.latitude, longitude: addr.longitude },
          latitude: addr.latitude,
          longitude: addr.longitude,
          serviceCharge: svc.price,
          visitCharge: svc.visit,
          taxAmount,
          totalAmount: subtotal + taxAmount,
          commissionAmount: done ? Math.round((subtotal * commissionPct) / 100) : null,
          technicianEarning: done ? subtotal - Math.round((subtotal * commissionPct) / 100) : null,
          paymentMethod: done ? 'UPI' : 'CASH',
          paymentStatus: done ? 'SUCCESS' : 'PENDING',
          assignedAt: s.tech != null ? scheduledFor : null,
          completedAt: done ? scheduledFor : null,
          cancelledAt: s.status === 'CUSTOMER_CANCELLED' ? scheduledFor : null,
          items: {
            create: [
              { type: 'SERVICE', name: svc.name, unitPrice: svc.price, amount: svc.price },
              ...(svc.visit ? [{ type: 'VISIT' as const, name: 'Visit charge', unitPrice: svc.visit, amount: svc.visit }] : []),
            ],
          },
          statusHistory: { create: [{ fromStatus: null, toStatus: 'PENDING' }, { fromStatus: 'PENDING', toStatus: s.status }] },
        },
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { code: formatBookingCode(now.getFullYear(), booking.seq) },
      });
      if (done) {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            method: 'UPI',
            status: 'SUCCESS',
            amount: subtotal + taxAmount,
            paidAt: scheduledFor,
            invoiceNumber: `INV-${now.getFullYear()}-${String(booking.seq).padStart(6, '0')}`,
          },
        });
        await prisma.review.create({
          data: { bookingId: booking.id, customerId: cust.id, technicianId: techIds[s.tech!]!, rating: 5, comment: 'Quick and professional work.' },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
