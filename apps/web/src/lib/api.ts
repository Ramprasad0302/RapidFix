import { createApiClient } from '@fixora/web-core';
import { RUNTIME } from './runtimeConfig';

/** The single Axios instance for the whole app. */
export const api = createApiClient({ baseURL: RUNTIME.apiUrl });

/** Origin that serves uploaded media (`/uploads/...`). */
export const API_ORIGIN = new URL(RUNTIME.apiUrl, window.location.origin).origin;

/** Resolves a server-relative upload path to a full URL; external URLs pass through. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/uploads/') ? `${API_ORIGIN}${path}` : path;
}
