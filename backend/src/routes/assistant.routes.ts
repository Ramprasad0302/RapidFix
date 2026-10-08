import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { optionalAuthenticate } from '../middleware/auth';
import { limiterBase } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { chat } from '../services/assistant.service';
import { ok } from '../utils/response';

export const assistantRouter = Router();

/** Each message costs an AI call: 40 per 15 minutes per device is plenty for a real conversation. */
const assistantLimiter = rateLimit({
  ...limiterBase,
  windowMs: 15 * 60_000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { success: false, message: 'You have sent a lot of messages. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
});

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(24)
    .refine((m) => m.at(-1)?.role === 'user', 'The last message must be from the customer'),
});

/** Chat with the RapidFix Assistant. Works signed out; signed-in customers can ask about their bookings. */
assistantRouter.post('/chat', assistantLimiter, optionalAuthenticate(), validate(chatSchema), async (req, res) => {
  const { messages } = req.body as z.infer<typeof chatSchema>;
  ok(res, await chat({ messages, userId: req.auth?.userId, role: req.auth?.role }));
});
