import type { FirebaseApp } from 'firebase/app';

/**
 * One Firebase app for the web client (phone sign-in and web push).
 * Values come from Firebase console → Project settings → Your apps → Web app.
 * The SDK is loaded only when a feature actually needs it.
 */
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

export const firebaseConfigured = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: Promise<FirebaseApp> | null = null;
export function getFirebaseApp(): Promise<FirebaseApp> {
  app ??= import('firebase/app').then(({ initializeApp, getApps }) => getApps()[0] ?? initializeApp(firebaseConfig));
  return app;
}
