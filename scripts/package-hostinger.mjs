#!/usr/bin/env node
/**
 * Builds a self-contained Node.js app for Hostinger's "Node.js Apps" hosting
 * (Express): the compiled API + the built website in one folder, zipped.
 *
 *   npm run package:hostinger            → ~/Desktop/rapidfix-node-app.zip
 *
 * Hostinger installs the dependencies and runs `npm start`. Secrets are NOT in
 * the zip — set them as environment variables in hPanel.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build', 'hostinger');
const zip = process.env.OUT_ZIP ?? path.join(homedir(), 'Desktop', 'rapidfix-node-app.zip');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// Play Store app (Trusted Web Activity, android/). Android verifies the app ↔ site link through
// /.well-known/assetlinks.json listing these certificate fingerprints: the upload key below, plus
// Google Play's app-signing key — add that one on Hostinger as ANDROID_SHA256 (no rebuild needed).
const ANDROID_PACKAGE = 'in.rapidfix.app';
const ANDROID_UPLOAD_SHA256 = 'FD:F6:26:E9:2F:D8:C4:35:59:B5:2E:89:6B:65:C8:04:F6:D0:E5:F8:C5:2A:D7:F0:5D:F9:B2:D5:74:AA:ED:B2';

/** package.json first (hosts detect the framework from it), then everything else. */
const zipDir = (file, cwd) => {
  execSync(`zip -q "${file}" package.json`, { cwd, stdio: 'inherit' });
  execSync(`zip -qr "${file}" . -x '*.DS_Store' -x package.json`, { cwd, stdio: 'inherit' });
};

console.log('▸ Building website and API…');
run('npm run build -w @fixora/web');
run('npm run db:generate -w @fixora/backend');
run('npm run build -w @fixora/backend');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Compiled API (our own shared packages and the Prisma client are bundled in).
// .mjs = always an ES module, whatever the host's loader; start.js stays CommonJS.
cpSync(path.join(root, 'backend/dist/server.js'), path.join(out, 'server.mjs'));
// Website, served by the API. config.js keeps apiUrl empty = same domain.
cpSync(path.join(root, 'apps/web/dist'), path.join(out, 'public'), { recursive: true });
rmSync(path.join(out, 'public', '.htaccess'), { force: true });
// Database migrations, for `npm run migrate` on the server if ever needed.
cpSync(path.join(root, 'backend/prisma/migrations'), path.join(out, 'prisma/migrations'), { recursive: true });
cpSync(path.join(root, 'backend/prisma/schema.prisma'), path.join(out, 'prisma/schema.prisma'));

const backendPkg = JSON.parse(readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = Object.fromEntries(Object.entries(backendPkg.dependencies).filter(([name]) => !name.startsWith('@fixora/')));

writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'rapidfix',
      version: '1.0.0',
      private: true,
      description: 'RapidFix — Get It Fixed. Website + API (Express).',
      main: 'start.js',
      engines: { node: '>=22' },
      scripts: {
        start: 'node start.js',
        build: 'echo "Already built — nothing to do"',
      },
      dependencies,
      // Security: the Prisma adapter pins mariadb 3.4.5 (GHSA-cqhc-2h57-wpxf etc.); force the patched release.
      overrides: { mariadb: rootPkg.overrides.mariadb },
    },
    null,
    2,
  ) + '\n',
);

// Entry point: production defaults that point at this folder's layout, then the server.
writeFileSync(
  path.join(out, 'start.js'),
  `// RapidFix entry point (Hostinger runs: npm start, or loads this file directly).
// Plain CommonJS on purpose: some hosts load the startup file with require().
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Uploads (photos, partner ID documents) live OUTSIDE the app folder, in the account's home
// directory: a redeploy replaces the app folder and would otherwise delete them.
const DATA_DIR = process.env.RAPIDFIX_DATA_DIR || path.join(os.homedir(), 'rapidfix-data');
const defaults = {
  NODE_ENV: 'production',
  SERVE_WEB: 'on',
  WEB_DIST_DIR: 'public',
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  PRIVATE_UPLOAD_DIR: path.join(DATA_DIR, 'uploads-private'),
  API_DOCS: 'off',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
// One-time move of files saved inside the app folder by earlier versions.
for (const [old, dest] of [['uploads', process.env.UPLOAD_DIR], ['uploads-private', process.env.PRIVATE_UPLOAD_DIR]]) {
  try {
    const from = path.join(__dirname, old);
    if (fs.existsSync(from) && path.resolve(from) !== path.resolve(dest)) {
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(from, dest, { recursive: true, force: false, errorOnExist: false });
    }
  } catch (err) {
    console.error('Could not move old uploads from ' + old + ':', err.message);
  }
}
// A local .env file is optional; hPanel environment variables are preferred.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file */
}
import('./server.mjs').catch((err) => {
  console.error('RapidFix failed to start:', err);
  process.exit(1);
});
`,
);

writeFileSync(
  path.join(out, 'README-DEPLOY.txt'),
  `RapidFix — Hostinger Node.js app
================================
Build command:  (none needed — or: npm run build)
Start command:  npm start
Entry file:     start.js
Node version:   22 or newer

Set these environment variables in hPanel (values are in rapidfix-production.env on the laptop):
  DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, DATA_ENCRYPTION_KEY,
  OTP_PROVIDER=firebase, FIREBASE_PROJECT_ID, CORS_ORIGINS, WEB_APP_URL

The website is in ./public. Firebase and API settings for the browser: ./public/config.js
Health check: https://<your-domain>/api/v1/health
`,
);

rmSync(zip, { force: true });
zipDir(zip, out);
console.log(`✔ ${zip}`);
if (!existsSync(zip)) process.exit(1);

// API-only variant (e.g. api.rapidfix.in, with the website hosted separately): no public/, website serving off.
const apiOut = path.join(root, 'build', 'hostinger-api');
const apiZip = process.env.OUT_API_ZIP ?? path.join(homedir(), 'Desktop', 'rapidfix-backend.zip');
rmSync(apiOut, { recursive: true, force: true });
cpSync(out, apiOut, { recursive: true, filter: (src) => !src.startsWith(path.join(out, 'public')) });
writeFileSync(path.join(apiOut, 'start.js'), readFileSync(path.join(out, 'start.js'), 'utf8').replace("SERVE_WEB: 'on',", "SERVE_WEB: 'off',"));
writeFileSync(
  path.join(apiOut, 'README-DEPLOY.txt'),
  readFileSync(path.join(out, 'README-DEPLOY.txt'), 'utf8').replace(
    'The website is in ./public.',
    'API only — the website is deployed separately; its config.js apiUrl must point here (https://api.<domain>/api/v1).\nCORS_ORIGINS must list the website address(es).',
  ),
);
rmSync(apiZip, { force: true });
zipDir(apiZip, apiOut);
console.log(`✔ ${apiZip}`);

// ─── Frontend-only Node app (Express static server) for a separate website app ───────────────
// Hostinger's Node.js hosting only accepts framework projects, so the built website ships with
// a tiny Express server. Its config.js points the browser at the separate API.
const webOut = path.join(root, 'build', 'hostinger-frontend');
const webZip = process.env.OUT_WEB_ZIP ?? path.join(homedir(), 'Desktop', 'rapidfix-frontend.zip');
const apiUrl = process.env.FRONTEND_API_URL ?? 'https://api.rapidfix.in/api/v1';
rmSync(webOut, { recursive: true, force: true });
mkdirSync(webOut, { recursive: true });
cpSync(path.join(root, 'apps/web/dist'), path.join(webOut, 'public'), { recursive: true });
rmSync(path.join(webOut, 'public', '.htaccess'), { force: true });
// Hostinger's CDN (hcdn) replaces any Content-Security-Policy *header* with its own one-liner,
// so the policy is also delivered as a <meta> tag inside the page, which the CDN leaves alone.
// (frame-ancestors can't be set by meta; X-Frame-Options: DENY from server.js covers that.)
const META_CSP = [
  "default-src 'self'",
  "script-src 'self' https://checkout.razorpay.com https://www.google.com https://www.gstatic.com https://apis.google.com https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss:" + (process.env.CSP_CONNECT_EXTRA ? ' ' + process.env.CSP_CONNECT_EXTRA : ''),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(process.env.CSP_CONNECT_EXTRA ? [] : ['upgrade-insecure-requests']),
].join('; ');
const htmlPath = path.join(webOut, 'public', 'index.html');
writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${META_CSP}" />`));
const cfgPath = path.join(webOut, 'public', 'config.js');
writeFileSync(cfgPath, readFileSync(cfgPath, 'utf8').replace("  apiUrl: '',", `  apiUrl: '${apiUrl}',`));
const webDeps = Object.fromEntries(['express', 'compression'].map((d) => [d, backendPkg.dependencies[d]]));
writeFileSync(
  path.join(webOut, 'package.json'),
  JSON.stringify(
    {
      name: 'rapidfix-frontend',
      version: '1.0.0',
      private: true,
      description: 'RapidFix website (static build served by Express).',
      main: 'server.js',
      engines: { node: '>=22' },
      scripts: { start: 'node server.js', build: 'echo "Already built — nothing to do"' },
      dependencies: webDeps,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  path.join(webOut, 'server.js'),
  `// RapidFix website server: serves the built app in ./public (Hostinger runs: npm start).
const path = require('node:path');
const express = require('express');
const compression = require('compression');

const app = express();
const dir = path.join(__dirname, 'public');

// Content-Security-Policy: only our own code, Firebase sign-in/reCAPTCHA, Razorpay, Google Fonts/Maps.
// CSP_CONNECT_EXTRA adds API origins for local testing (e.g. http://localhost:4000); not needed live.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://checkout.razorpay.com https://www.google.com https://www.gstatic.com https://apis.google.com https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss: " + (process.env.CSP_CONNECT_EXTRA || ''),
  "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Live site is HTTPS-only; skipped for plain-http local testing.
  process.env.CSP_CONNECT_EXTRA ? '' : 'upgrade-insecure-requests',
]
  .filter(Boolean)
  .join('; ');
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use((req, res, next) => {
  // Always HTTPS (phones need it for location, notifications and app install).
  if (req.get('x-forwarded-proto') === 'http') return res.redirect(301, 'https://' + req.get('host') + req.originalUrl);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'DENY');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.set('Content-Security-Policy', CSP);
  next();
});
// Android app link verification (Play Store app). Extra fingerprints: ANDROID_SHA256="AA:BB:…,CC:DD:…".
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const fingerprints = [...new Set(['${ANDROID_UPLOAD_SHA256}', ...(process.env.ANDROID_SHA256 || '').split(',')].map((f) => f.trim().toUpperCase()).filter(Boolean))];
  res.set('Cache-Control', 'public, max-age=300');
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || '${ANDROID_PACKAGE}', sha256_cert_fingerprints: fingerprints },
    },
  ]);
});
// Hashed build files never change; the app shell, settings and service worker are always revalidated.
app.use('/assets', express.static(path.join(dir, 'assets'), { immutable: true, maxAge: '365d', index: false }));
app.use(
  express.static(dir, {
    index: false,
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /(\\.html|sw\\.js|config\\.js|\\.webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=86400');
    },
  }),
);
// Every app address (/bookings/123, /admin, …) loads the app.
app.get(/.*/, (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dir, 'index.html'));
});

const port = process.env.PORT || 3000; // a number, or a socket path from the host
app.listen(/^\\d+$/.test(String(port)) ? Number(port) : port, () => console.log('RapidFix website listening on ' + port));
`,
);
// Hosts that remember an older "Entry file: start.js" setting still start the website.
writeFileSync(path.join(webOut, 'start.js'), "// Alias entry point — the website server is server.js.\nrequire('./server.js');\n");
writeFileSync(
  path.join(webOut, 'README-DEPLOY.txt'),
  `RapidFix website (frontend) — Hostinger Node.js app on rapidfix.in
Framework: Express · Entry: server.js (start.js also works) · Start: npm start · Node 22
No environment variables needed.
Android app: after the first Play upload, add env var ANDROID_SHA256 = Play Console → App integrity → App signing key SHA-256
(check https://rapidfix.in/.well-known/assetlinks.json shows it).
The API address and Firebase settings are in public/config.js (apiUrl = ${apiUrl}).
The backend (rapidfix-backend.zip) must run at that address with CORS_ORIGINS=https://rapidfix.in,https://www.rapidfix.in
`,
);
rmSync(webZip, { force: true });
zipDir(webZip, webOut);
console.log(`✔ ${webZip}`);
