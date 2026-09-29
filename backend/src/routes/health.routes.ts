import { Router } from 'express';
import { prisma } from '../config/prisma';
import { ok } from '../utils/response';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  ok(res, { status: 'ok', db: 'ok', dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
});
