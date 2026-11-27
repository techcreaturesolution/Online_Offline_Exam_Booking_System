import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requestedTenantSlug, requireAuth, signToken } from '../middleware/auth.js';
import { Tenant } from '../models/Tenant.js';
import { audit } from '../services/audit.js';
import { asPlatform, withTenant } from '../tenancy/context.js';
import { Organization } from '../models/Organization.js';
import { ROLES } from '../models/roles.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.nodeEnv === 'test' ? 1000 : 30, standardHeaders: true, legacyHeaders: false });

export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(100);

async function profile(userId) {
  return User.findById(userId).populate('organization', 'name kind type code').populate('centers', 'name code city modes').lean();
}

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;
// Failed attempts are tracked per email + client IP, so a stranger cannot lock a user out everywhere.
const failures = new Map();
const failKey = (email, ip) => `${email}|${ip}`;
function isLocked(key) {
  const f = failures.get(key);
  if (f?.lockedUntil && f.lockedUntil > Date.now()) return true;
  if (f?.lockedUntil) failures.delete(key);
  return false;
}
function recordFailure(key) {
  const f = failures.get(key) || { count: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILED) Object.assign(f, { count: 0, lockedUntil: Date.now() + LOCK_MS });
  failures.set(key, f);
  if (failures.size > 50000) failures.delete(failures.keys().next().value);
}

router.post('/login', limiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const key = failKey(email.toLowerCase(), req.ip);
  if (isLocked(key)) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
  const user = await asPlatform(() => User.findOne({ email: email.toLowerCase() }).select('+passwordHash'));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailure(key);
    throw new HttpError(401, 'Invalid email or password');
  }
  failures.delete(key);
  if (user.status === 'pending') throw new HttpError(403, 'Your account is waiting for Super Admin approval');
  if (user.status !== 'active') throw new HttpError(403, 'Your account is disabled');
  const tenant = user.tenant ? await asPlatform(() => Tenant.findById(user.tenant).lean()) : null;
  if (tenant && ['suspended', 'cancelled'].includes(tenant.status)) throw new HttpError(403, `Your organisation account is ${tenant.status}. Contact support.`);
  const slug = requestedTenantSlug(req);
  if (tenant && slug && slug !== tenant.slug) throw new HttpError(401, 'Invalid email or password');
  user.lastLoginAt = new Date();
  await asPlatform(() => user.save());
  const { passwordHash: _p, ...safe } = await asPlatform(() => profile(user._id));
  res.json({ token: signToken(user), user: safe, tenant: tenant && { _id: tenant._id, name: tenant.name, slug: tenant.slug, status: tenant.status, branding: tenant.branding } });
});

const tenantSignupSchema = z.object({
  organisation: z.object({
    name: z.string().trim().min(3).max(120),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, 'Use 3-40 lowercase letters, numbers or dashes'),
    types: z.array(z.enum(['vendor', 'institute', 'agency'])).min(1),
  }),
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().max(20).optional().default(''),
  password: z.string().min(8).max(100),
});

router.post('/signup-tenant', limiter, async (req, res) => {
  if (!env.allowTenantSignup) throw new HttpError(403, 'Organisation sign-up is disabled');
  const body = tenantSignupSchema.parse(req.body);
  const result = await asPlatform(async () => {
    if (await Tenant.exists({ slug: body.organisation.slug })) throw new HttpError(409, 'This organisation address is taken');
    if (await User.exists({ email: body.email.toLowerCase() })) throw new HttpError(409, 'An account with this email already exists');
    return Tenant.create({ ...body.organisation, contactEmail: body.email, status: 'trial', plan: 'trial', trialEndsAt: new Date(Date.now() + env.trialDays * 86400000) });
  });
  let user;
  try {
    user = await withTenant(result._id, async () => User.create({ name: body.name, email: body.email, phone: body.phone, passwordHash: await bcrypt.hash(body.password, 10), role: ROLES.SUPER_ADMIN }));
  } catch (err) {
    await asPlatform(() => Tenant.deleteOne({ _id: result._id }));
    if (err?.code === 11000) throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
  await audit({ user, ip: req.ip }, 'tenant.signup', 'Tenant', result._id, null, { name: result.name, slug: result.slug, types: result.types }, { tenant: result._id });
  const host = env.tenantBaseDomain ? `${result.slug}.${env.tenantBaseDomain}` : null;
  res.status(201).json({ token: signToken(user), host, tenant: { _id: result._id, name: result.name, slug: result.slug, status: result.status, trialEndsAt: result.trialEndsAt } });
});

const signupSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().max(20).optional().default(''),
  password: passwordSchema,
  institute: z.object({
    name: z.string().trim().min(3),
    type: z.enum(['university', 'institute', 'college', 'board', 'recruiter', 'company', 'other']).default('institute'),
    city: z.string().trim().min(2),
    state: z.string().trim().min(2),
  }),
});

router.post('/register-institute', limiter, async (req, res) => {
  if (!env.allowInstituteSignup) throw new HttpError(403, 'Self sign-up is disabled. Contact the Super Admin.');
  const body = signupSchema.parse(req.body);
  const slug = requestedTenantSlug(req) || env.defaultTenantSlug;
  const tenant = await asPlatform(() => Tenant.findOne({ slug, status: { $in: ['trial', 'active'] } }).lean());
  if (!tenant) throw new HttpError(404, 'Organisation not found');
  if (await asPlatform(() => User.exists({ email: body.email.toLowerCase() }))) throw new HttpError(409, 'An account with this email already exists');
  await withTenant(tenant._id, async () => {
  const org = await Organization.create({ kind: 'institute', ...body.institute, email: body.email, phone: body.phone, active: false });
  await User.create({
    name: body.name,
    email: body.email,
    phone: body.phone,
    passwordHash: await bcrypt.hash(body.password, 10),
    role: ROLES.INSTITUTE,
    organization: org._id,
    status: 'pending',
  });
  });
  res.status(201).json({ ok: true, message: 'Registration received. The Super Admin will approve your institute shortly.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const { passwordHash: _p, ...safe } = await profile(req.user._id);
  const t = req.tenant;
  res.json({ user: safe, tenant: t && { _id: t._id, name: t.name, slug: t.slug, status: t.status, plan: t.plan, trialEndsAt: t.trialEndsAt, branding: t.branding }, impersonatedBy: req.impersonatedBy });
});

router.put('/me/password', requireAuth, async (req, res) => {
  if (req.impersonatedBy) throw new HttpError(403, 'Support sessions cannot change passwords');
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  await user.save();
  await audit(req, 'user.password_changed', 'User', user._id);
  res.json({ ok: true, token: signToken(user) });
});

export default router;
