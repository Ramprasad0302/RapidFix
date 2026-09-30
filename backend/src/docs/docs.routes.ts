import { createRequire } from 'node:module';
import path from 'node:path';
import express, { Router } from 'express';
import { env } from '../config/env';
import { buildOpenApi } from './openapi';

const require = createRequire(import.meta.url);
const SWAGGER_DIR = path.dirname(require.resolve('swagger-ui-dist/package.json'));

export const docsEnabled = () => env.API_DOCS === 'on' || (env.API_DOCS === 'auto' && env.NODE_ENV !== 'production');

/** Self-hosted Swagger UI (no CDN, works under the default CSP) + the JSON spec. */
export const docsRouter = Router();

docsRouter.get('/openapi.json', (req, res) => {
  res.json(buildOpenApi(`${req.protocol}://${req.get('host')}${env.API_PREFIX}`));
});

docsRouter.get('/init.js', (_req, res) => {
  res.type('application/javascript').send(
    `window.onload = () => { window.ui = SwaggerUIBundle({ url: './openapi.json', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: false, tryItOutEnabled: false }); };`,
  );
});

docsRouter.get('/', (req, res) => {
  // Relative asset URLs need the trailing slash.
  if (!req.originalUrl.endsWith('/')) return res.redirect(301, `${req.originalUrl}/`);
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>FIXORA API</title>
<link rel="stylesheet" href="./assets/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="./assets/swagger-ui-bundle.js"></script>
<script src="./init.js"></script>
</body>
</html>`);
});

docsRouter.use('/assets', express.static(SWAGGER_DIR, { index: false, maxAge: '7d' }));
