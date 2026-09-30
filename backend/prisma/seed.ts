/**
 * Development seed. Every person, phone and email here is fictitious.
 *  • Staff email login: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in backend/.env
 *  • Everyone (customers, technicians, staff) can also sign in with their phone + OTP;
 *    with OTP_PROVIDER=console the code is printed in the API log.
 * Re-running replaces the demo bookings/notifications of the demo accounts only.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { formatBookingCode } from '@fixora/shared-utils';
import { PrismaClient, type BookingStatus, type Role } from '../src/generated/prisma/client';
import { postWalletTxn } from '../src/services/wallet.service';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) });

const rs = (rupees: number) => rupees * 100;
const TAX = Number(process.env.TAX_PERCENT ?? 18);
const COMMISSION_PCT = 15;
const IST = 330 * 60_000;

/** Deterministic PRNG so every seed run produces the same demo data. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260930);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

/** An instant `dayOffset` days from today (IST) at hh:mm IST. */
function at(dayOffset: number, hh: number, mm = 0): Date {
  const ist = new Date(Date.now() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset, hh, mm) - IST);
}
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
const SLOT_HOUR: Record<string, number> = { '09-11': 9, '11-13': 11, '14-16': 14, '16-18': 16, '18-20': 18 };

// ─── Catalogue ───────────────────────────────────────────────────────────

const CATEGORIES = [
  { slug: 'ac-cooling', name: 'AC & Cooling', iconKey: 'ac', tagline: 'Service, Repair, Installation', professionalTitle: 'AC Technician' },
  { slug: 'electrical', name: 'Electrical', iconKey: 'electrical', tagline: 'Wiring, Switches, Fan, Lighting', professionalTitle: 'Electrician' },
  { slug: 'plumbing', name: 'Plumbing', iconKey: 'plumbing', tagline: 'Tap, Pipe, Bathroom, Tank', professionalTitle: 'Plumber' },
  { slug: 'carpentry', name: 'Carpentry', iconKey: 'carpentry', tagline: 'Furniture, Door, Shelf, Repairs', professionalTitle: 'Carpenter' },
  { slug: 'painting', name: 'Painting', iconKey: 'painting', tagline: 'Interior, Exterior, Wall Painting', professionalTitle: 'Painter' },
  { slug: 'appliance-repair', name: 'Appliance Repair', iconKey: 'appliance', tagline: 'Washing Machine, Fridge, TV', professionalTitle: 'Appliance Technician' },
  { slug: 'cleaning', name: 'Cleaning', iconKey: 'cleaning', tagline: 'Home, Office, Deep Cleaning', professionalTitle: 'Cleaning Expert' },
  { slug: 'cctv', name: 'CCTV Installation', iconKey: 'cctv', tagline: 'Cameras, DVR, Mobile View', professionalTitle: 'CCTV Technician' },
  { slug: 'ro-service', name: 'RO Service', iconKey: 'ro', tagline: 'Purifier Service, Filters, Repair', professionalTitle: 'RO Technician' },
  { slug: 'pest-control', name: 'Pest Control', iconKey: 'pest', tagline: 'Cockroach, Termite, Mosquito', professionalTitle: 'Pest Control Expert' },
] as const;
type Cat = (typeof CATEGORIES)[number]['slug'];

interface Svc {
  cat: Cat;
  slug: string;
  name: string;
  tagline: string;
  price: number;
  visit: number;
  min: number;
  max: number;
  warranty: number;
  popular?: boolean;
  description: string;
  inc: string[];
  exc: string[];
}

const SERVICES: Svc[] = [
  { cat: 'ac-cooling', slug: 'ac-general-service', name: 'AC Service', tagline: 'Deep cleaning for better cooling and lower bills', price: 499, visit: 0, min: 45, max: 90, warranty: 15, popular: true,
    description: 'Jet-pump cleaning of filters, coils and drain line for split and window ACs.',
    inc: ['Filter & coil jet cleaning', 'Drain line flush', 'Gas pressure check', 'Cooling performance check'], exc: ['Gas filling (if required)', 'Spare parts'] },
  { cat: 'ac-cooling', slug: 'ac-repair', name: 'AC Repair', tagline: 'Get your AC repaired by verified experts', price: 299, visit: 100, min: 30, max: 60, warranty: 30, popular: true,
    description: 'Diagnosis and repair of split and window AC units — cooling issues, noise, water leakage and electrical faults.',
    inc: ['Diagnosis and fault finding', 'Cooling issue repair', 'Basic cleaning', 'Performance check'], exc: ['Major parts replacement', 'Gas filling (if required)'] },
  { cat: 'ac-cooling', slug: 'ac-installation', name: 'AC Installation', tagline: 'Neat, leak-tested installation', price: 1199, visit: 0, min: 90, max: 180, warranty: 90,
    description: 'Professional installation of split or window AC including bracket fitting and vacuum test.',
    inc: ['Indoor & outdoor unit mounting', 'Up to 3 ft copper piping', 'Vacuum & leak test'], exc: ['Extra copper pipe', 'Stand / bracket', 'Wall core cutting'] },
  { cat: 'electrical', slug: 'fan-installation', name: 'Fan Installation', tagline: 'Ceiling or wall fan fitted safely', price: 299, visit: 0, min: 30, max: 60, warranty: 30, popular: true,
    description: 'Ceiling or wall fan installation with regulator fitting and safety check.',
    inc: ['Fan mounting', 'Regulator connection', 'Safety check'], exc: ['Fan hook / down-rod', 'New wiring'] },
  { cat: 'electrical', slug: 'electrical-repair', name: 'Electrical Repair', tagline: 'Switches, sockets, wiring and MCB faults', price: 349, visit: 0, min: 30, max: 90, warranty: 30,
    description: 'Switches, sockets, wiring faults, MCB trips, light and fan points.',
    inc: ['Fault diagnosis', 'Up to 60 min of labour'], exc: ['Wires, switches & parts'] },
  { cat: 'plumbing', slug: 'tap-repair', name: 'Tap Repair', tagline: 'Stop leaks and drips fast', price: 199, visit: 0, min: 30, max: 45, warranty: 30, popular: true,
    description: 'Leaking or broken taps, mixers and valves repaired or replaced.',
    inc: ['Leak diagnosis', 'Washer / cartridge fix', 'Tap replacement labour'], exc: ['New tap or parts'] },
  { cat: 'plumbing', slug: 'plumber-visit', name: 'Plumber Visit', tagline: 'Pipes, drains, bathroom fittings', price: 149, visit: 0, min: 30, max: 60, warranty: 15,
    description: 'Blocked drains, pipe leaks, bathroom and kitchen fittings.',
    inc: ['Diagnosis', 'Up to 30 min of labour'], exc: ['Pipes, taps & fittings'] },
  { cat: 'plumbing', slug: 'water-tank-cleaning', name: 'Water Tank Cleaning', tagline: 'Clean, disinfected water storage', price: 699, visit: 0, min: 90, max: 150, warranty: 0,
    description: 'Mechanised cleaning and disinfection of overhead or underground tanks up to 1000 L.',
    inc: ['Sludge removal', 'Anti-bacterial treatment'], exc: ['Tanks above 1000 L'] },
  { cat: 'carpentry', slug: 'furniture-repair', name: 'Furniture Repair', tagline: 'Beds, chairs, tables and cupboards', price: 349, visit: 0, min: 45, max: 120, warranty: 30, popular: true,
    description: 'Loose joints, broken hinges, drawer channels and furniture fixes.',
    inc: ['Inspection', 'Repair labour up to 60 min'], exc: ['Wood, hardware & locks'] },
  { cat: 'carpentry', slug: 'door-repair', name: 'Door & Lock Repair', tagline: 'Doors that close and lock properly', price: 249, visit: 0, min: 30, max: 60, warranty: 30,
    description: 'Door alignment, hinges, handles, locks and latches.',
    inc: ['Alignment & hinge fix', 'Lock fitting labour'], exc: ['New locks & hardware'] },
  { cat: 'painting', slug: 'room-painting', name: 'Room Painting', tagline: 'Fresh walls in a day', price: 2499, visit: 0, min: 360, max: 720, warranty: 180,
    description: 'Interior painting for one room up to 120 sq ft floor area with two coats.',
    inc: ['Surface preparation', 'Two coats of paint', 'Post-work cleanup'], exc: ['Paint material', 'Wall putty & waterproofing'] },
  { cat: 'appliance-repair', slug: 'washing-machine-repair', name: 'Washing Machine Service', tagline: 'Top-load, front-load, semi-automatic', price: 349, visit: 99, min: 60, max: 120, warranty: 30, popular: true,
    description: 'Servicing and repair for all washing machine types.',
    inc: ['Diagnosis', 'Drum & filter cleaning', 'Repair labour'], exc: ['Spare parts', 'Motor / PCB replacement'] },
  { cat: 'appliance-repair', slug: 'refrigerator-repair', name: 'Refrigerator Repair', tagline: 'Cooling, noise and leakage fixed', price: 249, visit: 99, min: 60, max: 120, warranty: 30,
    description: 'Cooling problems, noise, water leakage and thermostat faults for all fridge types.',
    inc: ['Diagnosis', 'Repair labour'], exc: ['Gas filling', 'Compressor & spare parts'] },
  { cat: 'appliance-repair', slug: 'tv-repair', name: 'TV Repair', tagline: 'LED, LCD and Smart TVs', price: 299, visit: 99, min: 60, max: 120, warranty: 30,
    description: 'Display, sound, power and board issues on LED / LCD / Smart TVs.',
    inc: ['Diagnosis', 'Repair labour'], exc: ['Panel & spare parts'] },
  { cat: 'cleaning', slug: 'home-deep-cleaning', name: 'Home Deep Cleaning', tagline: 'Every room, top to bottom', price: 2999, visit: 0, min: 300, max: 480, warranty: 0,
    description: 'Room-by-room deep cleaning for a 2BHK home including kitchen and bathrooms.',
    inc: ['All rooms, kitchen & 2 bathrooms', 'Fan & window cleaning'], exc: ['Sofa / carpet shampooing'] },
  { cat: 'cleaning', slug: 'bathroom-cleaning', name: 'Bathroom Deep Cleaning', tagline: 'Hard stains gone', price: 399, visit: 0, min: 60, max: 90, warranty: 0,
    description: 'Hard-stain removal on tiles, fittings, mirrors and floor with safe chemicals.',
    inc: ['Tiles & floor scrubbing', 'Fixture descaling'], exc: ['Wall seepage repair'] },
  { cat: 'cctv', slug: 'cctv-installation', name: 'CCTV Installation', tagline: 'Up to 4 cameras with mobile view', price: 999, visit: 0, min: 120, max: 240, warranty: 90,
    description: 'Installation of up to 4 cameras with DVR/NVR setup and mobile viewing.',
    inc: ['Mounting of 4 cameras', 'DVR setup', 'Mobile app configuration'], exc: ['Cameras, DVR & cabling'] },
  { cat: 'ro-service', slug: 'ro-service', name: 'RO Purifier Service', tagline: 'Safe drinking water, checked', price: 349, visit: 0, min: 45, max: 90, warranty: 30,
    description: 'Complete RO servicing including filter check, tank cleaning and TDS test.',
    inc: ['Tank cleaning', 'TDS check', 'Leak check'], exc: ['Filter & membrane replacement'] },
  { cat: 'pest-control', slug: 'cockroach-control', name: 'Cockroach & Ant Control', tagline: 'Odourless, child-safe gel treatment', price: 799, visit: 0, min: 60, max: 90, warranty: 60,
    description: 'Odourless gel treatment for kitchen and bathrooms, safe for children and pets.',
    inc: ['Gel treatment', 'Kitchen & 2 bathrooms'], exc: ['Termite treatment'] },
];

const LOCATIONS = [
  { name: 'Tanuku', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.7547, longitude: 81.6818 },
  { name: 'Kandukur', district: 'Nellore', state: 'Andhra Pradesh', latitude: 15.2165, longitude: 79.9042 },
  { name: 'Bhimavaram', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.5449, longitude: 81.5212 },
  { name: 'Tadepalligudem', district: 'West Godavari', state: 'Andhra Pradesh', latitude: 16.8138, longitude: 81.5212 },
  { name: 'Eluru', district: 'Eluru', state: 'Andhra Pradesh', latitude: 16.7107, longitude: 81.0952 },
  { name: 'Rajahmundry', district: 'East Godavari', state: 'Andhra Pradesh', latitude: 17.0005, longitude: 81.804 },
];
const TANUKU = LOCATIONS[0]!;
const KANDUKUR = LOCATIONS[1]!;

// ─── People (fictitious) ─────────────────────────────────────────────────

/** Owner's real numbers (Firebase test numbers) for the main demo accounts. */
const OWNER_PHONES = { superAdmin: '+919491963366', technician: '+919505582333', customer: '+919363939199' } as const;

const TECHNICIANS = [
  { phone: OWNER_PHONES.technician, name: 'Ravi Kumar', skills: ['ac-cooling', 'electrical', 'appliance-repair'], exp: 6, town: TANUKU, dLat: 0.018, dLng: 0.012, rating: 4.8, count: 120, status: 'VERIFIED', online: true },
  { phone: '+919000000102', name: 'Suresh Reddy', skills: ['electrical', 'cctv'], exp: 8, town: TANUKU, dLat: -0.02, dLng: 0.015, rating: 4.7, count: 95, status: 'VERIFIED', online: true },
  { phone: '+919000000103', name: 'Prakash Rao', skills: ['plumbing', 'ro-service'], exp: 4, town: TANUKU, dLat: 0.01, dLng: -0.02, rating: 4.6, count: 64, status: 'VERIFIED', online: true },
  { phone: '+919000000104', name: 'Imran Khan', skills: ['plumbing'], exp: 5, town: KANDUKUR, dLat: 0.012, dLng: 0.016, rating: 4.7, count: 58, status: 'VERIFIED', online: true },
  { phone: '+919000000105', name: 'Mahesh Babu', skills: ['appliance-repair', 'ac-cooling'], exp: 7, town: KANDUKUR, dLat: -0.018, dLng: 0.02, rating: 4.5, count: 41, status: 'VERIFIED', online: false },
  { phone: '+919000000106', name: 'Ramesh', skills: ['carpentry', 'painting'], exp: 10, town: TANUKU, dLat: 0.025, dLng: 0.02, rating: 4.9, count: 132, status: 'VERIFIED', online: true },
  { phone: '+919000000107', name: 'Lakshmi', skills: ['cleaning', 'pest-control'], exp: 3, town: TANUKU, dLat: -0.015, dLng: -0.018, rating: 4.8, count: 77, status: 'VERIFIED', online: true },
  { phone: '+919000000108', name: 'Naveen Chandra', skills: ['ac-cooling'], exp: 2, town: LOCATIONS[4]!, dLat: 0, dLng: 0, rating: 0, count: 0, status: 'PENDING', online: false },
] as const;

const CUSTOMER_NAMES = [
  'Ram Kumar', 'Rajesh Kumar', 'Priya Sharma', 'Suresh Varma', 'Meena Patel', 'Vikram Singh', 'Anjali Sharma',
  'Kiran Rao', 'Lavanya Devi', 'Arjun Naidu', 'Sravani K', 'Harish Babu', 'Divya Reddy', 'Mohan Das', 'Swathi M',
  'Gopal Krishna', 'Padma Latha', 'Venkat Rao', 'Keerthi S', 'Naresh P',
];
const customerPhone = (i: number) => (i === 0 ? OWNER_PHONES.customer : `+9190000000${String(i + 1).padStart(2, '0')}`);

const STAFF: { phone: string; email: string; name: string; role: Role }[] = [
  { phone: OWNER_PHONES.superAdmin, email: process.env.SEED_ADMIN_EMAIL ?? 'admin@rapidfix.local', name: 'RapidFix Admin', role: 'SUPER_ADMIN' },
  { phone: '+919000000901', email: 'ops@rapidfix.local', name: 'Ops Admin', role: 'OPERATIONS' },
  { phone: '+919000000902', email: 'support@rapidfix.local', name: 'Support Admin', role: 'SUPPORT' },
  { phone: '+919000000903', email: 'finance@rapidfix.local', name: 'Finance Admin', role: 'FINANCE' },
];

const REVIEW_COMMENTS = [
  'Very professional service. Technician was on time and fixed the issue quickly.',
  'Polite and skilled. Explained the problem clearly before starting.',
  'Good work and fair pricing. Will book again.',
  'Quick service, cleaned up after the work.',
  'Reached on time and finished neatly.',
];

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in backend/.env');
  console.log('Seeding RapidFix…');

  // ── Settings & commission ────────────────────────────────────────────
  const settings: Record<string, unknown> = {
    'pricing.taxPercent': TAX,
    'dispatch.requestTimeoutSeconds': 30,
    'dispatch.maxAttempts': 5,
    'dispatch.searchRadiusKm': 15,
    'dispatch.weights': { skill: 1, distance: 0.5, rating: 0.3, workload: 0.2 },
    'support.phone': '+91 94919 63366',
    'support.email': 'support@rapidfix.local',
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: value as object } });
  }
  if (!(await prisma.commission.findFirst({ where: { scope: 'GLOBAL' } }))) {
    await prisma.commission.create({ data: { scope: 'GLOBAL', type: 'PERCENTAGE', value: COMMISSION_PCT } });
  }

  for (const l of LOCATIONS) {
    await prisma.location.upsert({
      where: { name_district_state: { name: l.name, district: l.district, state: l.state } },
      update: { latitude: l.latitude, longitude: l.longitude },
      create: l,
    });
  }

  const catId = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.serviceCategory.upsert({ where: { slug: c.slug }, update: { ...c, sortOrder: i }, create: { ...c, sortOrder: i } });
    catId.set(c.slug, row.id);
  }
  // Retire services from earlier seeds that are no longer in the catalogue.
  await prisma.service.updateMany({ where: { slug: { notIn: SERVICES.map((s) => s.slug) } }, data: { isActive: false, isPopular: false } });

  const svc = new Map<string, { id: string; price: number; visit: number; name: string; cat: Cat }>();
  for (const [i, s] of SERVICES.entries()) {
    const data = {
      categoryId: catId.get(s.cat)!,
      name: s.name,
      tagline: s.tagline,
      description: s.description,
      basePrice: rs(s.price),
      visitCharge: rs(s.visit),
      durationMinMinutes: s.min,
      durationMaxMinutes: s.max,
      inclusions: s.inc,
      exclusions: s.exc,
      warrantyDays: s.warranty,
      isPopular: s.popular ?? false,
      isActive: true,
      sortOrder: i,
    };
    const row = await prisma.service.upsert({ where: { slug: s.slug }, update: data, create: { slug: s.slug, ...data } });
    svc.set(s.slug, { id: row.id, price: row.basePrice, visit: row.visitCharge, name: row.name, cat: s.cat });
  }

  // ── Staff (phone OTP or email + password) ────────────────────────────
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  for (const s of STAFF) {
    const existing = await prisma.user.findFirst({ where: { OR: [{ email: s.email }, { phone: s.phone }] } });
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { phone: s.phone, email: s.email, name: s.name, role: s.role, passwordHash } });
      await prisma.adminUser.upsert({ where: { userId: existing.id }, update: {}, create: { userId: existing.id, department: s.role } });
    } else {
      await prisma.user.create({ data: { ...s, passwordHash, adminUser: { create: { department: s.role } } } });
    }
  }

  // ── Technicians ──────────────────────────────────────────────────────
  const techIds: string[] = [];
  const techSkillOf = new Map<string, readonly string[]>();
  for (const [i, t] of TECHNICIANS.entries()) {
    const profile = {
      experienceYears: t.exp,
      languages: ['Telugu', 'English'],
      villageTown: t.town.name,
      district: t.town.district,
      state: t.town.state,
      pincode: t.town.name === 'Kandukur' ? '523105' : '534211',
      baseLatitude: t.town.latitude,
      baseLongitude: t.town.longitude,
      lastLatitude: t.town.latitude + t.dLat,
      lastLongitude: t.town.longitude + t.dLng,
      lastLocationAt: new Date(),
      serviceRadiusKm: 15,
      verificationStatus: t.status,
      verifiedAt: t.status === 'VERIFIED' ? at(-90, 10) : null,
      isOnline: t.online,
      ratingAvg: t.rating,
      ratingCount: t.count,
      completedJobs: t.count + 20,
      activeJobCount: 0,
    };
    const user = await prisma.user.upsert({
      where: { phone: t.phone },
      update: { name: t.name, role: 'TECHNICIAN', status: 'ACTIVE' },
      create: { role: 'TECHNICIAN', phone: t.phone, name: t.name, createdAt: at(-80 + i * 9, 10) },
    });
    const tech = await prisma.technician.upsert({
      where: { userId: user.id },
      update: profile,
      create: { userId: user.id, ...profile, wallet: { create: {} } },
    });
    await prisma.technicianSkill.deleteMany({ where: { technicianId: tech.id } });
    await prisma.technicianSkill.createMany({ data: t.skills.map((s) => ({ technicianId: tech.id, categoryId: catId.get(s)! })) });
    techIds.push(tech.id);
    techSkillOf.set(tech.id, t.skills);
  }

  // ── Customers ────────────────────────────────────────────────────────
  const customers: { id: string; userId: string; addressId: string; snapshot: object; lat: number; lng: number }[] = [];
  for (const [i, name] of CUSTOMER_NAMES.entries()) {
    const phone = customerPhone(i);
    const town = i % 5 === 4 ? KANDUKUR : TANUKU;
    const user = await prisma.user.upsert({
      where: { phone },
      update: { name, role: 'CUSTOMER', status: 'ACTIVE', ...(i === 0 && { email: 'ramkumar@rapidfix.local' }) },
      create: {
        role: 'CUSTOMER',
        phone,
        name,
        email: i === 0 ? 'ramkumar@rapidfix.local' : null,
        // Spread sign-ups over ~2 months so growth KPIs have history.
        createdAt: i < 3 ? at(-75, 10) : at(-Math.floor(rand() * 58), 9 + (i % 8)),
      },
    });
    const customer = await prisma.customer.upsert({
      where: { userId: user.id },
      update: { city: `${town.name}, Andhra Pradesh` },
      create: { userId: user.id, referralCode: `FXDEMO${String(i + 1).padStart(2, '0')}`, city: `${town.name}, Andhra Pradesh` },
    });
    const lat = town.latitude + (rand() - 0.5) * 0.02;
    const lng = town.longitude + (rand() - 0.5) * 0.02;
    const addr = {
      label: 'HOME' as const,
      houseNo: i === 0 ? '12A' : `${1 + (i % 30)}-${2 + (i % 9)}-${10 + i}`,
      street: 'Main Street',
      area: town.name === 'Tanuku' ? 'Sajjapuram' : 'Old Town',
      villageTown: town.name,
      district: town.district,
      state: town.state,
      pincode: town.name === 'Kandukur' ? '523105' : '534211',
      landmark: 'Near Bus Stand',
      latitude: lat,
      longitude: lng,
      isDefault: true,
    };
    let address = await prisma.address.findFirst({ where: { customerId: customer.id, isDefault: true, deletedAt: null } });
    address = address
      ? await prisma.address.update({ where: { id: address.id }, data: addr })
      : await prisma.address.create({ data: { ...addr, customerId: customer.id } });
    const { isDefault: _d, ...snapshot } = addr;
    customers.push({ id: customer.id, userId: user.id, addressId: address.id, snapshot, lat, lng });
  }

  // ── Coupons (the Offers screen) ──────────────────────────────────────
  const until = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 18, 29));
  const COUPONS = [
    { code: 'FIXAC20', title: 'AC Service Offer', description: 'Get 20% off on AC general service.', discountType: 'PERCENTAGE' as const, discountValue: 20, maxDiscountAmount: rs(200), minOrderAmount: rs(399), categoryId: catId.get('ac-cooling')!, serviceId: svc.get('ac-general-service')!.id, endsAt: until(10, 31),
      highlights: ['20% discount on AC general service', 'Verified & experienced technicians', 'Original service and cleaning process', 'Available across Kandukur, Tanuku and nearby areas'] },
    { code: 'FIXELEC100', title: 'Electrical Services', description: 'Get ₹100 off on electrical repair & installation services.', discountType: 'FIXED' as const, discountValue: rs(100), maxDiscountAmount: null, minOrderAmount: rs(249), categoryId: catId.get('electrical')!, serviceId: null, endsAt: until(10, 15),
      highlights: ['Flat ₹100 off on any electrical service', 'Certified electricians', 'Safety check included'] },
    { code: 'FIXPLUMB15', title: 'Plumbing Services', description: 'Save 15% on all plumbing services.', discountType: 'PERCENTAGE' as const, discountValue: 15, maxDiscountAmount: rs(150), minOrderAmount: rs(149), categoryId: catId.get('plumbing')!, serviceId: null, endsAt: until(10, 31),
      highlights: ['15% off on taps, pipes and tanks', 'Leak-tested work', 'Transparent pricing'] },
    { code: 'FIXCLEAN150', title: 'Home Cleaning', description: 'Get ₹150 off on deep cleaning services.', discountType: 'FIXED' as const, discountValue: rs(150), maxDiscountAmount: null, minOrderAmount: rs(399), categoryId: catId.get('cleaning')!, serviceId: null, endsAt: until(10, 20),
      highlights: ['Flat ₹150 off on deep cleaning', 'Safe, eco-friendly chemicals', 'Trained cleaning experts'] },
    { code: 'WELCOME100', title: 'Welcome to RapidFix', description: '₹100 off on your first booking.', discountType: 'FIXED' as const, discountValue: rs(100), maxDiscountAmount: null, minOrderAmount: rs(249), categoryId: null, serviceId: null, endsAt: until(12, 31), isFirstBookingOnly: true,
      highlights: ['Valid on any service', 'For your first RapidFix booking'] },
  ];
  await prisma.coupon.updateMany({ where: { code: { notIn: COUPONS.map((c) => c.code) } }, data: { isActive: false } });
  const terms = ['Valid once per customer', 'Cannot be combined with other offers', 'Final price may vary based on actual work required'];
  for (const c of COUPONS) {
    const data = { ...c, terms, startsAt: at(-30, 0), usageLimit: 1000, isActive: true, usedCount: 0 };
    await prisma.coupon.upsert({ where: { code: c.code }, update: data, create: data });
  }

  // ── Reset demo activity ──────────────────────────────────────────────
  const demoCustomerIds = customers.map((c) => c.id);
  const demoBookings = await prisma.booking.findMany({
    where: { OR: [{ customerId: { in: demoCustomerIds } }, { technicianId: { in: techIds } }] },
    select: { id: true },
  });
  const ids = demoBookings.map((b) => b.id);
  await prisma.payment.deleteMany({ where: { bookingId: { in: ids } } });
  // Wallet ledgers are rebuilt from the paid demo bookings below.
  await prisma.walletTransaction.deleteMany({ where: { wallet: { technicianId: { in: techIds } } } });
  await prisma.payout.deleteMany({ where: { technicianId: { in: techIds } } });
  await prisma.technicianWallet.updateMany({ where: { technicianId: { in: techIds } }, data: { balance: 0, totalEarned: 0, totalPaidOut: 0 } });
  await prisma.booking.deleteMany({ where: { id: { in: ids } } });
  const techUserIds = (await prisma.technician.findMany({ where: { id: { in: techIds } }, select: { userId: true } })).map((t) => t.userId);
  await prisma.notification.deleteMany({ where: { userId: { in: [...customers.map((c) => c.userId), ...techUserIds] } } });
  await prisma.technician.updateMany({ where: { id: { in: techIds } }, data: { activeJobCount: 0 } });

  // ── Bookings ─────────────────────────────────────────────────────────
  const year = new Date(Date.now() + IST).getUTCFullYear();
  interface Spec {
    cust: number;
    svc: string;
    tech: number | null;
    status: BookingStatus;
    scheduledFor: Date;
    slot: string;
    createdAt: Date;
    description?: string;
    /** status → when it was reached (for the timeline). */
    steps?: [BookingStatus, Date][];
    completedAt?: Date;
    rating?: number;
    method?: 'CASH' | 'UPI' | 'RAZORPAY';
  }

  async function createBooking(s: Spec) {
    const service = svc.get(s.svc)!;
    const c = customers[s.cust]!;
    const subtotal = service.price + service.visit;
    const tax = Math.round((subtotal * TAX) / 100);
    const paid = s.status === 'PAYMENT_COMPLETED';
    const commission = Math.round((subtotal * COMMISSION_PCT) / 100);
    const techId = s.tech != null ? techIds[s.tech]! : null;
    const cancelled = ['CUSTOMER_CANCELLED', 'TECHNICIAN_CANCELLED', 'ADMIN_CANCELLED'].includes(s.status);
    const steps = s.steps ?? [];
    const reached = (st: BookingStatus) => steps.find(([x]) => x === st)?.[1] ?? null;

    const booking = await prisma.booking.create({
      data: {
        customerId: c.id,
        serviceId: service.id,
        addressId: c.addressId,
        technicianId: techId,
        status: s.status,
        description: s.description ?? 'Please check and fix the issue.',
        photos: [],
        scheduleType: s.slot === 'NOW' ? 'NOW' : 'SCHEDULED',
        scheduledFor: s.scheduledFor,
        timeSlot: s.slot,
        addressSnapshot: c.snapshot,
        latitude: c.lat,
        longitude: c.lng,
        serviceCharge: service.price,
        visitCharge: service.visit,
        taxAmount: tax,
        totalAmount: subtotal + tax,
        commissionAmount: paid ? commission : null,
        technicianEarning: paid ? subtotal - commission : null,
        paymentMethod: s.method ?? 'CASH',
        paymentStatus: paid ? 'SUCCESS' : 'PENDING',
        assignedAt: reached('TECHNICIAN_ASSIGNED'),
        acceptedAt: reached('TECHNICIAN_ACCEPTED'),
        startedAt: reached('SERVICE_STARTED'),
        completedAt: s.completedAt ?? reached('SERVICE_COMPLETED'),
        cancelledAt: cancelled ? (steps.at(-1)?.[1] ?? s.createdAt) : null,
        cancellationReason: cancelled ? 'Change of plans' : null,
        createdAt: s.createdAt,
        items: {
          create: [
            { type: 'SERVICE', name: service.name, unitPrice: service.price, amount: service.price },
            ...(service.visit ? [{ type: 'VISIT' as const, name: 'Visit charge', unitPrice: service.visit, amount: service.visit }] : []),
          ],
        },
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'PENDING', createdAt: s.createdAt },
            { fromStatus: 'PENDING', toStatus: 'SEARCHING', createdAt: new Date(s.createdAt.getTime() + 1000) },
            ...steps.map(([to, when], i) => ({ fromStatus: (i ? steps[i - 1]![0] : 'SEARCHING') as BookingStatus, toStatus: to, createdAt: when })),
          ],
        },
      },
    });
    await prisma.booking.update({ where: { id: booking.id }, data: { code: formatBookingCode(year, booking.seq) } });
    if (paid) {
      const method = s.method ?? 'UPI';
      const code = formatBookingCode(year, booking.seq);
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          method,
          status: 'SUCCESS',
          amount: subtotal + tax,
          paidAt: s.completedAt,
          invoiceNumber: `INV-${year}-${String(booking.seq).padStart(6, '0')}`,
          transactions: {
            create: {
              type: 'CHARGE',
              status: 'SUCCESS',
              amount: subtotal + tax,
              provider: method.toLowerCase(),
              providerRef: method === 'RAZORPAY' ? `pay_demo${String(booking.seq).padStart(8, '0')}` : null,
              idempotencyKey: `seed:charge:${booking.id}`,
              createdAt: s.completedAt,
            },
          },
        },
      });
      // Same wallet rules as live payments: online → credit the share; cash/UPI → debit commission + GST.
      if (techId) {
        const earning = subtotal - commission;
        await postWalletTxn(prisma, techId, method === 'RAZORPAY'
          ? { type: 'EARNING_CREDIT', amount: earning, earned: earning, bookingId: booking.id, description: `Earning for ${code}`, idempotencyKey: `earn:${booking.id}` }
          : { type: 'COMMISSION_DEBIT', amount: -(commission + tax), earned: earning, bookingId: booking.id, description: `${method === 'CASH' ? 'Cash' : 'UPI'} job ${code}: commission + GST`, idempotencyKey: `commission:${booking.id}` });
      }
      if (s.rating && techId) {
        await prisma.review.create({
          data: {
            bookingId: booking.id,
            customerId: c.id,
            technicianId: techId,
            rating: s.rating,
            comment: pick(REVIEW_COMMENTS),
            createdAt: new Date(s.completedAt!.getTime() + 3_600_000),
          },
        });
      }
    }
    if (techId && ['TECHNICIAN_ACCEPTED', 'TECHNICIAN_EN_ROUTE', 'TECHNICIAN_ARRIVED', 'SERVICE_STARTED'].includes(s.status)) {
      await prisma.technician.update({ where: { id: techId }, data: { activeJobCount: { increment: 1 } } });
    }
    return booking;
  }

  /** Full happy path ending in payment, with realistic step times. */
  const paidSteps = (start: Date): [BookingStatus, Date][] => {
    const t = (m: number) => new Date(start.getTime() + m * 60_000);
    return [
      ['TECHNICIAN_ASSIGNED', t(-110)],
      ['TECHNICIAN_ACCEPTED', t(-105)],
      ['TECHNICIAN_EN_ROUTE', t(-25)],
      ['TECHNICIAN_ARRIVED', t(0)],
      ['SERVICE_STARTED', t(5)],
      ['SERVICE_COMPLETED', t(70)],
      ['PAYMENT_PENDING', t(71)],
      ['PAYMENT_COMPLETED', t(80)],
    ];
  };
  const slotAt = (day: number, slot: string) => at(day, SLOT_HOUR[slot]!);

  // Ram Kumar (customer 0) — matches the My Bookings reference screen.
  const acRepair = await createBooking({
    cust: 0, svc: 'ac-repair', tech: 0, status: 'TECHNICIAN_EN_ROUTE', slot: '09-11', scheduledFor: minutesAgo(40), createdAt: minutesAgo(55),
    description: 'AC is running but not cooling properly. Please check and fix the issue.',
    steps: [['TECHNICIAN_ASSIGNED', minutesAgo(48)], ['TECHNICIAN_ACCEPTED', minutesAgo(46)], ['TECHNICIAN_EN_ROUTE', minutesAgo(35)]],
  });
  await createBooking({ cust: 0, svc: 'fan-installation', tech: 0, status: 'PAYMENT_COMPLETED', slot: '16-18', scheduledFor: slotAt(-2, '16-18'), createdAt: at(-3, 19), steps: paidSteps(slotAt(-2, '16-18')), completedAt: at(-2, 17, 30), rating: 5, method: 'UPI' });
  await createBooking({ cust: 0, svc: 'tap-repair', tech: 2, status: 'TECHNICIAN_ACCEPTED', slot: '14-16', scheduledFor: slotAt(1, '14-16'), createdAt: at(-1, 20), steps: [['TECHNICIAN_ASSIGNED', at(-1, 20, 5)], ['TECHNICIAN_ACCEPTED', at(-1, 20, 9)]] });
  await createBooking({ cust: 0, svc: 'washing-machine-repair', tech: null, status: 'CUSTOMER_CANCELLED', slot: '11-13', scheduledFor: slotAt(-5, '11-13'), createdAt: at(-6, 18), steps: [['CUSTOMER_CANCELLED', at(-6, 21)]] });
  await createBooking({ cust: 0, svc: 'electrical-repair', tech: 1, status: 'PAYMENT_COMPLETED', slot: '09-11', scheduledFor: slotAt(-8, '09-11'), createdAt: at(-9, 12), steps: paidSteps(slotAt(-8, '09-11')), completedAt: at(-8, 10, 45), rating: 5, method: 'CASH' });
  await createBooking({ cust: 0, svc: 'ac-general-service', tech: null, status: 'SEARCHING', slot: '11-13', scheduledFor: slotAt(3, '11-13'), createdAt: minutesAgo(12) });

  // Ravi Kumar (technician 0) — today's schedule on the technician reference screen.
  await createBooking({ cust: 1, svc: 'ac-general-service', tech: 0, status: 'PAYMENT_COMPLETED', slot: '09-11', scheduledFor: at(0, 7), createdAt: at(-1, 18), steps: paidSteps(at(0, 7)).map(([s, d]) => [s, new Date(Math.min(d.getTime(), Date.now() - 3_600_000))] as [BookingStatus, Date]), completedAt: new Date(Math.min(at(0, 8, 20).getTime(), Date.now() - 3_600_000)), rating: 5, method: 'UPI' });
  await createBooking({ cust: 2, svc: 'fan-installation', tech: 0, status: 'TECHNICIAN_ACCEPTED', slot: '14-16', scheduledFor: slotAt(0, '14-16'), createdAt: at(-1, 11), steps: [['TECHNICIAN_ASSIGNED', at(-1, 11, 10)], ['TECHNICIAN_ACCEPTED', at(-1, 11, 12)]] });
  await createBooking({ cust: 3, svc: 'ac-general-service', tech: 0, status: 'TECHNICIAN_ACCEPTED', slot: '16-18', scheduledFor: slotAt(0, '16-18'), createdAt: at(-1, 15), steps: [['TECHNICIAN_ASSIGNED', at(-1, 15, 5)], ['TECHNICIAN_ACCEPTED', at(-1, 15, 20)]] });
  await createBooking({ cust: 4, svc: 'ac-repair', tech: 0, status: 'TECHNICIAN_ASSIGNED', slot: '09-11', scheduledFor: slotAt(1, '09-11'), createdAt: minutesAgo(30), description: 'Water dripping from the indoor unit.', steps: [['TECHNICIAN_ASSIGNED', minutesAgo(5)]] });
  await createBooking({ cust: 5, svc: 'washing-machine-repair', tech: 0, status: 'TECHNICIAN_ACCEPTED', slot: '11-13', scheduledFor: slotAt(1, '11-13'), createdAt: at(-1, 22), steps: [['TECHNICIAN_ASSIGNED', at(-1, 22, 30)], ['TECHNICIAN_ACCEPTED', at(-1, 22, 40)]] });
  await createBooking({ cust: 7, svc: 'furniture-repair', tech: 5, status: 'SERVICE_STARTED', slot: '09-11', scheduledFor: minutesAgo(90), createdAt: minutesAgo(200), steps: [['TECHNICIAN_ASSIGNED', minutesAgo(190)], ['TECHNICIAN_ACCEPTED', minutesAgo(185)], ['TECHNICIAN_EN_ROUTE', minutesAgo(100)], ['TECHNICIAN_ARRIVED', minutesAgo(80)], ['SERVICE_STARTED', minutesAgo(75)]] });
  for (const [cust, s] of [[8, 'cctv-installation'], [9, 'bathroom-cleaning'], [10, 'plumber-visit']] as const) {
    await createBooking({ cust, svc: s, tech: null, status: 'SEARCHING', slot: '16-18', scheduledFor: slotAt(1, '16-18'), createdAt: minutesAgo(20 + cust * 7) });
  }

  // ~2 months of history so the dashboard charts and growth figures are meaningful.
  const techFor = (cat: Cat) => {
    const options = techIds.map((id, i) => ({ id, i })).filter(({ id, i }) => techSkillOf.get(id)!.includes(cat) && TECHNICIANS[i]!.status === 'VERIFIED');
    return options.length ? pick(options).i : null;
  };
  const weighted = ['ac-general-service', 'ac-repair', 'ac-general-service', 'fan-installation', 'electrical-repair', 'tap-repair', 'plumber-visit', 'furniture-repair', 'washing-machine-repair', 'refrigerator-repair', 'bathroom-cleaning', 'home-deep-cleaning', 'room-painting', 'ro-service', 'cctv-installation', 'cockroach-control'];
  for (let day = -58; day <= -1; day++) {
    const perDay = day >= -30 ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 3);
    for (let k = 0; k < perDay; k++) {
      const s = pick(weighted);
      const tech = techFor(svc.get(s)!.cat);
      const slot = pick(['09-11', '11-13', '14-16', '16-18', '18-20']);
      const when = slotAt(day, slot);
      const cancelled = rand() < 0.14;
      await createBooking({
        cust: 1 + Math.floor(rand() * (CUSTOMER_NAMES.length - 1)),
        svc: s,
        tech: cancelled ? null : tech,
        status: cancelled || tech == null ? 'CUSTOMER_CANCELLED' : 'PAYMENT_COMPLETED',
        slot,
        scheduledFor: when,
        createdAt: new Date(when.getTime() - (6 + rand() * 30) * 3_600_000),
        steps: cancelled || tech == null ? [['CUSTOMER_CANCELLED', new Date(when.getTime() - 3_600_000)]] : paidSteps(when),
        completedAt: new Date(when.getTime() + 80 * 60_000),
        rating: rand() < 0.65 ? (rand() < 0.8 ? 5 : 4) : undefined,
        method: pick(['CASH', 'UPI', 'UPI', 'RAZORPAY'] as const),
      });
    }
  }

  // ── Notifications ────────────────────────────────────────────────────
  const ram = customers[0]!;
  const ravi = await prisma.technician.findUniqueOrThrow({ where: { id: techIds[0]! }, select: { userId: true } });
  await prisma.notification.createMany({
    data: [
      { userId: ram.userId, type: 'TECHNICIAN_EN_ROUTE', title: 'Technician on the way', body: 'Ravi Kumar is heading to your location for AC Repair.', data: { bookingId: acRepair.id }, createdAt: minutesAgo(35) },
      { userId: ram.userId, type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', body: "Your AC Service booking is confirmed. We're finding the right professional for you.", createdAt: minutesAgo(12) },
      { userId: ram.userId, type: 'OFFER', title: 'Flat 20% off AC Service', body: 'Use code FIXAC20 before 31 Oct 2026.', createdAt: minutesAgo(300) },
      { userId: ravi.userId, type: 'NEW_JOB', title: 'New service request', body: 'AC Repair in Tanuku, tomorrow 9 AM – 11 AM.', createdAt: minutesAgo(5) },
      { userId: ravi.userId, type: 'PAYMENT', title: 'Payment received', body: 'Earnings for AC Service have been added.', createdAt: minutesAgo(240) },
      { userId: ravi.userId, type: 'ANNOUNCEMENT', title: 'Stay on schedule', body: 'Reach on time to keep your rating high.', createdAt: minutesAgo(1440) },
    ],
  });

  const count = await prisma.booking.count({ where: { id: { notIn: ids } } });
  console.log(`Seed complete — ${count} bookings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
