import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
  plugins: [react(), tailwindcss(), ...(https ? [basicSsl({ name: 'rapidfix-dev' })] : [])],
  // Listen on the local network too, so a phone on the same Wi-Fi can open it.
  server: { port: 5173, strictPort: true, host: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
});
