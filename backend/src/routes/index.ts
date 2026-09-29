import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { catalogRouter } from './catalog.routes';
import { customerRouter } from './customer.routes';
import { healthRouter } from './health.routes';
import { notificationRouter } from './notification.routes';
import { technicianRouter } from './technician.routes';
import { uploadRouter } from './upload.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/', catalogRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/customer', customerRouter);
apiRouter.use('/technician', technicianRouter);
apiRouter.use('/admin', adminRouter);
