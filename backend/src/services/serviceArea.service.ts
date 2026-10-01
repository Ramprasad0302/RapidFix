import { haversineKm } from '@fixora/shared-utils';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

/**
 * Where RapidFix works: every ACTIVE location (admin → Locations) with its
 * radius, e.g. Tanuku within 10 km. With no active location at all, nothing is
 * restricted (so a fresh install never locks everyone out).
 */

interface Area {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

let cache: { at: number; areas: Area[] } | null = null;
const TTL_MS = 60_000;

export async function activeAreas(): Promise<Area[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.areas;
  const rows = await prisma.location.findMany({ where: { isActive: true }, select: { name: true, latitude: true, longitude: true, radiusKm: true } });
  cache = { at: Date.now(), areas: rows };
  return rows;
}

export function clearServiceAreaCache() {
  cache = null;
}

export interface ServiceAreaCheck {
  served: boolean;
  /** Serving town (when served) or the nearest one. */
  town: string | null;
  distanceKm: number | null;
  areas: { name: string; radiusKm: number }[];
}

export async function checkPoint(lat: number, lng: number): Promise<ServiceAreaCheck> {
  const areas = await activeAreas();
  const list = areas.map((a) => ({ name: a.name, radiusKm: a.radiusKm }));
  if (!areas.length) return { served: true, town: null, distanceKm: null, areas: list };
  const ranked = areas
    .map((a) => ({ a, d: haversineKm(lat, lng, a.latitude, a.longitude) }))
    .sort((x, y) => x.d - y.d);
  const inside = ranked.find((r) => r.d <= r.a.radiusKm);
  const nearest = inside ?? ranked[0]!;
  return { served: !!inside, town: nearest.a.name, distanceKm: Math.round(nearest.d * 10) / 10, areas: list };
}

/** Bookings outside the service area are refused with a friendly, specific error. */
export async function assertServed(point: { latitude?: number | null; longitude?: number | null; villageTown?: string | null }) {
  const areas = await activeAreas();
  if (!areas.length) return;
  if (point.latitude != null && point.longitude != null) {
    const check = await checkPoint(point.latitude, point.longitude);
    if (check.served) return;
    throw new AppError(422, 'OUT_OF_SERVICE_AREA', 'We are not in your area yet — but we are expanding very soon!', check);
  }
  // No map position: accept a town we serve by name.
  const town = point.villageTown?.trim().toLowerCase();
  if (town && areas.some((a) => a.name.toLowerCase() === town)) return;
  throw new AppError(422, 'OUT_OF_SERVICE_AREA', 'We are not in your area yet — but we are expanding very soon!', {
    served: false,
    town: null,
    distanceKm: null,
    areas: areas.map((a) => ({ name: a.name, radiusKm: a.radiusKm })),
  } satisfies ServiceAreaCheck);
}

export async function recordInterest(input: { userId?: string | null; name?: string | null; phone?: string | null; label?: string; latitude?: number | null; longitude?: number | null }) {
  // One request per person/place is enough.
  const recent = await prisma.serviceAreaInterest.findFirst({
    where: {
      createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) },
      OR: [...(input.userId ? [{ userId: input.userId }] : []), ...(input.phone ? [{ phone: input.phone }] : [])],
    },
  });
  if (recent && (input.userId || input.phone)) return { saved: true };
  await prisma.serviceAreaInterest.create({
    data: {
      userId: input.userId ?? null,
      name: input.name ?? null,
      phone: input.phone ?? null,
      label: (input.label ?? '').slice(0, 255),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });
  return { saved: true };
}

export function interestList(limit = 200) {
  return prisma.serviceAreaInterest.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}

/** Guard for the AppError type check in routes. */
export const isOutOfArea = (e: unknown) => e instanceof AppError && e.code === 'OUT_OF_SERVICE_AREA';
