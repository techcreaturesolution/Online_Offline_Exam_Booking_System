import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { signToken } from '../middleware/auth.js';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Lab } from '../models/Lab.js';
import { TENANT_STATUSES, Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { ROLES } from '../models/roles.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const objectId = z.string().regex(/^[a-f0-9]{24}$/);

async function usage() {
  const count = (Model) => Model.aggregate([{ $group: { _id: '$tenant', n: { $sum: 1 } } }]);
  const [users, centers, labs, bookings] = await Promise.all([count(User), count(Center), count(Lab), count(Booking)]);
  const map = new Map();
  for (const [key, rows] of Object.entries({ users, centers, labs, bookings })) {
    for (const r of rows) {
      const k = String(r._id);
      map.set(k, { ...(map.get(k) || { users: 0, centers: 0, labs: 0, bookings: 0 }), [key]: r.n });
    }
  }
  return map;
}

router.get('/tenants', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = q ? { $or: [{ name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { slug: q.toLowerCase() }] } : {};
  if (req.query.status) filter.status = String(req.query.status);
  const [tenants, use] = await Promise.all([Tenant.find(filter).sort({ createdAt: -1 }).lean(), usage()]);
  res.json({ tenants: tenants.map((t) => ({ ...t, usage: use.get(String(t._id)) || { users: 0, centers: 0, labs: 0, bookings: 0 } })) });
});

router.patch('/tenants/:id', async (req, res) => {
  objectId.parse(req.params.id);
  const body = z.object({ status: z.enum(TENANT_STATUSES).optional(), plan: z.string().trim().min(2).max(40).optional() }).parse(req.body);
  const tenant = await Tenant.findById(req.params.id);
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  const before = { status: tenant.status, plan: tenant.plan };
  Object.assign(tenant, body);
  if (body.status && body.status !== 'cancelled') tenant.deletionScheduledAt = null;
  await tenant.save();
  await audit(req, 'platform.tenant_updated', 'Tenant', tenant._id, before, body, { tenant: tenant._id });
  res.json({ tenant });
});

/** Time-limited (30 min), audited sign-in as the tenant's first active Super Admin. */
router.post('/tenants/:id/impersonate', async (req, res) => {
  objectId.parse(req.params.id);
  const { reason } = z.object({ reason: z.string().trim().min(5).max(300) }).parse(req.body);
  const tenant = await Tenant.findById(req.params.id).lean();
  if (!tenant) throw new HttpError(404, 'Tenant not found');
  if (['suspended', 'cancelled'].includes(tenant.status)) throw new HttpError(400, `Reactivate this ${tenant.status} tenant before opening a support session`);
  const admin = await User.findOne({ tenant: tenant._id, role: ROLES.SUPER_ADMIN, status: 'active' }).sort({ createdAt: 1 });
  if (!admin) throw new HttpError(400, 'Tenant has no active Super Admin');
  await audit(req, 'platform.impersonation_started', 'User', admin._id, null, { reason, tenant: tenant.slug }, { tenant: tenant._id });
  res.json({ token: signToken(admin, { impersonatedBy: req.user._id, expiresIn: '30m' }), user: { _id: admin._id, name: admin.name, email: admin.email }, expiresInMinutes: 30 });
});

router.get('/stats', async (_req, res) => {
  const rows = await Tenant.aggregate([{ $group: { _id: { status: '$status', plan: '$plan' }, n: { $sum: 1 } } }]);
  res.json({ rows, dbState: mongoose.connection.readyState });
});

export default router;
