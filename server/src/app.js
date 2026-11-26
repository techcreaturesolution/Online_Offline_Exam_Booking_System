import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
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
import platformRoutes from './routes/platform.js';
import tenantRoutes from './routes/tenant.js';
import rateLimit from 'express-rate-limit';
import reportRoutes from './routes/reports.js';

const openapiText = fs.readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8');
const openapiDoc = YAML.parse(openapiText);

export function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '3mb' }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  const api = express.Router();
  api.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: env.nodeEnv === 'test' ? 100000 : 3000, standardHeaders: true, legacyHeaders: false }));
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.get('/health/ready', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ ok: ready, mongo: ready ? 'connected' : 'unavailable' });
  });
  api.get('/openapi.yaml', (_req, res) => res.type('text/yaml').send(openapiText));
  api.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
  api.use('/auth', authRoutes);
  api.use('/platform', requireAuth, requireRoles(ROLES.PLATFORM_OWNER), platformRoutes);
  api.use('/tenant', requireAuth, requireRoles(ROLES.SUPER_ADMIN), tenantRoutes);
  api.use('/meta', requireAuth, metaRoutes);
  api.use('/admin', requireAuth, requireRoles(ROLES.SUPER_ADMIN), adminRoutes);
  api.use('/bookings', requireAuth, bookingRoutes);
  api.use('/reports', requireAuth, reportRoutes);
  api.use('/notifications', requireAuth, notificationRoutes);
  api.use('/', requireAuth, centerRoutes);
  api.use(notFound);
  app.use('/api/v1', api);
  app.use('/api', api);

  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (env.nodeEnv === 'production') {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
