import { createStore, useStore } from 'zustand';
import type { AuthAudience, AuthSession, AuthUser, Role } from '@fixora/shared-types';
import { ApiRequestError, unwrap, type FixoraApiClient } from './apiClient';

export type AuthStatus = 'unknown' | 'authenticated' | 'guest';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Memory only — never persisted. The refresh token is an httpOnly cookie. */
  accessToken: string | null;
}

export interface AuthActions {
  /** Restore the session from the refresh cookie (call once on app start). */
  bootstrap(): Promise<void>;
  /** Returns false (and clears) when the role is not allowed in this app. */
  setSession(session: AuthSession): boolean;
  updateUser(patch: Partial<AuthUser>): void;
  logout(): Promise<void>;
}

export interface AuthStoreOptions {
  api: FixoraApiClient;
  audience: AuthAudience;
  /** Roles this app accepts; anything else is treated as an unknown role and cleared. */
  allowedRoles: readonly Role[];
  /** Called when an authenticated session dies mid-use (refresh failed). */
  onSessionExpired?: () => void;
}

const GUEST: AuthState = { status: 'guest', user: null, accessToken: null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAuthStore({ api, audience, allowedRoles, onSessionExpired }: AuthStoreOptions) {
  const store = createStore<AuthState>()(() => ({ status: 'unknown', user: null, accessToken: null }));

  function setSession(session: AuthSession): boolean {
    if (!allowedRoles.includes(session.user.role)) {
      store.setState(GUEST);
      void api.post('/auth/logout', { audience }, { skipAuthRefresh: true }).catch(() => undefined);
      return false;
    }
    store.setState({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
    return true;
  }

  /** One network refresh; throws only on network failure (so callers can distinguish offline from logged-out). */
  async function refreshOnce(): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const session = await unwrap<AuthSession>(api.post('/auth/refresh', { audience }, { skipAuthRefresh: true }));
        return setSession(session) ? session.accessToken : null;
      } catch (err) {
        if (!(err instanceof ApiRequestError)) return null;
        // Another tab rotated the cookie a moment ago — the browser now holds the new one.
        if (err.code === 'REFRESH_IN_PROGRESS' && attempt === 0) {
          await sleep(400);
          continue;
        }
        if (err.isNetworkError) throw err;
        return null;
      }
    }
    return null;
  }

  // Single-flight: concurrent 401s share one refresh call.
  let inflight: Promise<string | null> | null = null;
  function refreshAccessToken(): Promise<string | null> {
    inflight ??= refreshOnce().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const actions: AuthActions = {
    async bootstrap() {
      try {
        if (!(await refreshAccessToken())) store.setState(GUEST);
      } catch {
        // Offline at launch: continue as guest; protected screens ask the user to log in.
        store.setState(GUEST);
      }
    },
    setSession,
    updateUser(patch) {
      const user = store.getState().user;
      if (user) store.setState({ user: { ...user, ...patch } });
    },
    async logout() {
      try {
        await api.post('/auth/logout', { audience }, { skipAuthRefresh: true });
      } catch {
        // Clearing locally is what matters; the server session expires on its own.
      } finally {
        store.setState(GUEST);
      }
    },
  };

  api.setAuthHandlers({
    getAccessToken: () => store.getState().accessToken,
    refreshAccessToken: () => refreshAccessToken().catch(() => null),
    onSessionExpired: () => {
      if (store.getState().status !== 'authenticated') return;
      store.setState(GUEST);
      onSessionExpired?.();
    },
  });

  function useAuth<T>(selector: (s: AuthState) => T): T {
    return useStore(store, selector);
  }

  return { store, actions, useAuth };
}
