import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError, ApiSuccess } from '@fixora/shared-types';

/** Normalised error every screen can render without inspecting Axios internals. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number | null,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  get isNetworkError() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

export function toApiRequestError(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err;
  if (err instanceof AxiosError) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new ApiRequestError('The request timed out. Check your connection and try again.', 'TIMEOUT', null);
    }
    if (!err.response) {
      return new ApiRequestError("You're offline or the server is unreachable. Please try again.", 'NETWORK_ERROR', null);
    }
    const body = err.response.data as Partial<ApiError> | undefined;
    return new ApiRequestError(
      body?.message ?? 'Something went wrong. Please try again.',
      body?.code ?? 'HTTP_ERROR',
      err.response.status,
      body?.details,
    );
  }
  return new ApiRequestError('Something went wrong. Please try again.', 'UNKNOWN', null);
}

/** Hooks the auth store plugs into the client (avoids a circular import). */
export interface AuthHandlers {
  getAccessToken(): string | null;
  /** Single-flight refresh; resolves to a new access token or null when the session is gone. */
  refreshAccessToken(): Promise<string | null>;
  onSessionExpired(): void;
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Skip the automatic refresh-and-retry (used by the auth endpoints themselves). */
    skipAuthRefresh?: boolean;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export interface FixoraApiClient extends AxiosInstance {
  setAuthHandlers(handlers: AuthHandlers): void;
}

export interface ApiClientOptions {
  baseURL: string;
  /** Generous default — rural 2G/3G links are slow. */
  timeoutMs?: number;
}

/** The one Axios instance per app. Nothing else should call `axios.create`. */
export function createApiClient({ baseURL, timeoutMs = 20_000 }: ApiClientOptions): FixoraApiClient {
  const client = axios.create({
    baseURL,
    timeout: timeoutMs,
    // Sends the httpOnly refresh cookie to /auth/*.
    withCredentials: true,
    headers: { Accept: 'application/json' },
  }) as FixoraApiClient;

  let auth: AuthHandlers | null = null;
  client.setAuthHandlers = (h) => {
    auth = h;
  };

  client.interceptors.request.use((config) => {
    const token = auth?.getAccessToken();
    if (token && !config.headers.has('Authorization')) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  client.interceptors.response.use(undefined, async (err: unknown) => {
    const apiErr = toApiRequestError(err);
    const config = err instanceof AxiosError ? (err.config as RetriableConfig | undefined) : undefined;

    if (auth && config && apiErr.status === 401 && !config.skipAuthRefresh) {
      if (apiErr.code === 'TOKEN_EXPIRED' && !config._retried) {
        config._retried = true;
        const token = await auth.refreshAccessToken();
        if (token) {
          config.headers.set('Authorization', `Bearer ${token}`);
          return client.request(config);
        }
      }
      auth.onSessionExpired();
    }
    throw apiErr;
  });

  return client;
}

/** Unwraps the `{ success, data }` envelope. */
export async function unwrap<T>(promise: Promise<{ data: ApiSuccess<T> }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}
