import { describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import type { AuthSession } from '@fixora/shared-types';
import { createApiClient } from './apiClient';
import { createAuthStore } from './authStore';

const session = (token: string, role: AuthSession['user']['role'] = 'CUSTOMER'): AuthSession => ({
  accessToken: token,
  expiresIn: 900,
  user: { id: 'u1', role, name: 'Test', phone: '+919000000001', email: null, avatarUrl: null },
});

const reply = (config: InternalAxiosRequestConfig, status: number, data: unknown) =>
  Promise.resolve({ data, status, statusText: '', headers: {}, config });

/** Fake backend: `/profile` accepts only `current` token; `/auth/refresh` mints `fresh`. */
function setup(opts: { refreshOk?: boolean; refreshRole?: AuthSession['user']['role'] } = {}) {
  const { refreshOk = true, refreshRole = 'CUSTOMER' } = opts;
  let current = 'fresh';
  const calls = { refresh: 0, profile: 0 };

  const adapter: AxiosAdapter = async (config) => {
    const { AxiosError } = await import('axios');
    const fail = (status: number, data: unknown) =>
      Promise.reject(new AxiosError(`HTTP ${status}`, undefined, config, null, { data, status, statusText: '', headers: {}, config }));

    if (config.url === '/auth/refresh') {
      calls.refresh++;
      await new Promise((r) => setTimeout(r, 10));
      return refreshOk ? reply(config, 200, { success: true, data: session(current, refreshRole) }) : fail(401, { success: false, code: 'NO_SESSION', message: 'x' });
    }
    if (config.url === '/auth/logout') return reply(config, 200, { success: true, data: {} });
    if (config.url === '/profile') {
      calls.profile++;
      const auth = config.headers.get('Authorization');
      return auth === `Bearer ${current}`
        ? reply(config, 200, { success: true, data: { ok: true } })
        : fail(401, { success: false, code: 'TOKEN_EXPIRED', message: 'Session expired' });
    }
    return fail(404, { success: false, code: 'NOT_FOUND', message: 'nf' });
  };

  const api = createApiClient({ baseURL: '' });
  api.defaults.adapter = adapter;
  const onSessionExpired = vi.fn();
  const auth = createAuthStore({ api, knownRoles: ['CUSTOMER', 'TECHNICIAN'], onSessionExpired });
  return { api, auth, calls, onSessionExpired, rotate: (t: string) => (current = t) };
}

describe('createAuthStore + api client', () => {
  it('bootstrap restores a session from the refresh cookie', async () => {
    const { auth } = setup();
    await auth.actions.bootstrap();
    expect(auth.store.getState()).toMatchObject({ status: 'authenticated', accessToken: 'fresh' });
  });

  it('bootstrap without a session becomes guest', async () => {
    const { auth } = setup({ refreshOk: false });
    await auth.actions.bootstrap();
    expect(auth.store.getState().status).toBe('guest');
  });

  it('signs out a session whose role the app cannot route', async () => {
    const { auth } = setup({ refreshRole: 'FINANCE' });
    await auth.actions.bootstrap();
    expect(auth.store.getState()).toMatchObject({ status: 'guest', user: null, accessToken: null });
  });

  it('on TOKEN_EXPIRED, concurrent requests share ONE refresh and are retried', async () => {
    const { api, auth, calls, rotate } = setup();
    await auth.actions.bootstrap();
    rotate('rotated'); // server-side the old access token is now expired
    const results = await Promise.all([api.get('/profile'), api.get('/profile'), api.get('/profile')]);
    expect(results.every((r) => r.data.data.ok)).toBe(true);
    expect(calls.refresh).toBe(2); // 1 at bootstrap + 1 shared
    expect(auth.store.getState().accessToken).toBe('rotated');
  });

  it('when refresh fails mid-session: clears to guest and notifies once', async () => {
    const { api, auth, onSessionExpired } = setup();
    await auth.actions.bootstrap();
    // Make refresh fail from now on.
    api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const { AxiosError } = await import('axios');
      return Promise.reject(
        new AxiosError('401', undefined, config, null, {
          data: { success: false, code: config.url === '/profile' ? 'TOKEN_EXPIRED' : 'NO_SESSION', message: 'x' },
          status: 401, statusText: '', headers: {}, config,
        }),
      );
    }) as AxiosAdapter;
    await expect(api.get('/profile')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(auth.store.getState().status).toBe('guest');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('logout always ends local session', async () => {
    const { auth } = setup();
    await auth.actions.bootstrap();
    await auth.actions.logout();
    expect(auth.store.getState()).toMatchObject({ status: 'guest', accessToken: null });
  });
});
