import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authOf } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as chat from '../services/chat.service';
import { invoice } from '../services/work.service';
import { ok } from '../utils/response';

/** Booking resources shared by the customer, the assigned technician and staff (access checked per booking). */
export const bookingsRouter = Router();
bookingsRouter.use(authenticate());

bookingsRouter.get('/:id/chat', async (req, res) => {
  ok(res, await chat.chatInfo(String(req.params.id), authOf(req)));
});

bookingsRouter.get('/:id/messages', validate(z.object({ before: z.iso.datetime().optional() }), 'query'), async (req, res) => {
  ok(res, await chat.listMessages(String(req.params.id), authOf(req), (res.locals.query as { before?: string }).before));
});

bookingsRouter.post(
  '/:id/messages',
  validate(z.object({ body: z.string().trim().max(1000).optional(), imageUrl: z.string().max(200).optional() })),
  async (req, res) => {
    ok(res, await chat.sendMessage(String(req.params.id), authOf(req), req.body), 201);
  },
);

bookingsRouter.post('/:id/messages/read', async (req, res) => {
  ok(res, { read: await chat.markRead(String(req.params.id), authOf(req)) });
});

bookingsRouter.get('/:id/invoice', async (req, res) => {
  ok(res, await invoice(String(req.params.id), authOf(req)));
});
