#!/usr/bin/env node
/**
 * Snapshot of the public service catalogue, bundled into the Android app so it
 * shows services on the very first launch even without internet.
 *
 *   node scripts/catalog-snapshot.mjs [apiBase] > out.json
 *
 * Entries use the same React Query keys as the website (src/lib/offlineCache.ts).
 */
const API = (process.argv[2] || process.env.SNAPSHOT_API || 'https://api.rapidfix.in/api/v1').replace(/\/$/, '');

async function get(path) {
  const res = await fetch(API + path, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = await res.json();
  return body.data;
}

const entries = [];
const add = (key, data) => entries.push([key, data]);

const categories = await get('/services/categories');
add(['categories'], categories);
add(['services', 'popular'], await get('/services?popular=true&limit=10'));
for (const [key, path] of [
  [['offers'], '/offers'],
  [['stats', 'public'], '/stats/public'],
  [['reviews', 'featured'], '/reviews/featured'],
  [['app-config'], '/app-config'],
]) {
  add(key, await get(path).catch(() => null));
}
let services = 0;
for (const c of categories) {
  const list = await get(`/services?category=${encodeURIComponent(c.slug)}`);
  add(['services', 'category', c.slug], list);
  for (const s of list) {
    add(['service', s.slug], await get(`/services/${encodeURIComponent(s.slug)}`));
    services++;
  }
}
process.stdout.write(JSON.stringify({ createdAt: new Date().toISOString(), api: API, entries: entries.filter(([, d]) => d != null) }));
process.stderr.write(`catalog snapshot: ${categories.length} categories, ${services} services\n`);
