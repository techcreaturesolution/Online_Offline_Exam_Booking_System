import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { ROLES } from '../models/roles.js';
import { auditWrites } from '../services/audit.js';
import { asPlatform, withTenant } from '../tenancy/context.js';
import { HttpError } from '../utils/httpError.js';

const passwordVersion = (user) => user.passwordChangedAt?.getTime() || 0;

export function signToken(user, { impersonatedBy = null, expiresIn = env.jwtExpiresIn } = {}) {
  const claims = { sub: String(user._id), role: user.role, tid: user.tenant ? String(user.tenant) : null, pwv: passwordVersion(user) };
  if (impersonatedBy) claims.imp = String(impersonatedBy);
  return jwt.sign(claims, env.jwtSecret, { expiresIn });
}

/** Tenant slug requested by subdomain (acme.examhub.app) or X-Tenant header, if any. */
export function requestedTenantSlug(req) {
  const header = req.headers['x-tenant'];
  if (header) return String(header).toLowerCase();
  const host = (req.hostname || '').toLowerCase();
  if (env.tenantBaseDomain && host.endsWith(`.${env.tenantBaseDomain}`)) return host.slice(0, -(env.tenantBaseDomain.length + 1)).split('.').pop();
  return null;
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired session');
  }
  const { user, tenant } = await asPlatform(async () => {
    const u = await User.findById(payload.sub);
    return { user: u, tenant: u?.tenant ? await Tenant.findById(u.tenant).lean() : null };
  });
  if (!user || user.status !== 'active') throw new HttpError(401, 'Account not found, pending approval or disabled');
  if ((payload.pwv || 0) !== passwordVersion(user)) throw new HttpError(401, 'Password changed; please sign in again');
  if (user.role !== ROLES.PLATFORM_OWNER) {
    if (!tenant) throw new HttpError(401, 'Account has no organisation');
    if (['suspended', 'cancelled'].includes(tenant.status)) throw new HttpError(403, `Your organisation account is ${tenant.status}. Contact support.`);
    const slug = requestedTenantSlug(req);
    if (slug && slug !== tenant.slug) throw new HttpError(401, 'This account belongs to a different organisation');
  }
  req.user = user;
  req.tenant = tenant;
  req.impersonatedBy = payload.imp || null;
  if (user.role === ROLES.PLATFORM_OWNER) {
    if (!/\/(platform|auth)(\/|$)/.test(req.baseUrl)) throw new HttpError(403, 'Platform owners use the platform console');
    return asPlatform(() => auditWrites(req, _res, next));
  }
  return withTenant(tenant._id, () => auditWrites(req, _res, next));
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.role)) throw new HttpError(403, 'You do not have access to this action');
    next();
  };
}
