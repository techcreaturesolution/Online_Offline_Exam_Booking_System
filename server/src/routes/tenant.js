import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog.js';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Lab } from '../models/Lab.js';
import { LabAllocation } from '../models/LabAllocation.js';
import { Organization } from '../models/Organization.js';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.js';
import { asPlatform } from '../tenancy/context.js';
import { toCsv } from '../utils/csv.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const GRACE_DAYS = 30;

const tenantOf = (req) => asPlatform(() => Tenant.findById(req.user.tenant));

router.get('/', async (req, res) => res.json({ tenant: await tenantOf(req) }));

router.patch('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(3).max(120).optional(),
      contactEmail: z.string().email().optional(),
      branding: z.object({ logoUrl: z.string().url().or(z.literal('')).optional(), primaryColor: z.string().regex(/^(#[0-9a-fA-F]{6})?$/).optional(), emailSenderName: z.string().max(80).optional(), loginText: z.string().max(300).optional() }).optional(),
      settings: z.object({ timezone: z.string().max(60).optional(), currency: z.string().length(3).optional(), taxLabel: z.string().max(20).optional(), dataResidency: z.string().max(20).optional() }).optional(),
    })
    .parse(req.body);
  const tenant = await tenantOf(req);
  const before = { name: tenant.name, contactEmail: tenant.contactEmail, branding: tenant.branding.toObject(), settings: tenant.settings.toObject() };
  if (body.name) tenant.name = body.name;
  if (body.contactEmail) tenant.contactEmail = body.contactEmail;
  if (body.branding) Object.assign(tenant.branding, body.branding);
  if (body.settings) Object.assign(tenant.settings, body.settings);
  await asPlatform(() => tenant.save());
  await audit(req, 'tenant.settings_updated', 'Tenant', tenant._id, before, body);
  res.json({ tenant });
});

/** Full JSON export of this tenant's data (passwords excluded). */
router.get('/export', async (req, res) => {
  const [tenant, users, organizations, centers, labs, bookings, allocations] = await Promise.all([
    tenantOf(req),
    User.find().lean(),
    Organization.find().lean(),
    Center.find().lean(),
    Lab.find().lean(),
    Booking.find().lean(),
    LabAllocation.find().lean(),
  ]);
  await audit(req, 'tenant.exported', 'Tenant', tenant._id);
  res.setHeader('Content-Disposition', `attachment; filename="${tenant.slug}-export.json"`);
  res.json({ exportedAt: new Date(), tenant, users, organizations, centers, labs, bookings, allocations });
});

/** Schedules deletion after a 30-day grace period; the platform owner can restore before then. */
router.post('/delete', async (req, res) => {
  const { confirm } = z.object({ confirm: z.string() }).parse(req.body);
  const tenant = await tenantOf(req);
  if (confirm !== tenant.slug) throw new HttpError(400, `Type the organisation address (${tenant.slug}) to confirm`);
  tenant.status = 'cancelled';
  tenant.deletionScheduledAt = new Date(Date.now() + GRACE_DAYS * 86400000);
  await asPlatform(() => tenant.save());
  await audit(req, 'tenant.deletion_scheduled', 'Tenant', tenant._id, null, { deletionScheduledAt: tenant.deletionScheduledAt });
  res.json({ tenant });
});

function auditFilter(q) {
  const f = {};
  if (q.action) f.action = { $regex: String(q.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (q.entity) f.entity = String(q.entity);
  if (q.actor && /^[a-f0-9]{24}$/.test(q.actor)) f.actor = q.actor;
  if (q.from || q.to) f.createdAt = { ...(q.from ? { $gte: new Date(q.from) } : {}), ...(q.to ? { $lte: new Date(`${q.to}T23:59:59.999Z`) } : {}) };
  return f;
}

router.get('/audit-logs', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const filter = auditFilter(req.query);
  const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  res.json({ items, total, page, limit });
});

router.get('/audit-logs.csv', async (req, res) => {
  const items = await AuditLog.find(auditFilter(req.query)).sort({ createdAt: -1 }).limit(10000).lean();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(toCsv(['When', 'Actor', 'Role', 'Action', 'Entity', 'Entity ID', 'IP', 'Status', 'Impersonated by'], items.map((a) => [a.createdAt.toISOString(), a.actorName, a.role, a.action, a.entity, a.entityId, a.ip, a.status, a.impersonatedBy || ''])));
});

export default router;
