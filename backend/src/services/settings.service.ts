import { prisma } from '../config/prisma';

/** Admin-editable platform settings (the `settings` table), cached briefly. */
const TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const row = await prisma.setting.findUnique({ where: { key } });
  const value = (row?.value as T | undefined) ?? fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function clearSettingsCache() {
  cache.clear();
}

export interface DispatchWeights {
  skill: number;
  distance: number;
  rating: number;
  workload: number;
}

export async function dispatchSettings() {
  const [timeoutSeconds, maxAttempts, radiusKm, weights] = await Promise.all([
    getSetting('dispatch.requestTimeoutSeconds', 60),
    getSetting('dispatch.maxAttempts', 5),
    getSetting('dispatch.searchRadiusKm', 15),
    getSetting<DispatchWeights>('dispatch.weights', { skill: 1, distance: 0.5, rating: 0.3, workload: 0.2 }),
  ]);
  return { timeoutSeconds, maxAttempts, radiusKm, weights };
}
