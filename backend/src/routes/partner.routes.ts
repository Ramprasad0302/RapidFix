import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@fixora/shared-types';
import { setRefreshCookie } from '../controllers/auth.controller';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { registerPartner } from '../services/technicianAccount.service';
import { ok } from '../utils/response';

/** "Become a RapidFix partner": a freshly signed-in phone account registers as a technician (pending verification). */
export const partnerRouter = Router();

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.email().trim().toLowerCase(), z.literal('')]).optional(),
  avatarUrl: z.string().nullable().optional(),
  experienceYears: z.number().int().min(0).max(60),
  bio: z.string().trim().max(500).nullable().optional(),
  languages: z.array(z.string().trim().min(2).max(30)).min(1).max(10),
  serviceRadiusKm: z.number().int().min(1).max(50),
  addressLine: z.string().trim().max(255).optional(),
  villageTown: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a valid pincode'),
  baseLatitude: z.number().min(-90).max(90).nullable().optional(),
  baseLongitude: z.number().min(-180).max(180).nullable().optional(),
  skills: z.array(z.uuid()).min(1, 'Choose at least one service').max(10),
});

partnerRouter.post('/register', authenticate(), authorize(Role.CUSTOMER), validate(schema), async (req, res) => {
  const { session, refreshToken } = await registerPartner(authOf(req).userId, req.body, { ip: req.ip, userAgent: req.get('user-agent') });
  setRefreshCookie(res, refreshToken);
  ok(res, session, 201);
});
