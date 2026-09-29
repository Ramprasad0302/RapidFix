import { createServer } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { startDispatchWorker } from './jobs/dispatch.worker';
import { initSockets } from './sockets';

const app = createApp();
const httpServer = createServer(app);
initSockets(httpServer);
const stopDispatch = startDispatchWorker();

httpServer.listen(env.PORT, () => {
  logger.info(`FIXORA API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopDispatch();
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
