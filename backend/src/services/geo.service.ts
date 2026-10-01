import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

/**
 * Geocoding behind one interface:
 *  • Google Geocoding when GOOGLE_MAPS_API_KEY is set (production)
 *  • OpenStreetMap Nominatim otherwise (development / fallback — light use only,
 *    identified by User-Agent as its usage policy requires)
 * Results are cached; coordinates are rounded (~11 m) so nearby pins share entries.
 */

export interface GeoAddress {
  /** One-line summary, e.g. "Venkatarayapuram, Tanuku" */
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

export interface GeoPlace {
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
}

const UA = 'RapidFix/1.0 (support@rapidfix.in)';
const TIMEOUT_MS = 8000;
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL = 24 * 3_600_000;

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as T;
  const value = await load();
  if (cache.size > 5000) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'geocoding request failed');
    throw new AppError(503, 'GEOCODING_UNAVAILABLE', 'Could not look up this location right now. Please enter the address manually.');
  }
}

// ─── Nominatim ───────────────────────────────────────────────────────────

type NomAddress = Record<string, string | undefined>;
interface NomResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NomAddress;
}

function fromNominatim(r: NomResult): GeoAddress {
  const a = r.address ?? {};
  const street = a.road ?? a.pedestrian ?? a.residential ?? '';
  const area = a.neighbourhood ?? a.quarter ?? a.suburb ?? a.hamlet ?? a.residential ?? '';
  const town = a.town ?? a.city ?? a.village ?? a.municipality ?? a.county ?? '';
  const title = [area || street, town].filter(Boolean).join(', ') || r.display_name.split(',').slice(0, 2).join(',');
  return {
    title,
    formatted: r.display_name.replace(/, India$/, ''),
    houseNo: [a.house_number, a.building].filter(Boolean).join(', '),
    street: street === area ? '' : street,
    area,
    villageTown: town,
    district: a.state_district ?? a.county ?? '',
    state: a.state ?? '',
    pincode: (a.postcode ?? '').replace(/\D/g, '').slice(0, 6),
    latitude: Number(r.lat),
    longitude: Number(r.lon),
  };
}

// ─── Google ──────────────────────────────────────────────────────────────

interface GComponent {
  long_name: string;
  types: string[];
}
interface GResult {
  formatted_address: string;
  address_components: GComponent[];
  geometry: { location: { lat: number; lng: number } };
}

function fromGoogle(r: GResult): GeoAddress {
  const get = (...types: string[]) => r.address_components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? '';
  const area = get('sublocality_level_1', 'sublocality', 'neighborhood');
  const town = get('locality', 'administrative_area_level_3');
  return {
    title: [area || get('route'), town].filter(Boolean).join(', '),
    formatted: r.formatted_address.replace(/, India$/, ''),
    // Door / flat / building number when Google knows it (often present in towns with mapped buildings).
    houseNo: [get('subpremise'), get('premise'), get('street_number')].filter(Boolean).join(', '),
    street: get('route'),
    area,
    villageTown: town,
    district: get('administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    pincode: get('postal_code'),
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
  };
}

const useGoogle = () => !!env.GOOGLE_MAPS_API_KEY;

export async function reverseGeocode(lat: number, lng: number): Promise<GeoAddress> {
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const result = await cached(key, async () => {
    if (useGoogle()) {
      const data = (await getJson(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&region=in&key=${env.GOOGLE_MAPS_API_KEY}`,
      )) as { results?: GResult[] };
      const first = data.results?.[0];
      if (!first) throw AppError.notFound('No address found here', 'ADDRESS_NOT_FOUND');
      return fromGoogle(first);
    }
    const data = (await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
    )) as NomResult & { error?: string };
    if (data.error) throw AppError.notFound('No address found here', 'ADDRESS_NOT_FOUND');
    return fromNominatim(data);
  });
  // Keep the exact pin, not the geocoder's snapped point.
  return { ...result, latitude: lat, longitude: lng };
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number }): Promise<GeoPlace[]> {
  const query = q.trim();
  if (query.length < 3) return [];
  return cached(`s:${query.toLowerCase()}:${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`, async () => {
    if (useGoogle()) {
      const bias = near ? `&bounds=${near.lat - 0.5},${near.lng - 0.5}|${near.lat + 0.5},${near.lng + 0.5}` : '';
      const data = (await getJson(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:IN${bias}&key=${env.GOOGLE_MAPS_API_KEY}`,
      )) as { results?: GResult[] };
      return (data.results ?? []).slice(0, 6).map((r) => {
        const g = fromGoogle(r);
        return { title: g.title || r.formatted_address.split(',')[0]!, subtitle: g.formatted, latitude: g.latitude, longitude: g.longitude };
      });
    }
    const view = near ? `&viewbox=${near.lng - 0.6},${near.lat + 0.6},${near.lng + 0.6},${near.lat - 0.6}` : '';
    const data = (await getJson(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=in&q=${encodeURIComponent(query)}${view}`,
    )) as NomResult[];
    return data.map((r) => {
      const g = fromNominatim(r);
      return { title: r.name || g.title, subtitle: g.formatted, latitude: g.latitude, longitude: g.longitude };
    });
  });
}

/** Best-effort coordinates for a typed address (used when a booking has no GPS pin). */
export async function geocodeAddress(parts: { area: string; villageTown: string; district: string; state: string; pincode: string }) {
  for (const q of [
    `${parts.area}, ${parts.villageTown}, ${parts.district}, ${parts.state} ${parts.pincode}`,
    `${parts.villageTown}, ${parts.district}, ${parts.state}`,
  ]) {
    try {
      const [hit] = await searchPlaces(q);
      if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
    } catch {
      /* try the coarser query */
    }
  }
  return null;
}
