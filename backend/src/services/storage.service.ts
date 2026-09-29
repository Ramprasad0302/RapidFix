import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UploadResultDto } from '@fixora/shared-types';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/** backend/uploads — served at /uploads. An S3 driver can replace `save()` later. */
export const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
export const UPLOAD_URL_PREFIX = '/uploads/';

export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

/** Detects the real type from magic bytes — the client-supplied MIME type is never trusted. */
function sniff(buf: Buffer): { ext: string; kind: 'image' | 'video' } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', kind: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', kind: 'image' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', kind: 'image' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    return { ext: brand.startsWith('qt') ? 'mov' : 'mp4', kind: 'video' };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', kind: 'video' };
  return null;
}

export async function saveUpload(buf: Buffer, allowed: 'image' | 'any' = 'any'): Promise<UploadResultDto> {
  const type = sniff(buf);
  if (!type || (allowed === 'image' && type.kind !== 'image')) {
    throw AppError.badRequest(
      allowed === 'image' ? 'Please upload a JPG, PNG or WebP image.' : 'Please upload a JPG, PNG, WebP image or an MP4/WebM video.',
      'UNSUPPORTED_FILE',
    );
  }
  const limit = type.kind === 'image' ? env.UPLOAD_MAX_MB * 1024 * 1024 : VIDEO_MAX_BYTES;
  if (buf.length > limit) {
    throw new AppError(413, 'FILE_TOO_LARGE', `File is too large (max ${Math.round(limit / 1024 / 1024)} MB).`);
  }

  const now = new Date();
  const rel = path.posix.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${randomUUID()}.${type.ext}`);
  const abs = path.join(UPLOAD_DIR, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf, { flag: 'wx' });
  return { path: UPLOAD_URL_PREFIX + rel, kind: type.kind, size: buf.length };
}

/** Only paths produced by `saveUpload` may be attached to records. */
export const isOwnUploadPath = (p: string) => /^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/.test(p);
