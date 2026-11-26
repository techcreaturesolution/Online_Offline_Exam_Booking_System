import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, signToken } from '../middleware/auth.js';
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

router.post('/login', limiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Invalid email or password');
  if (user.status === 'pending') throw new HttpError(403, 'Your account is waiting for Super Admin approval');
  if (user.status !== 'active') throw new HttpError(403, 'Your account is disabled');
  user.lastLoginAt = new Date();
  await user.save();
  const { passwordHash: _p, ...safe } = await profile(user._id);
  res.json({ token: signToken(user), user: safe });
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
  if (await User.exists({ email: body.email.toLowerCase() })) throw new HttpError(409, 'An account with this email already exists');
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
  res.status(201).json({ ok: true, message: 'Registration received. The Super Admin will approve your institute shortly.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const { passwordHash: _p, ...safe } = await profile(req.user._id);
  res.json({ user: safe });
});

router.put('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordChangedAt = new Date();
  await user.save();
  res.json({ ok: true, token: signToken(user) });
});

export default router;
