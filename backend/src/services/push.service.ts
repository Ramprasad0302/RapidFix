import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';

/**
 * Push delivery (Firebase Cloud Messaging HTTP v1). With PUSH_PROVIDER=none the
 * in-app list + Socket.IO are the only channels. Tokens are registered by the
 * apps via POST /notifications/tokens.
 */

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

let cachedToken: { value: string; exp: number } | null = null;

async function fcmAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: env.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    { algorithm: 'RS256' },
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`FCM auth failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export const pushEnabled = () =>
  env.PUSH_PROVIDER === 'fcm' && !!env.FIREBASE_PROJECT_ID && !!env.FIREBASE_CLIENT_EMAIL && !!env.FIREBASE_PRIVATE_KEY;

/** Sends to every registered device of the user; unregisters tokens FCM reports as dead. */
export async function pushToUser(userId: string, msg: PushMessage): Promise<void> {
  if (!pushEnabled()) return;
  const tokens = await prisma.notificationToken.findMany({ where: { userId }, select: { id: true, token: true } });
  if (!tokens.length) return;
  const access = await fcmAccessToken();
  await Promise.all(
    tokens.map(async (t) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title: msg.title, body: msg.body },
            data: msg.data ?? {},
            // Deliver immediately (job offers expire) and open the right screen on tap.
            webpush: {
              headers: { Urgency: 'high', TTL: '3600' },
              ...(msg.data?.url && { fcm_options: { link: new URL(msg.data.url, env.WEB_APP_URL).toString() } }),
            },
            android: { priority: 'high' },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 400) {
        await prisma.notificationToken.delete({ where: { id: t.id } }).catch(() => undefined);
      } else if (!res.ok) {
        logger.warn({ status: res.status }, 'FCM send failed');
      }
    }),
  );
}
