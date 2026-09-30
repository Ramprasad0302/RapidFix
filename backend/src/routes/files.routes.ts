import { Router } from 'express';
import { isAdminRole } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf } from '../middleware/auth';
import { isOwnPrivatePath, privateFilePath } from '../services/storage.service';
import { AppError } from '../utils/AppError';

/** Private KYC files: staff, or the technician who uploaded them. Never cached by shared caches. */
export const filesRouter = Router();

filesRouter.get('/private/{*rest}', authenticate(), async (req, res, next) => {
  const p = `/private/${[req.params.rest].flat().join('/')}`;
  if (!isOwnPrivatePath(p)) return next(AppError.notFound());
  const auth = authOf(req);
  if (!isAdminRole(auth.role)) {
    const owned = await prisma.technicianDocument.count({ where: { fileUrl: p, technician: { userId: auth.userId } } });
    if (!owned) return next(AppError.notFound());
  }
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(privateFilePath(p), (err) => err && next(AppError.notFound()));
});
