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
const defaults = {
  NODE_ENV: 'production',
  SERVE_WEB: 'on',
  WEB_DIST_DIR: 'public',
  UPLOAD_DIR: 'uploads',
  PRIVATE_UPLOAD_DIR: 'uploads-private',
  API_DOCS: 'off',
};
for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
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
execSync(`zip -qr "${zip}" . -x '*.DS_Store'`, { cwd: out, stdio: 'inherit' });
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
execSync(`zip -qr "${apiZip}" . -x '*.DS_Store'`, { cwd: apiOut, stdio: 'inherit' });
console.log(`✔ ${apiZip}`);
