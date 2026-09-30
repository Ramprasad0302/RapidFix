import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { docsEnabled, docsRouter } from './docs/docs.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { limiterBase } from './middleware/rateLimit';
import { apiRouter } from './routes';
import { handleRazorpayWebhook } from './services/payment.service';
import { UPLOAD_DIR } from './services/storage.service';
import { ok } from './utils/response';
import { mountWebApp, shouldServeWeb, WEB_CSP } from './webApp';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const serveWeb = shouldServeWeb();
  app.use(
    helmet({
      // The API's JSON needs no CSP; the served web app gets rules for its map, font, payment and Firebase providers.
      contentSecurityPolicy: serveWeb ? { directives: WEB_CSP } : undefined,
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(compression());

  // Razorpay webhook needs the exact raw bytes for its signature — mounted before the JSON parser.
  app.post(`${env.API_PREFIX}/payments/razorpay/webhook`, express.raw({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
    try {
      ok(res, await handleRazorpayWebhook(req.body as Buffer, req.get('x-razorpay-signature')));
    } catch (err) {
      next(err);
    }
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
      // Method, path and status only — never headers, cookies or bodies.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Coarse global limit; stricter limits are applied to OTP/login routes.
  app.use(
    env.API_PREFIX,
    rateLimit({ ...limiterBase, windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );

  app.use(env.API_PREFIX, apiRouter);
  if (docsEnabled()) app.use('/api/docs', docsRouter);

  // User uploads (booking photos, avatars). Filenames are random UUIDs, so they can be cached forever.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      res.set('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny' }),
  );

  if (serveWeb) mountWebApp(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
