import { RUNTIME } from './runtimeConfig';

/** Public, non-secret app constants. */
export const APP_VERSION = '1.0.0';
/** Fallbacks — the live values come from GET /app-config (see useSupportContacts). */
export const SUPPORT_PHONE = '+91 94919 63366';
export const SUPPORT_EMAIL = 'support@rapidfix.local';
export const GOOGLE_MAPS_KEY = RUNTIME.googleMapsKey;
