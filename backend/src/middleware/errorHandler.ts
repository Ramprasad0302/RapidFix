import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@fixora/shared-types';
import { Prisma } from '../generated/prisma/client';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`, 'ROUTE_NOT_FOUND'));
};

/** No connection could be had (pool timeout, host's per-hour connection cap, server down). */
function isDbUnavailable(err: Prisma.PrismaClientKnownRequestError) {
  const text = `${err.message} ${JSON.stringify(err.meta ?? {})}`;
  return /pool timeout|max_connections_per_hour|max_user_connections|ECONNREFUSED|Too many connections|\b45028\b|\b1226\b|\b1040\b/.test(text);
}

/** Maps every thrown error to the standard `{ success:false, message, code }` envelope. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appErr: AppError;

  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    appErr =
      err.code === 'P2002'
        ? AppError.conflict('This record already exists', 'DUPLICATE')
        : err.code === 'P2025'
          ? AppError.notFound()
          : isDbUnavailable(err)
            ? new AppError(503, 'SERVICE_BUSY', 'We’re a little busy right now. Please try again in a minute.')
            : new AppError(500, 'DATABASE_ERROR', 'Something went wrong');
  } else if (err?.type === 'entity.too.large') {
    appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request is too large');
  } else if (err?.type === 'entity.parse.failed') {
    appErr = AppError.badRequest('Malformed JSON body', 'INVALID_JSON');
  } else {
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }

  if (appErr.statusCode >= 500) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  }

  // Public routes set cache headers up front — an error must never be cached by browsers or proxies.
  res.set('Cache-Control', 'no-store');
  const body: ApiError = { success: false, message: appErr.message, code: appErr.code };
  if (appErr.details !== undefined && appErr.statusCode < 500) body.details = appErr.details;
  res.status(appErr.statusCode).json(body);
};
