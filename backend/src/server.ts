import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { startDispatchWorker } from './jobs/dispatch.worker';
import { startNotificationWorker } from './jobs/notification.worker';
import { warmFirebaseCerts } from './services/firebaseAuth.service';
import { runStartupTasks } from './services/startupTasks';
import { initSockets } from './sockets';

const app = createApp();
const httpServer = createServer(app);
initSockets(httpServer);
let stopDispatch = () => {};
let stopNotifications = () => {};

// Catalogue / schema upkeep (new tables and columns on the live database, discontinued categories,
// "Technician Visit" services). The background workers start once it's done, so they never query a
// column the upgrade is still adding.
void runStartupTasks().finally(() => {
  stopDispatch = startDispatchWorker();
  stopNotifications = startNotificationWorker();
});
// Phone sign-in: Google's keys ready before the first OTP is checked.
warmFirebaseCerts();

httpServer.listen(env.PORT, () => {
  logger.info(typeof env.PORT === 'number' ? `RapidFix API listening on http://localhost:${env.PORT}${env.API_PREFIX}` : `RapidFix API listening on ${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopDispatch();
  stopNotifications();
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
