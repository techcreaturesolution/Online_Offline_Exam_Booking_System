import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { requireAuth, requireRoles } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/error.js';
import { ROLES } from './models/roles.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import bookingRoutes from './routes/bookings.js';
import centerRoutes from './routes/centers.js';
import metaRoutes from './routes/meta.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '3mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/meta', requireAuth, metaRoutes);
  app.use('/api/admin', requireAuth, requireRoles(ROLES.SUPER_ADMIN), adminRoutes);
  app.use('/api/bookings', requireAuth, bookingRoutes);
  app.use('/api/reports', requireAuth, reportRoutes);
  app.use('/api/notifications', requireAuth, notificationRoutes);
  app.use('/api', requireAuth, centerRoutes);
  app.use('/api', notFound);

  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.nodeEnv === 'production') {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
