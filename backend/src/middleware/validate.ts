import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError';

type Part = 'body' | 'query' | 'params';

/**
 * Validates and replaces `req[part]` with the parsed (coerced, trimmed) value.
 * Express 5 makes `req.query` a getter, so parsed query lands on `res.locals.query`.
 */
export function validate(schema: ZodType, part: Part = 'body'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      return next(AppError.badRequest(details[0]?.message ?? 'Invalid request', 'VALIDATION_ERROR', details));
    }
    if (part === 'query') res.locals.query = result.data;
    else req[part] = result.data;
    next();
  };
}
