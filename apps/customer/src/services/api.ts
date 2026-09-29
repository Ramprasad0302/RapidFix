import { createApiClient } from '@fixora/web-core';

/** The single Axios instance for this app. */
export const api = createApiClient({ baseURL: import.meta.env.VITE_API_URL });
