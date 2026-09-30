import { createApiClient } from '@fixora/web-core';

/** The single Axios instance for the whole app. */
export const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });

/** Origin that serves uploaded media (`/uploads/...`). */
export const API_ORIGIN = new URL(import.meta.env.VITE_API_URL, window.location.origin).origin;

/** Resolves a server-relative upload path to a full URL; external URLs pass through. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('/uploads/') ? `${API_ORIGIN}${path}` : path;
}
