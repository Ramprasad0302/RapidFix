import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { env, isProd } from './config/env';

/**
 * Production single-server mode: the API also serves the built web app
 * (apps/web/dist), so one Node.js process runs all of RapidFix on one address —
 * what Hostinger's Node.js hosting and a VPS both expect.
 */
export const WEB_DIST_DIR = path.resolve(env.WEB_DIST_DIR);

export function shouldServeWeb() {
  if (env.SERVE_WEB === 'off') return false;
  if (env.SERVE_WEB === 'auto' && env.NODE_ENV !== 'production') return false;
  return existsSync(path.join(WEB_DIST_DIR, 'index.html'));
}

/** Browser rules for the web app: which outside services it may load (maps, fonts, payments, Firebase). */
export const WEB_CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://www.google.com', 'https://www.gstatic.com', 'https://apis.google.com', 'https://maps.googleapis.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'", 'https:', 'wss:'],
  frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com', 'https://recaptcha.google.com', 'https://*.firebaseapp.com'],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  // Only behind HTTPS (production); on plain http it would break every request.
  upgradeInsecureRequests: isProd ? [] : null,
};

export function mountWebApp(app: Express) {
  // Hashed build files never change; everything else is revalidated so deploys roll out at once.
  app.use('/assets', express.static(path.join(WEB_DIST_DIR, 'assets'), { immutable: true, maxAge: '365d', index: false }));
  app.use(
    express.static(WEB_DIST_DIR, {
      index: false,
      setHeaders: (res, file) => {
        if (file.endsWith('sw.js') || file.endsWith('.webmanifest') || file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
  // Client-side routes (/bookings/123, /admin/…) → index.html. API, sockets and uploads are not touched.
  app.get(/^\/(?!api\/|api$|socket\.io\/|uploads\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}
