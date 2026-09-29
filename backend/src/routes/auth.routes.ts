import { Router } from 'express';
import { Role } from '@fixora/shared-types';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { adminLoginLimiter, otpSendLimiter, otpVerifyLimiter, refreshLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { adminLoginSchema, audienceSchema, sendOtpSchema, verifyOtpSchema } from '../validators/auth.validators';

export const authRouter = Router();

authRouter.post('/customer/send-otp', otpSendLimiter, validate(sendOtpSchema), auth.sendOtpFor(Role.CUSTOMER));
authRouter.post('/customer/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), auth.verifyOtpFor(Role.CUSTOMER));

authRouter.post('/technician/send-otp', otpSendLimiter, validate(sendOtpSchema), auth.sendOtpFor(Role.TECHNICIAN));
authRouter.post('/technician/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), auth.verifyOtpFor(Role.TECHNICIAN));

authRouter.post('/admin/login', adminLoginLimiter, validate(adminLoginSchema), auth.adminLogin);

authRouter.post('/refresh', refreshLimiter, validate(audienceSchema), auth.refresh);
authRouter.post('/logout', validate(audienceSchema), auth.logout);
authRouter.get('/me', authenticate(), auth.me);
