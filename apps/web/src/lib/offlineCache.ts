import { dehydrate, hydrate, type Query, type QueryClient } from '@tanstack/react-query';
import type { CategoryDto, ServiceSummaryDto } from '@fixora/shared-types';
import { catalogApi, trustApi } from './endpoints';
import { isNativeApp, nativeCatalogSnapshot } from './nativeApp';

/**
 * Offline support for app data.
 *
 * - Successful queries are saved to this device and restored at start-up, so
 *   services, prices, offers, bookings and profile show without internet
 *   (React Query keeps showing saved data while offline and refreshes it when
 *   the connection is back).
 * - Once a day, while online, the whole service catalogue (every category and
 *   every service's details) is downloaded in the background, so even pages
 *   never opened before work offline.
 *
 * The app shell itself (pages, scripts, images) is cached by /sw.js.
 */

const STORE_KEY = 'rapidfix.offlineData.v1';
const WARMED_KEY = 'rapidfix.catalogWarmedAt';
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const WARM_EVERY_MS = 24 * 60 * 60_000;
/** Bump when the shape of cached API data changes. */
const BUSTER = '1';

/** Not worth keeping offline: admin screens (large, desktop), live job offers, map lookups. */
const SKIP_ROOTS = new Set(['admin', 'geo', 'invoice']);
const shouldSave = (q: Query) => {
  if (q.state.status !== 'success') return false;
  const [root, sub] = q.queryKey as [unknown, unknown];
  if (typeof root === 'string' && SKIP_ROOTS.has(root)) return false;
  if (root === 'tech' && sub === 'requests') return false; // offers expire within a minute
  if (root === 'services' && sub === 'search') return false; // rebuilt from the saved catalogue
  return true;
};

function read(): { buster: string; at: number; state: unknown } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as { buster: string; at: number; state: unknown }) : null;
  } catch {
    return null;
  }
}

/**
 * Android app, first launch: the service catalogue built into the app fills
 * anything not saved yet, so services show even before the first connection.
 * Marked as old, so it's replaced with live data as soon as we're online.
 */
async function seedFromApp(qc: QueryClient) {
  const raw = await nativeCatalogSnapshot().catch(() => null);
  if (!raw) return;
  try {
    const { entries } = JSON.parse(raw) as { entries: [unknown[], unknown][] };
    for (const [queryKey, data] of entries) {
      if (qc.getQueryData(queryKey) !== undefined) continue;
      // A request already failing offline mustn't overwrite the snapshot with its error.
      await qc.cancelQueries({ queryKey, exact: true });
      qc.setQueryData(queryKey, data, { updatedAt: 1 });
    }
  } catch {
    /* snapshot unreadable — the app still works online */
  }
}

/** Restore saved data (call before the first render) and keep saving changes. */
export function persistQueryCache(qc: QueryClient) {
  const saved = read();
  if (saved && saved.buster === BUSTER && Date.now() - saved.at < MAX_AGE_MS) {
    try {
      hydrate(qc, saved.state as Parameters<typeof hydrate>[1]);
    } catch {
      /* corrupt or outdated — start fresh */
    }
  }
  if (isNativeApp()) void seedFromApp(qc);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try {
      const state = dehydrate(qc, { shouldDehydrateQuery: shouldSave });
      localStorage.setItem(STORE_KEY, JSON.stringify({ buster: BUSTER, at: Date.now(), state }));
    } catch {
      // Storage full or blocked: the app still works online.
    }
  };
  qc.getQueryCache().subscribe((e) => {
    if (e.type !== 'updated' && e.type !== 'removed') return;
    clearTimeout(timer);
    timer = setTimeout(save, 1500);
  });
  // Save right away when the app goes to the background (it may be closed next).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download the full catalogue in the background (at most once a day, only online). */
export async function warmCatalog(qc: QueryClient, force = false) {
  if (!navigator.onLine) return;
  try {
    const last = Number(localStorage.getItem(WARMED_KEY) ?? 0);
    if (!force && Date.now() - last < WARM_EVERY_MS) return;
  } catch {
    /* storage blocked — warm anyway */
  }
  try {
    const fresh = { staleTime: 0 };
    const categories = await qc.fetchQuery({ queryKey: ['categories'], queryFn: catalogApi.categories, ...fresh });
    await Promise.allSettled([
      qc.prefetchQuery({ queryKey: ['services', 'popular'], queryFn: () => catalogApi.services({ popular: true, limit: 10 }), ...fresh }),
      qc.prefetchQuery({ queryKey: ['offers'], queryFn: () => catalogApi.offers(), ...fresh }),
      qc.prefetchQuery({ queryKey: ['stats', 'public'], queryFn: trustApi.stats, ...fresh }),
      qc.prefetchQuery({ queryKey: ['reviews', 'featured'], queryFn: trustApi.reviews, ...fresh }),
      qc.prefetchQuery({ queryKey: ['app-config'], queryFn: trustApi.appConfig, ...fresh }),
    ]);
    for (const c of categories) {
      const list = await qc.fetchQuery({ queryKey: ['services', 'category', c.slug], queryFn: () => catalogApi.services({ category: c.slug }), ...fresh });
      for (const s of list) {
        await qc.prefetchQuery({ queryKey: ['service', s.slug], queryFn: () => catalogApi.service(s.slug), ...fresh });
        await sleep(150); // gentle on the server and on slow connections
      }
    }
    localStorage.setItem(WARMED_KEY, String(Date.now()));
  } catch {
    // Connection dropped half-way — whatever was fetched is already saved; retried next start.
  }
}

/** Every saved service (from the category lists), for searching without internet. */
function savedServices(qc: QueryClient): ServiceSummaryDto[] {
  const byId = new Map<string, ServiceSummaryDto>();
  const categories = qc.getQueryData<CategoryDto[]>(['categories']) ?? [];
  for (const c of categories) {
    for (const s of qc.getQueryData<ServiceSummaryDto[]>(['services', 'category', c.slug]) ?? []) byId.set(s.id, s);
  }
  for (const s of qc.getQueryData<ServiceSummaryDto[]>(['services', 'popular']) ?? []) byId.set(s.id, s);
  return [...byId.values()];
}

/** Offline search over the saved catalogue: every word must match the name, tagline or category. */
export function searchSavedServices(qc: QueryClient, q: string, limit = 30): ServiceSummaryDto[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return savedServices(qc)
    .filter((s) => {
      const hay = `${s.name} ${s.tagline} ${s.category.name}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}
