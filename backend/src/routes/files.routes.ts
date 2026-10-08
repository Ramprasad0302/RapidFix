import { Router } from 'express';
import { hasPermission, isAdminRole, Permission, Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf } from '../middleware/auth';
import { isOwnPrivatePath, readPrivateFile } from '../services/storage.service';
import { AppError } from '../utils/AppError';

/** Private KYC files: staff, or the technician who uploaded them. Never cached by shared caches. */
export const filesRouter = Router();

filesRouter.get('/private/{*rest}', authenticate(), async (req, res, next) => {
  const p = `/private/${[req.params.rest].flat().join('/')}`;
  if (!isOwnPrivatePath(p)) return next(AppError.notFound());
  const auth = authOf(req);
  // Franchise KYC (Aadhaar, PAN, agreement): head office, or the franchise's own manager.
  const franchiseDoc = { OR: [{ aadhaarFrontUrl: p }, { aadhaarBackUrl: p }, { panPhotoUrl: p }, { agreementUrl: p }] };
  if (auth.role === Role.FRANCHISE_ADMIN) {
    const allowed =
      (await prisma.technicianDocument.count({ where: { fileUrl: p, technician: { franchise: { userId: auth.userId } } } })) +
      (await prisma.franchise.count({ where: { userId: auth.userId, ...franchiseDoc } }));
    if (!allowed) return next(AppError.notFound());
  } else if (!isAdminRole(auth.role)) {
    const owned = await prisma.technicianDocument.count({ where: { fileUrl: p, technician: { userId: auth.userId } } });
    if (!owned) return next(AppError.notFound());
  } else if (!hasPermission(auth.role, Permission.FRANCHISES_MANAGE) && (await prisma.franchise.count({ where: franchiseDoc }))) {
    return next(AppError.notFound());
  }
  const file = await readPrivateFile(p);
  if (!file) return next(AppError.notFound('This file is no longer on the server. Please ask for it to be uploaded again.', 'FILE_MISSING'));
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(file.mime).send(file.data);
});
