import axios, { AxiosError, type AxiosInstance } from 'axios';
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

export interface ApiClientOptions {
  baseURL: string;
  /** Generous default — rural 2G/3G links are slow. */
  timeoutMs?: number;
}

/**
 * The one Axios instance per app. Auth + refresh interceptors are attached
 * in Phase 2 via `attachAuth()`; nothing else should call `axios.create`.
 */
export function createApiClient({ baseURL, timeoutMs = 20_000 }: ApiClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { Accept: 'application/json' },
  });
  client.interceptors.response.use(undefined, (err) => Promise.reject(toApiRequestError(err)));
  return client;
}

/** Unwraps the `{ success, data }` envelope. */
export async function unwrap<T>(promise: Promise<{ data: ApiSuccess<T> }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}
