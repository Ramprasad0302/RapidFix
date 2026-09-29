import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ok } from '../utils/response';

export const customerRouter = Router();
customerRouter.use(authenticate(), authorize(Role.CUSTOMER));

const profileSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
  customer: { select: { referralCode: true } },
} as const;

// Every query is keyed by the caller's own user id — a customer can only ever see themself.
customerRouter.get('/profile', async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: authOf(req).userId }, select: profileSelect });
  ok(res, user);
});

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z
    .union([z.email('Enter a valid email').trim().toLowerCase(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
});

customerRouter.put('/profile', validate(updateProfileSchema), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: authOf(req).userId },
    data: { name: req.body.name, email: req.body.email },
    select: profileSelect,
  });
  ok(res, user);
});
