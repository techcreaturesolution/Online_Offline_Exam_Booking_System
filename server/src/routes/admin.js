import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { Center } from '../models/Center.js';
import { Organization } from '../models/Organization.js';
import { TENANT_ROLES, ROLES } from '../models/roles.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../utils/httpError.js';
import { passwordSchema } from './auth.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const ORG_KIND_BY_ROLE = { [ROLES.INSTITUTE]: 'institute', [ROLES.VENDOR]: 'vendor', [ROLES.AGENCY]: 'agency' };
const CENTER_ROLES = [ROLES.NETWORK, ROLES.CENTER];

async function checkLinks(role, organization, centers) {
  const kind = ORG_KIND_BY_ROLE[role];
  if (kind) {
    if (!organization) throw new HttpError(400, `Select the ${kind} this user belongs to`);
    const org = await Organization.findById(organization).lean();
    if (!org || org.kind !== kind) throw new HttpError(400, `Organization must be a ${kind}`);
  }
  if (CENTER_ROLES.includes(role)) {
    if (!centers?.length) throw new HttpError(400, 'Select at least one center for this user');
    if ((await Center.countDocuments({ _id: { $in: centers } })) !== centers.length) throw new HttpError(400, 'Unknown center');
  }
  return { organization: kind ? organization : null, centers: CENTER_ROLES.includes(role) ? centers : [] };
}

const userSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().max(20).optional().default(''),
  role: z.enum(TENANT_ROLES),
  organization: objectId.nullable().optional(),
  centers: z.array(objectId).optional().default([]),
  password: passwordSchema,
});

router.get('/users', async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = String(req.query.role);
  if (req.query.status) filter.status = String(req.query.status);
  if (req.query.q) filter.$or = [{ name: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  const users = await User.find(filter).populate('organization', 'name kind').populate('centers', 'name code').sort({ createdAt: -1 }).limit(500).lean();
  res.json({ users });
});

const noSupportCredentials = (req) => {
  if (req.impersonatedBy) throw new HttpError(403, 'Support sessions cannot create accounts, set passwords or change roles');
};

router.post('/users', async (req, res) => {
  noSupportCredentials(req);
  const body = userSchema.parse(req.body);
  if (await User.exists({ email: body.email.toLowerCase() })) throw new HttpError(409, 'Email already in use');
  const links = await checkLinks(body.role, body.organization, body.centers);
  const user = await User.create({ ...body, ...links, passwordHash: await bcrypt.hash(body.password, 10), status: 'active' });
  res.status(201).json({ user: user.toSafe() });
});

router.put('/users/:id', async (req, res) => {
  const body = userSchema.partial().extend({ status: z.enum(['pending', 'active', 'disabled']).optional() }).parse(req.body);
  if (body.password || body.role) noSupportCredentials(req);
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (String(user._id) === String(req.user._id) && (body.status === 'disabled' || (body.role && body.role !== user.role))) {
    throw new HttpError(400, 'You cannot disable yourself or change your own role');
  }
  const role = body.role || user.role;
  const before = { role: user.role, status: user.status, organization: user.organization, centers: user.centers };
  const links = await checkLinks(role, body.organization !== undefined ? body.organization : user.organization, body.centers || user.centers.map(String));
  if (body.password) {
    user.passwordHash = await bcrypt.hash(body.password, 10);
    user.passwordChangedAt = new Date();
  }
  for (const k of ['name', 'email', 'phone', 'role', 'status']) if (body[k] !== undefined) user[k] = body[k];
  Object.assign(user, links);
  await user.save();
  await audit(req, 'user.updated', 'User', user._id, before, { role: user.role, status: user.status, organization: user.organization, centers: user.centers });
  if (user.status === 'active' && user.organization) await Organization.updateOne({ _id: user.organization, active: false }, { active: true });
  res.json({ user: user.toSafe() });
});

const orgSchema = z.object({
  kind: z.enum(['institute', 'vendor', 'agency']),
  name: z.string().trim().min(2),
  type: z.enum(['university', 'institute', 'college', 'board', 'recruiter', 'company', 'other']).optional(),
  code: z.string().trim().max(20).optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  email: z.string().email().or(z.literal('')).optional(),
  phone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

router.get('/organizations', async (req, res) => {
  const filter = req.query.kind ? { kind: String(req.query.kind) } : {};
  res.json({ organizations: await Organization.find(filter).sort({ name: 1 }).lean() });
});

router.post('/organizations', async (req, res) => {
  const body = orgSchema.parse(req.body);
  if (!body.code) delete body.code;
  res.status(201).json({ organization: await Organization.create(body) });
});

router.put('/organizations/:id', async (req, res) => {
  const body = orgSchema.partial().omit({ kind: true }).parse(req.body);
  const org = await Organization.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!org) throw new HttpError(404, 'Organization not found');
  res.json({ organization: org });
});

export default router;
