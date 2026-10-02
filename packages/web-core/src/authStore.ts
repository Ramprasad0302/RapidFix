import { createStore, useStore } from 'zustand';
import type { AuthSession, AuthUser, Role } from '@fixora/shared-types';
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
  /** Returns false (and clears) when the role is not one this app knows. */
  setSession(session: AuthSession): boolean;
  updateUser(patch: Partial<AuthUser>): void;
  logout(): Promise<void>;
}

export interface AuthStoreOptions {
  api: FixoraApiClient;
  /** Roles the app can route; anything else is an unknown role and is signed out. */
  knownRoles: readonly Role[];
  /** Called when an authenticated session dies mid-use (refresh failed). */
  onSessionExpired?: (lastRole: Role | null) => void;
}

const GUEST: AuthState = { status: 'guest', user: null, accessToken: null };
/** Who was signed in last on this device (profile only — never a token), for opening the app offline. */
const LAST_USER_KEY = 'fixora.lastUser';

function readLastUser(): AuthUser | null {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}
function writeLastUser(user: AuthUser | null) {
  try {
    if (user) globalThis.localStorage?.setItem(LAST_USER_KEY, JSON.stringify(user));
    else globalThis.localStorage?.removeItem(LAST_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAuthStore({ api, knownRoles, onSessionExpired }: AuthStoreOptions) {
  const store = createStore<AuthState>()(() => ({ status: 'unknown', user: null, accessToken: null }));
  store.subscribe((s) => {
    if (s.status === 'authenticated' && s.user) writeLastUser(s.user);
    else if (s.status === 'guest') writeLastUser(null);
  });

  function setSession(session: AuthSession): boolean {
    if (!knownRoles.includes(session.user.role)) {
      store.setState(GUEST);
      void api.post('/auth/logout', {}, { skipAuthRefresh: true }).catch(() => undefined);
      return false;
    }
    store.setState({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
    return true;
  }

  /** One network refresh; throws only on network failure (so callers can tell offline from logged-out). */
  async function refreshOnce(): Promise<string | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const session = await unwrap<AuthSession>(api.post('/auth/refresh', {}, { skipAuthRefresh: true }));
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
        // Offline at launch: keep the last signed-in user so saved bookings and profile
        // still show; the session is confirmed (or ended) as soon as we're back online.
        const last = readLastUser();
        if (!last || !knownRoles.includes(last.role)) {
          store.setState(GUEST);
          return;
        }
        store.setState({ status: 'authenticated', user: last, accessToken: null });
        globalThis.addEventListener?.('online', () => void actions.bootstrap(), { once: true });
      }
    },
    setSession,
    updateUser(patch) {
      const user = store.getState().user;
      if (user) store.setState({ user: { ...user, ...patch } });
    },
    async logout() {
      try {
        await api.post('/auth/logout', {}, { skipAuthRefresh: true });
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
      const { status, user } = store.getState();
      if (status !== 'authenticated') return;
      store.setState(GUEST);
      onSessionExpired?.(user?.role ?? null);
    },
  });

  function useAuth<T>(selector: (s: AuthState) => T): T {
    return useStore(store, selector);
  }

  return { store, actions, useAuth };
}
