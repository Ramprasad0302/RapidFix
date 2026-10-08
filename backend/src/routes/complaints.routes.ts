import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authOf } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { myComplaints, raiseComplaint } from '../services/work.service';
import { ok } from '../utils/response';

/** Customers and technicians raise complaints (optionally about one of their bookings). */
export const complaintsRouter = Router();
complaintsRouter.use(authenticate());

complaintsRouter.post(
  '/',
  validate(
    z.object({
      bookingId: z.uuid().optional(),
      category: z.enum(['Service quality', 'Technician behaviour', 'Pricing / billing', 'Payment', 'Delay / no-show', 'App issue', 'Chat message', 'Other']),
      subject: z.string().trim().min(4).max(160),
      description: z.string().trim().min(10).max(2000),
    }),
  ),
  async (req, res) => {
    ok(res, await raiseComplaint(authOf(req), req.body), 201);
  },
);

complaintsRouter.get('/mine', async (req, res) => {
  ok(res, await myComplaints(authOf(req).userId));
});
