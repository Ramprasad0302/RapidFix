import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '../src/docs/openapi';
import { request } from './helpers';

const ROUTES_DIR = path.resolve(import.meta.dirname, '../src/routes');

/** Every `router.get('/path'…)` in src/routes, with its mount prefix from routes/index.ts. */
function implementedRoutes() {
  const index = readFileSync(path.join(ROUTES_DIR, 'index.ts'), 'utf8');
  const mounts = new Map<string, string>();
  for (const [, prefix, router] of index.matchAll(/apiRouter\.use\('([^']+)', (\w+)\)/g)) mounts.set(router!, prefix === '/' ? '' : prefix!);
  // Admin modules are mounted inside the admin router.
  mounts.set('adminModulesRouter', '/admin');

  const found = new Set<string>();
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts'))) {
    const src = readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    const routerName = src.match(/export const (\w+Router) = Router\(\)/)?.[1];
    if (!routerName) continue;
    const prefix = mounts.get(routerName) ?? '';
    for (const [, method, p] of src.matchAll(/\b\w+\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      if (!p!.startsWith('/')) continue; // e.g. req.get('user-agent')
      const full = `${prefix}${p === '/' ? '' : p}`
        .replace(/\{\*rest\}/, '{path}')
        .replace(/:(\w+)/g, '{$1}');
      found.add(`${method} ${full || '/'}`);
    }
    // Technician job actions are registered in a loop.
    if (file === 'technician.routes.ts') {
      const actions = src.match(/const ACTIONS[^{]*\{([^}]*)\}/)?.[1] ?? '';
      for (const [, a] of actions.matchAll(/^\s*'?([\w-]+)'?:/gm)) found.add(`post /technician/jobs/{id}/${a}`);
    }
  }
  found.delete('post /technician/jobs/{id}/${path}');
  // Mounted directly in app.ts (raw body).
  found.add('post /payments/razorpay/webhook');
  return found;
}

describe('OpenAPI', () => {
  it('documents every implemented route, and nothing that does not exist', () => {
    const documented = new Set(ROUTES.map((r) => `${r.method} ${r.path}`));
    const implemented = implementedRoutes();
    expect([...implemented].filter((r) => !documented.has(r)).sort()).toEqual([]);
    expect([...documented].filter((r) => !implemented.has(r)).sort()).toEqual([]);
  });

  it('serves the spec and Swagger UI outside production', async () => {
    const spec = await request().get('/api/docs/openapi.json').expect(200);
    expect(spec.body.openapi).toBe('3.1.0');
    expect(Object.keys(spec.body.paths).length).toBeGreaterThan(100);
    expect(spec.body.paths['/auth/send-otp'].post.requestBody.content['application/json'].schema.properties.phone).toBeDefined();
    const ui = await request().get('/api/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui-bundle.js');
    await request().get('/api/docs/assets/swagger-ui-bundle.js').expect(200);
  });
});
