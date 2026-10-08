import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { UploadResultDto } from '@fixora/shared-types';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';

/**
 * Public uploads, served at /uploads. Resolved from the working directory (the
 * backend folder in dev, tests and Docker) so the bundled dist/ build uses the
 * same place. An S3 driver can replace `save()` later.
 */
export const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);
export const UPLOAD_URL_PREFIX = '/uploads/';
/** KYC documents: never served statically — only via the authenticated files route. */
export const PRIVATE_UPLOAD_DIR = path.resolve(env.PRIVATE_UPLOAD_DIR);
export const PRIVATE_URL_PREFIX = '/private/';

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

export async function saveUpload(buf: Buffer, allowed: 'image' | 'any' | 'document' = 'any', opts: { private?: boolean } = {}): Promise<UploadResultDto> {
  const type = sniff(buf) ?? (allowed === 'document' && buf.subarray(0, 5).toString('ascii') === '%PDF-' ? { ext: 'pdf', kind: 'image' as const } : null);
  if (!type || ((allowed === 'image' || allowed === 'document') && type.kind !== 'image')) {
    throw AppError.badRequest(
      allowed === 'image' ? 'Please upload a JPG, PNG or WebP image.' : allowed === 'document' ? 'Please upload a JPG, PNG, WebP or PDF file.' : 'Please upload a JPG, PNG, WebP image or an MP4/WebM video.',
      'UNSUPPORTED_FILE',
    );
  }
  const limit = type.kind === 'image' ? env.UPLOAD_MAX_MB * 1024 * 1024 : VIDEO_MAX_BYTES;
  if (buf.length > limit) {
    throw new AppError(413, 'FILE_TOO_LARGE', `File is too large (max ${Math.round(limit / 1024 / 1024)} MB).`);
  }

  const now = new Date();
  const rel = path.posix.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${randomUUID()}.${type.ext}`);
  const abs = path.join(opts.private ? PRIVATE_UPLOAD_DIR : UPLOAD_DIR, rel);
  if (opts.private) {
    // ID proofs live in the database (a redeploy or a second server can't lose them); the disk copy is a spare.
    await prisma.privateFile.create({ data: { path: PRIVATE_URL_PREFIX + rel, mime: MIME[type.ext] ?? 'application/octet-stream', size: buf.length, data: new Uint8Array(buf) } });
    await mkdir(path.dirname(abs), { recursive: true })
      .then(() => writeFile(abs, buf, { flag: 'wx' }))
      .catch(() => undefined);
    return { path: PRIVATE_URL_PREFIX + rel, kind: type.kind, size: buf.length };
  }
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf, { flag: 'wx' });
  return { path: (opts.private ? PRIVATE_URL_PREFIX : UPLOAD_URL_PREFIX) + rel, kind: type.kind, size: buf.length };
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

/** A private file's bytes: from the database, else the disk copy (files uploaded before they were kept in the database). */
export async function readPrivateFile(p: string): Promise<{ mime: string; data: Buffer } | null> {
  const row = await prisma.privateFile.findUnique({ where: { path: p }, select: { mime: true, data: true } });
  if (row) return { mime: row.mime, data: Buffer.from(row.data) };
  try {
    const ext = p.split('.').pop() ?? '';
    return { mime: MIME[ext] ?? 'application/octet-stream', data: await readFile(privateFilePath(p)) };
  } catch {
    return null;
  }
}

export const isOwnPrivatePath = (p: string) => /^\/private\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(p);

/** Absolute file for a validated private path (callers must authorise first). */
export const privateFilePath = (p: string) => path.join(PRIVATE_UPLOAD_DIR, p.slice(PRIVATE_URL_PREFIX.length));

/** Only paths produced by `saveUpload` may be attached to records. */
export const isOwnUploadPath = (p: string) => /^\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$/.test(p);
