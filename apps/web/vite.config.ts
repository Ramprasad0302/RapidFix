import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Offline app shell: after the build, write the list of every built file (and a
 * build id) into dist/sw.js so the service worker can save them all on the
 * device at install — the app then opens without internet.
 */
function offlineShell(): Plugin {
  let outDir = 'dist';
  return {
    name: 'rapidfix-offline-shell',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (d: string) => {
        for (const name of readdirSync(d)) {
          const full = join(d, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push('/' + relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      // Skipped: source maps, hidden files, the social-share image, store-size icons and
      // the admin-only charts bundle (fetched and cached on first use instead).
      const skip = /\.(map|txt)$|\/\.|og-image|maskable-|apple-touch|icon-512|charts-/;
      const precache = files.filter((f) => !skip.test(f) && !['/sw.js', '/index.html', '/offline.html'].includes(f)).sort();
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("const BUILD = 'dev';", `const BUILD = '${Date.now().toString(36)}';`)
        .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(precache)};`);
      writeFileSync(swPath, sw);
    },
  };
}

// The browser talks only to this origin; the dev server forwards API, socket and
// upload traffic to the API (same layout as the nginx config in production).
// That lets a phone on the same Wi-Fi use http://<this-computer>:5173 directly.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
const proxy = {
  '/api': { target: API_TARGET, changeOrigin: false },
  '/uploads': { target: API_TARGET, changeOrigin: false },
  '/socket.io': { target: API_TARGET, ws: true, changeOrigin: false },
};

// `npm run dev:phone` → HTTPS (self-signed), required by phones for location and notifications.
const https = process.env.HTTPS === '1';

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineShell(), ...(https ? [basicSsl({ name: 'rapidfix-dev' })] : [])],
  // Listen on the local network too, so a phone on the same Wi-Fi can open it.
  server: { port: 5173, strictPort: true, host: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
});
