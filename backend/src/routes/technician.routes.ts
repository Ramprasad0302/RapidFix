import { Router } from 'express';
import { Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf, authorize } from '../middleware/auth';
import { ok } from '../utils/response';

export const technicianRouter = Router();
technicianRouter.use(authenticate(), authorize(Role.TECHNICIAN));

technicianRouter.get('/profile', async (req, res) => {
  const tech = await prisma.technician.findUniqueOrThrow({
    where: { userId: authOf(req).userId },
    select: {
      id: true,
      experienceYears: true,
      languages: true,
      villageTown: true,
      district: true,
      state: true,
      pincode: true,
      serviceRadiusKm: true,
      verificationStatus: true,
      rejectionReason: true,
      isOnline: true,
      ratingAvg: true,
      ratingCount: true,
      completedJobs: true,
      user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } },
      skills: { select: { category: { select: { id: true, name: true, slug: true } } } },
    },
  });
  ok(res, { ...tech, skills: tech.skills.map((s) => s.category) });
});
