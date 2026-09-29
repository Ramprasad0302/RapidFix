import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { customerRouter } from './customer.routes';
import { healthRouter } from './health.routes';
import { technicianRouter } from './technician.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/customer', customerRouter);
apiRouter.use('/technician', technicianRouter);
apiRouter.use('/admin', adminRouter);
