import type { FirebaseApp } from 'firebase/app';
import { RUNTIME } from './runtimeConfig';

/**
 * One Firebase app for the web client (phone sign-in and web push).
 * Values come from Firebase console → Project settings → Your apps → Web app.
 * The SDK is loaded only when a feature actually needs it.
 */
const f = RUNTIME.firebase;
export const firebaseConfig = {
  apiKey: f.apiKey,
  authDomain: f.authDomain || (f.projectId ? `${f.projectId}.firebaseapp.com` : undefined),
  projectId: f.projectId,
  appId: f.appId,
  messagingSenderId: f.messagingSenderId,
};

export const firebaseConfigured = () => !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let app: Promise<FirebaseApp> | null = null;
export function getFirebaseApp(): Promise<FirebaseApp> {
  app ??= import('firebase/app').then(({ initializeApp, getApps }) => getApps()[0] ?? initializeApp(firebaseConfig));
  return app;
}
