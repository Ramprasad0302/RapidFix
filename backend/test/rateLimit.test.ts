import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { clientKey } from '../src/middleware/rateLimit';

const req = (ip: string | undefined, headers: Record<string, string> = {}, remote?: string) =>
  ({ ip, get: (h: string) => headers[h.toLowerCase()], socket: { remoteAddress: remote } }) as unknown as Request;

describe('rate-limit client key', () => {
  it('uses the client IP when Express knows it', () => {
    expect(clientKey(req('203.0.113.7'))).toBe('203.0.113.7');
  });
  it('falls back to the forwarded header or socket, and never returns undefined (socket-based hosting)', () => {
    expect(clientKey(req(undefined, { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
    expect(clientKey(req(undefined, {}, '127.0.0.1'))).toBe('127.0.0.1');
    expect(clientKey(req(undefined))).toBe('unknown-client');
  });
});
