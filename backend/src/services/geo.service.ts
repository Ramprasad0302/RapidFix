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
  geometry: { location: { lat: number; lng: number }; location_type?: string };
  types?: string[];
}

/** Most specific first: a building / door, then a street address, then a road… (plus codes last). */
const PRECISION = ['subpremise', 'premise', 'establishment', 'point_of_interest', 'street_address', 'route', 'sublocality', 'neighborhood', 'locality'];
const rank = (r: GResult) => {
  if (r.types?.includes('plus_code')) return 99;
  const i = PRECISION.findIndex((t) => r.types?.includes(t));
  return (i === -1 ? 50 : i) - (r.geometry.location_type === 'ROOFTOP' ? 0.5 : 0);
};

/**
 * Google returns several results for one point (the building, the street, the area…).
 * Use the most precise one and fill anything it lacks (area, town, PIN) from the others.
 */
function fromGoogleResults(results: GResult[]): GeoAddress {
  const sorted = [...results].sort((a, b) => rank(a) - rank(b));
  const best = fromGoogle(sorted[0]!);
  for (const r of sorted.slice(1)) {
    const more = fromGoogle(r);
    for (const k of ['houseNo', 'street', 'area', 'villageTown', 'district', 'state', 'pincode'] as const) {
      if (!best[k] && more[k]) best[k] = more[k];
    }
  }
  if (!best.title) best.title = [best.area || best.street, best.villageTown].filter(Boolean).join(', ');
  return best;
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
      if (!data.results?.length) throw AppError.notFound('No address found here', 'ADDRESS_NOT_FOUND');
      return fromGoogleResults(data.results);
    }
    const data = (await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
    )) as NomResult & { error?: string };
    if (data.error) throw AppError.notFound('No address found here', 'ADDRESS_NOT_FOUND');
    return fromNominatim(data);
  });
  // Google often has no district for Indian addresses: take it from the pincode.
  let { district, state } = result;
  if ((!district || !state) && /^[1-9]\d{5}$/.test(result.pincode)) {
    const pin = await lookupPincode(result.pincode).catch(() => null);
    district ||= pin?.district ?? '';
    state ||= pin?.state ?? '';
  }
  // Keep the exact pin, not the geocoder's snapped point.
  return { ...result, district, state, latitude: lat, longitude: lng };
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

export interface PincodeInfo {
  pincode: string;
  district: string;
  state: string;
  /** Post offices / localities under this pincode, e.g. "Sajjapuram". */
  places: string[];
  /** Mandal / block (usually the town), e.g. "Tanuku". */
  block: string;
}

interface PostOffice {
  Name: string;
  District: string;
  State: string;
  Block?: string;
}

/** District and state for a 6-digit Indian pincode (India Post's public directory). */
export async function lookupPincode(pincode: string): Promise<PincodeInfo> {
  return cached(`p:${pincode}`, async () => {
    const data = (await getJson(`https://api.postalpincode.in/pincode/${pincode}`)) as { Status: string; PostOffice?: PostOffice[] | null }[];
    const offices = data[0]?.Status === 'Success' ? (data[0].PostOffice ?? []) : [];
    if (!offices.length) throw AppError.notFound('This pincode was not found', 'PINCODE_NOT_FOUND');
    const most = (pick: (o: PostOffice) => string | undefined) => {
      const counts = new Map<string, number>();
      for (const o of offices) {
        const v = pick(o)?.trim();
        if (v && v !== 'NA') counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    };
    return {
      pincode,
      district: most((o) => o.District),
      state: most((o) => o.State),
      places: [...new Set(offices.map((o) => o.Name))],
      block: most((o) => o.Block),
    };
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

export interface IfscInfo {
  ifsc: string;
  bank: string;
  branch: string;
  city: string;
  state: string;
}

/** Bank and branch for an IFSC (Razorpay's public IFSC directory) — lets people spot a mistyped code. */
export async function lookupIfsc(ifsc: string): Promise<IfscInfo> {
  const code = ifsc.toUpperCase();
  return cached(`ifsc:${code}`, async () => {
    let res: Response;
    try {
      res = await fetch(`https://ifsc.razorpay.com/${code}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new AppError(503, 'IFSC_LOOKUP_UNAVAILABLE', 'Could not check this IFSC right now.');
    }
    if (res.status === 404) throw AppError.notFound('No bank branch has this IFSC. Please check it.', 'IFSC_NOT_FOUND');
    if (!res.ok) throw new AppError(503, 'IFSC_LOOKUP_UNAVAILABLE', 'Could not check this IFSC right now.');
    const d = (await res.json()) as { BANK?: string; BRANCH?: string; CITY?: string; STATE?: string };
    return { ifsc: code, bank: d.BANK ?? '', branch: d.BRANCH ?? '', city: d.CITY ?? '', state: d.STATE ?? '' };
  });
}
