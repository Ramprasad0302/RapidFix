import { BookingStatus } from '@fixora/shared-types';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { dispatchBooking, expireOffers } from '../services/assignment.service';

/** A booking with no candidates is retried at most this often. */
const RETRY_MS = 30_000;

/**
 * Background dispatcher: expires timed-out offers and retries bookings still
 * SEARCHING. Single-instance for now; with several API instances this moves to
 * a queue (BullMQ) or a DB lock so only one node dispatches.
 */
export function startDispatchWorker(intervalMs = 5000) {
  const lastTried = new Map<string, number>();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireOffers();
      const searching = await prisma.booking.findMany({
        where: { status: BookingStatus.SEARCHING },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });
      const now = Date.now();
      for (const { id } of searching) {
        if (now - (lastTried.get(id) ?? 0) < RETRY_MS) continue;
        lastTried.set(id, now);
        await dispatchBooking(id);
      }
      if (lastTried.size > 5000) lastTried.clear();
    } catch (err) {
      logger.error({ err }, 'dispatch tick failed');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
