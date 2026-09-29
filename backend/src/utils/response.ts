import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '@fixora/shared-types';

export function ok<T>(res: Response, data: T, status = 200, meta?: PaginationMeta) {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(status).json(body);
}

export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
