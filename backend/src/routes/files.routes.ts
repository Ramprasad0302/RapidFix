import { Router, type NextFunction, type Request, type Response } from 'express';
import { hasPermission, isAdminRole, Permission, Role } from '@fixora/shared-types';
import { prisma } from '../config/prisma';
import { authenticate, authOf } from '../middleware/auth';
import { isOwnPrivatePath, readPrivateFile } from '../services/storage.service';
import { AppError } from '../utils/AppError';

/** Private KYC files: staff, or the technician who uploaded them. Never cached by shared caches. */
export const filesRouter = Router();

async function sendPrivateFile(p: string, req: Request, res: Response, next: NextFunction) {
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
}

/**
 * GET /files/private-file?path=/private/2026/10/<uuid>.jpg — what the apps use. The address doesn't
 * end in .jpg/.png/.pdf: Hostinger's CDN treats such addresses as static files and answers the
 * browser's CORS check itself (without allowing the Authorization header), so the photo never loads.
 */
filesRouter.get('/private-file', authenticate(), async (req, res, next) => {
  await sendPrivateFile(typeof req.query.path === 'string' ? req.query.path : '', req, res, next);
});

/** Older address (kept for clients that still use it). */
filesRouter.get('/private/{*rest}', authenticate(), async (req, res, next) => {
  await sendPrivateFile(`/private/${[req.params.rest].flat().join('/')}`, req, res, next);
});
