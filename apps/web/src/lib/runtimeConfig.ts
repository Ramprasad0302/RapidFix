/**
 * Settings that can be changed after deployment by editing /config.js on the
 * web host (no rebuild). Empty values fall back to the build-time VITE_* ones.
 */
interface RuntimeConfig {
  apiUrl?: string;
  socketUrl?: string;
  googleMapsKey?: string;
  firebase?: { apiKey?: string; authDomain?: string; projectId?: string; appId?: string; messagingSenderId?: string; vapidKey?: string };
}

declare global {
  interface Window {
    RAPIDFIX_CONFIG?: RuntimeConfig;
  }
}

const rc: RuntimeConfig = (typeof window !== 'undefined' && window.RAPIDFIX_CONFIG) || {};
const fb = rc.firebase ?? {};
const pick = (runtime: string | undefined, built: string | undefined) => (runtime && runtime.trim()) || built || '';

export const RUNTIME = {
  apiUrl: pick(rc.apiUrl, import.meta.env.VITE_API_URL) || '/api/v1',
  socketUrl: pick(rc.socketUrl, import.meta.env.VITE_SOCKET_URL),
  googleMapsKey: pick(rc.googleMapsKey, import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
  firebase: {
    apiKey: pick(fb.apiKey, import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: pick(fb.authDomain, import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: pick(fb.projectId, import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: pick(fb.appId, import.meta.env.VITE_FIREBASE_APP_ID),
    messagingSenderId: pick(fb.messagingSenderId, import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    vapidKey: pick(fb.vapidKey, import.meta.env.VITE_FIREBASE_VAPID_KEY),
  },
};
