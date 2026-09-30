import { Router } from 'express';
import { z } from 'zod';
import { adminLoginSchema, sendOtpSchema, verifyOtpSchema } from '@fixora/shared-utils';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { adminLoginLimiter, otpSendLimiter, otpVerifyLimiter, refreshLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';

/** One login for customers, technicians and staff; the returned role decides where the app goes. */
export const authRouter = Router();

authRouter.post('/send-otp', otpSendLimiter, validate(sendOtpSchema), auth.sendOtp);
authRouter.post('/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), auth.verifyOtp);
authRouter.post('/firebase', otpVerifyLimiter, validate(z.object({ idToken: z.string().min(100).max(4096) })), auth.firebaseLogin);
authRouter.post('/login', adminLoginLimiter, validate(adminLoginSchema), auth.passwordLogin);

authRouter.post('/refresh', refreshLimiter, auth.refresh);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', authenticate(), auth.me);
// Google Play / privacy: users can delete their own account. The body must say DELETE, so it's never accidental.
authRouter.delete('/account', authenticate(), otpVerifyLimiter, validate(z.object({ confirm: z.literal('DELETE') })), auth.deleteAccount);
