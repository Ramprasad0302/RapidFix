/**
 * RapidFix service catalogue — categories and services shown on the website and app.
 *
 *  - The dev seed (`npm run db:seed`) calls syncCatalog with overwrite: the list here is the truth.
 *  - Live sites (`npm run db:catalog`) only ADD what's missing, so prices and texts edited in
 *    the admin panel are never overwritten.
 */
import type { PrismaClient } from '../src/generated/prisma/client';

const rs = (rupees: number) => rupees * 100;

export const CATEGORIES = [
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
  { slug: 'computer-repair', name: 'Computer & Laptop', iconKey: 'computer', tagline: 'Laptop, Desktop, Printer', professionalTitle: 'Computer Technician' },
  { slug: 'vehicle-care', name: 'Car & Bike Care', iconKey: 'vehicle', tagline: 'Car Wash, Bike Service at Home', professionalTitle: 'Vehicle Care Expert' },
  { slug: 'salon-at-home', name: 'Salon at Home', iconKey: 'salon', tagline: 'Haircut, Facial, Waxing', professionalTitle: 'Beauty & Grooming Expert' },
] as const;
export type Cat = (typeof CATEGORIES)[number]['slug'];

export interface Svc {
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

export const SERVICES: Svc[] = [
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
  // ── Added: the everyday services people book most ──
  { cat: 'ac-cooling', slug: 'ac-gas-refill', name: 'AC Gas Refill', tagline: 'Leak fixed, full cooling restored', price: 2499, visit: 0, min: 60, max: 120, warranty: 90,
    description: 'Leak detection and minor brazing, vacuum and full gas top-up for split or window ACs.',
    inc: ['Leak detection', 'Minor leak brazing', 'Vacuum & gas top-up', 'Cooling check'], exc: ['Major leak or coil repairs', 'Spare parts'] },
  { cat: 'ac-cooling', slug: 'ac-uninstallation', name: 'AC Uninstallation', tagline: 'Safe removal with gas pump-down', price: 599, visit: 0, min: 45, max: 90, warranty: 0,
    description: 'Careful removal of split or window AC with gas pumped into the outdoor unit, ready to shift.',
    inc: ['Gas pump-down', 'Indoor & outdoor unit removal', 'Pipe capping'], exc: ['Transport', 'Re-installation'] },
  { cat: 'ac-cooling', slug: 'air-cooler-repair', name: 'Air Cooler Repair', tagline: 'Motor, pump and pad problems', price: 249, visit: 0, min: 45, max: 90, warranty: 30,
    description: 'Repair of desert and personal coolers — motor, water pump, pads and switches.',
    inc: ['Diagnosis', 'Repair labour', 'Cleaning of tank'], exc: ['Motor, pump & pads'] },
  { cat: 'electrical', slug: 'light-installation', name: 'Light & Fixture Installation', tagline: 'Tube lights, LED panels, chandeliers', price: 199, visit: 0, min: 30, max: 60, warranty: 30, popular: true,
    description: 'Installation of tube lights, LED panels, decorative lights and chandeliers.',
    inc: ['Fixture mounting', 'Connection & testing'], exc: ['Lights & fixtures', 'New wiring'] },
  { cat: 'electrical', slug: 'inverter-service', name: 'Inverter & Battery Service', tagline: 'Backup problems fixed', price: 399, visit: 0, min: 45, max: 90, warranty: 30,
    description: 'Inverter check-up, battery water top-up, terminal cleaning and backup troubleshooting. New inverter installation available.',
    inc: ['Inverter diagnosis', 'Battery top-up & terminal cleaning', 'Load check'], exc: ['Battery / inverter replacement', 'Distilled water'] },
  { cat: 'electrical', slug: 'house-wiring', name: 'House Wiring', tagline: 'New points and rewiring', price: 799, visit: 0, min: 120, max: 360, warranty: 90,
    description: 'New switch/socket points, concealed or casing wiring, and rewiring of old circuits.',
    inc: ['Site inspection', 'Wiring labour (per room)', 'Safety testing'], exc: ['Wires, pipes & switches', 'Wall chiselling & plastering'] },
  { cat: 'plumbing', slug: 'toilet-repair', name: 'Toilet & Commode Repair', tagline: 'Flush, leaks and blockages', price: 299, visit: 0, min: 30, max: 90, warranty: 30, popular: true,
    description: 'Flush tank, jet spray, commode leaks and blockages fixed.',
    inc: ['Diagnosis', 'Flush / seal repair', 'Blockage clearing'], exc: ['New commode or flush tank', 'Spare parts'] },
  { cat: 'plumbing', slug: 'drain-blockage', name: 'Drain Blockage Removal', tagline: 'Kitchen, bathroom and floor drains', price: 349, visit: 0, min: 30, max: 90, warranty: 15,
    description: 'Clearing of blocked kitchen sinks, wash basins, bathroom and floor drains.',
    inc: ['Blockage clearing', 'Flow check'], exc: ['Pipe replacement', 'Sewer line work'] },
  { cat: 'plumbing', slug: 'motor-pump-repair', name: 'Water Motor & Pump Repair', tagline: 'No water? We fix the motor', price: 399, visit: 0, min: 45, max: 120, warranty: 30,
    description: 'Repair and installation of water motors, pumps and pressure pumps.',
    inc: ['Diagnosis', 'Repair / installation labour'], exc: ['Motor, capacitor & parts', 'Motor rewinding'] },
  { cat: 'carpentry', slug: 'furniture-assembly', name: 'Furniture Assembly', tagline: 'Beds, wardrobes and tables assembled', price: 499, visit: 0, min: 60, max: 180, warranty: 30,
    description: 'Assembly of new flat-pack furniture — beds, wardrobes, tables, TV units and more.',
    inc: ['Assembly labour', 'Wall fixing (if needed)'], exc: ['Hardware & fittings'] },
  { cat: 'carpentry', slug: 'kitchen-cabinet-repair', name: 'Kitchen Cabinet Repair', tagline: 'Hinges, channels and shutters', price: 349, visit: 0, min: 45, max: 120, warranty: 30,
    description: 'Modular kitchen and cupboard hinges, drawer channels, handles and shutter alignment.',
    inc: ['Inspection', 'Repair labour up to 60 min'], exc: ['Hinges, channels & hardware'] },
  { cat: 'painting', slug: 'full-home-painting', name: 'Full Home Painting', tagline: '2BHK interior, done in days', price: 14999, visit: 0, min: 1440, max: 4320, warranty: 365,
    description: 'Complete interior painting of a 2BHK home with surface preparation and two coats.',
    inc: ['Furniture covering', 'Surface preparation', 'Two coats of paint', 'Cleanup'], exc: ['Paint material', 'Putty, waterproofing & texture'] },
  { cat: 'painting', slug: 'waterproofing', name: 'Waterproofing', tagline: 'Terrace and wall seepage treatment', price: 2999, visit: 0, min: 240, max: 480, warranty: 365,
    description: 'Seepage inspection and waterproof coating for terraces, bathrooms and exterior walls.',
    inc: ['Seepage inspection', 'Crack filling', 'Waterproof coating (up to 100 sq ft)'], exc: ['Area beyond 100 sq ft', 'Tile removal'] },
  { cat: 'appliance-repair', slug: 'geyser-repair', name: 'Geyser Repair & Installation', tagline: 'Hot water back in no time', price: 299, visit: 0, min: 45, max: 90, warranty: 30, popular: true,
    description: 'Heating problems, leaks and thermostat faults fixed; new geyser installation available.',
    inc: ['Diagnosis', 'Repair / installation labour'], exc: ['Element, thermostat & parts', 'Pipes & fittings'] },
  { cat: 'appliance-repair', slug: 'microwave-repair', name: 'Microwave Repair', tagline: 'Not heating or not turning on', price: 299, visit: 99, min: 45, max: 90, warranty: 30,
    description: 'Solo, grill and convection microwave ovens — heating, power and button faults.',
    inc: ['Diagnosis', 'Repair labour'], exc: ['Magnetron & spare parts'] },
  { cat: 'appliance-repair', slug: 'chimney-cleaning', name: 'Kitchen Chimney Cleaning', tagline: 'Grease-free filters and motor', price: 699, visit: 0, min: 60, max: 120, warranty: 30,
    description: 'Deep cleaning of chimney filters, hood and motor for better suction.',
    inc: ['Filter degreasing', 'Hood & panel cleaning', 'Suction check'], exc: ['Motor & spare parts'] },
  { cat: 'cleaning', slug: 'sofa-cleaning', name: 'Sofa & Carpet Cleaning', tagline: 'Shampoo and vacuum deep clean', price: 599, visit: 0, min: 60, max: 150, warranty: 0, popular: true,
    description: 'Dry vacuum and wet shampoo cleaning for fabric sofas (up to 5 seats) and carpets.',
    inc: ['Vacuuming', 'Shampoo & stain treatment', 'Quick-dry finish'], exc: ['Leather polishing', 'Carpets above 50 sq ft'] },
  { cat: 'cleaning', slug: 'kitchen-cleaning', name: 'Kitchen Deep Cleaning', tagline: 'Grease-free cabinets, tiles and slab', price: 1299, visit: 0, min: 180, max: 300, warranty: 0,
    description: 'Degreasing of cabinets, tiles, slab, sink and appliances exteriors.',
    inc: ['Cabinets inside & out', 'Tiles, slab & sink', 'Appliance exteriors'], exc: ['Chimney interior', 'Utensil washing'] },
  { cat: 'cctv', slug: 'cctv-repair', name: 'CCTV Repair & Maintenance', tagline: 'Cameras, DVR and mobile view', price: 349, visit: 0, min: 45, max: 90, warranty: 30,
    description: 'No video, blurry cameras, DVR/NVR faults and mobile viewing problems fixed.',
    inc: ['Diagnosis', 'Camera cleaning & alignment', 'Mobile view setup'], exc: ['Cameras, DVR & cables'] },
  { cat: 'ro-service', slug: 'ro-installation', name: 'RO Installation', tagline: 'New purifier fitted and tested', price: 499, visit: 0, min: 45, max: 90, warranty: 90,
    description: 'Wall mounting, plumbing connection and TDS setting for a new RO purifier.',
    inc: ['Wall mounting', 'Inlet & drain connection', 'TDS check'], exc: ['Purifier', 'Extra pipes & taps'] },
  { cat: 'ro-service', slug: 'ro-filter-change', name: 'RO Filter & Membrane Change', tagline: 'Fresh filters, pure water', price: 1499, visit: 0, min: 45, max: 90, warranty: 180,
    description: 'Replacement of sediment, carbon filters and RO membrane with a genuine filter kit.',
    inc: ['Filter kit', 'Membrane replacement', 'Tank cleaning', 'TDS check'], exc: ['UV lamp & pump'] },
  { cat: 'pest-control', slug: 'termite-control', name: 'Termite Control', tagline: 'Drill-fill-seal treatment', price: 2499, visit: 0, min: 180, max: 300, warranty: 365,
    description: 'Drill-fill-seal anti-termite treatment for woodwork and walls of a 2BHK home.',
    inc: ['Drilling & chemical injection', 'Woodwork spraying', 'Sealing'], exc: ['Furniture repair'] },
  { cat: 'pest-control', slug: 'mosquito-control', name: 'Mosquito Control', tagline: 'Indoor and outdoor treatment', price: 699, visit: 0, min: 45, max: 90, warranty: 30,
    description: 'Residual spray indoors and fogging outdoors to reduce mosquitoes.',
    inc: ['Indoor residual spray', 'Outdoor fogging'], exc: ['Stagnant water removal'] },
  { cat: 'pest-control', slug: 'bed-bug-control', name: 'Bed Bug Control', tagline: 'Two-visit treatment', price: 1299, visit: 0, min: 90, max: 150, warranty: 60,
    description: 'Two-visit spray treatment for beds, sofas and crevices.',
    inc: ['2 treatment visits', 'Beds, sofas & crevices'], exc: ['Mattress replacement'] },
  { cat: 'computer-repair', slug: 'laptop-repair', name: 'Laptop Repair', tagline: 'Slow, not starting or broken screen', price: 399, visit: 0, min: 45, max: 120, warranty: 30, popular: true,
    description: 'Diagnosis and repair of laptops — power, display, keyboard, speed and virus issues.',
    inc: ['Diagnosis', 'Software fixes & cleanup', 'Repair labour'], exc: ['Screen, battery & spare parts'] },
  { cat: 'computer-repair', slug: 'desktop-printer-repair', name: 'Desktop & Printer Repair', tagline: 'PCs and printers back to work', price: 349, visit: 0, min: 45, max: 120, warranty: 30,
    description: 'Desktop PCs and printers — not starting, paper jams, drivers and network sharing.',
    inc: ['Diagnosis', 'Driver & software setup', 'Repair labour'], exc: ['Cartridges & spare parts'] },
  { cat: 'computer-repair', slug: 'software-installation', name: 'Windows & Software Setup', tagline: 'OS install, data backup, antivirus', price: 299, visit: 0, min: 60, max: 120, warranty: 15,
    description: 'Windows installation, drivers, office software, antivirus and data backup.',
    inc: ['OS & driver installation', 'Basic software setup', 'Data backup (up to 50 GB)'], exc: ['Software licences'] },
  { cat: 'vehicle-care', slug: 'car-wash', name: 'Car Wash at Home', tagline: 'Foam wash and interior vacuum', price: 399, visit: 0, min: 45, max: 60, warranty: 0, popular: true,
    description: 'Exterior foam wash, tyre cleaning and interior vacuum at your doorstep.',
    inc: ['Foam wash & wipe', 'Tyre & rim cleaning', 'Interior vacuum'], exc: ['Polishing & waxing'] },
  { cat: 'vehicle-care', slug: 'car-interior-cleaning', name: 'Car Interior Deep Cleaning', tagline: 'Seats, roof and dashboard', price: 1299, visit: 0, min: 120, max: 180, warranty: 0,
    description: 'Shampoo cleaning of seats, roof, carpets and dashboard dressing.',
    inc: ['Seat & carpet shampoo', 'Roof & door pads', 'Dashboard dressing'], exc: ['Leather conditioning'] },
  { cat: 'vehicle-care', slug: 'bike-service', name: 'Bike Service at Home', tagline: 'General service at your doorstep', price: 499, visit: 0, min: 60, max: 120, warranty: 15,
    description: 'General service for scooters and motorcycles — engine oil, brakes, chain and wash.',
    inc: ['Engine oil change labour', 'Brake & chain adjustment', 'Air filter cleaning', 'Wash'], exc: ['Engine oil & spare parts'] },
  { cat: 'salon-at-home', slug: 'mens-haircut', name: "Men's Haircut & Shave", tagline: 'Salon-style grooming at home', price: 249, visit: 0, min: 30, max: 60, warranty: 0,
    description: 'Haircut, beard trim or shave by a trained groomer with sanitised tools.',
    inc: ['Haircut', 'Beard trim or shave', 'Sanitised single-use kit'], exc: ['Hair colour', 'Head massage'] },
  { cat: 'salon-at-home', slug: 'facial-cleanup', name: 'Facial & Cleanup', tagline: 'Glowing skin, relaxing at home', price: 799, visit: 0, min: 60, max: 90, warranty: 0, popular: true,
    description: 'Cleanup or facial with branded products, done by a trained beautician.',
    inc: ['Cleansing & scrub', 'Face pack', 'Branded products'], exc: ['Advanced treatments'] },
  { cat: 'salon-at-home', slug: 'waxing', name: 'Waxing', tagline: 'Full arms, legs and underarms', price: 599, visit: 0, min: 45, max: 90, warranty: 0,
    description: 'Honey or chocolate waxing for arms, legs and underarms with hygienic single-use strips.',
    inc: ['Full arms & legs', 'Underarms', 'Single-use strips'], exc: ['Rica / roll-on wax'] },
];

/** Adds (or, with `overwrite`, updates) every category and service above. */
export async function syncCatalog(prisma: PrismaClient, opts: { overwrite?: boolean; retireUnlisted?: boolean } = {}) {
  const catId = new Map<string, string>();
  let createdCategories = 0;
  let createdServices = 0;
  for (const [i, c] of CATEGORIES.entries()) {
    const existing = await prisma.serviceCategory.findUnique({ where: { slug: c.slug } });
    const row = existing
      ? opts.overwrite
        ? await prisma.serviceCategory.update({ where: { slug: c.slug }, data: { ...c, sortOrder: i } })
        : existing
      : await prisma.serviceCategory.create({ data: { ...c, sortOrder: i } });
    if (!existing) createdCategories++;
    catId.set(c.slug, row.id);
  }
  if (opts.retireUnlisted) {
    // Retire services from earlier seeds that are no longer in the catalogue.
    await prisma.service.updateMany({ where: { slug: { notIn: SERVICES.map((s) => s.slug) } }, data: { isActive: false, isPopular: false } });
  }

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
    const existing = await prisma.service.findUnique({ where: { slug: s.slug } });
    const row = existing
      ? opts.overwrite
        ? await prisma.service.update({ where: { slug: s.slug }, data })
        : existing
      : await prisma.service.create({ data: { slug: s.slug, ...data } });
    if (!existing) createdServices++;
    svc.set(s.slug, { id: row.id, price: row.basePrice, visit: row.visitCharge, name: row.name, cat: s.cat });
  }
  return { catId, svc, createdCategories, createdServices };
}
