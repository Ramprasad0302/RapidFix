import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // One file: the deploy zip ships only server.js (on-demand imports must not become separate chunks).
  splitting: false,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so bundle them in.
  noExternal: [/^@fixora\//],
});
