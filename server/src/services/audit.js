import { AuditLog } from '../models/AuditLog.js';
import { currentTenant, withTenant } from '../tenancy/context.js';

const SECRET = /pass|token|secret/i;
export function redact(value) {
  if (Array.isArray(value)) return value.slice(0, 50).map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '[redacted]' : redact(v)]));
  return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}…` : value;
}

/** Append an immutable audit entry for the current tenant. `ctx` is an Express req or { user, ip }. */
export async function audit(ctx, action, entity = '', entityId = '', before = null, after = null, { status = 0, tenant } = {}) {
  const t = tenant || currentTenant() || ctx.user?.tenant || null;
  const doc = {
    actor: ctx.user?._id || null,
    actorName: ctx.user?.name || '',
    role: ctx.user?.role || '',
    action,
    entity,
    entityId: entityId ? String(entityId) : '',
    ip: ctx.ip || '',
    status,
    before: before && redact(before),
    after: after && redact(after),
    impersonatedBy: ctx.impersonatedBy || null,
    tenant: t,
  };
  return t ? withTenant(t, () => AuditLog.create(doc)) : AuditLog.create(doc);
}

const ENTITY = { bookings: 'Booking', centers: 'Center', labs: 'Lab', users: 'User', organizations: 'Organization', tenant: 'Tenant', tenants: 'Tenant', auth: 'User' };

/** Records every successful write request (method, path, actor, IP, redacted body). */
export function auditWrites(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || !req.user) return next();
  const tenant = currentTenant() || req.user.tenant || null;
  const body = req.body && Object.keys(req.body).length ? req.body : null;
  res.on('finish', () => {
    const parts = req.originalUrl.split('?')[0].replace(/^\/api(\/v1)?\//, '').split('/');
    if (res.statusCode >= 400 || parts[0] === 'notifications') return;
    const entityId = parts.find((p) => /^[a-f0-9]{24}$/.test(p)) || '';
    audit(req, `${req.method} /${parts.map((p) => (/^[a-f0-9]{24}$/.test(p) ? ':id' : p)).join('/')}`, ENTITY[['admin', 'platform'].includes(parts[0]) ? parts[1] : parts[0]] || parts[0], entityId, null, body, { status: res.statusCode, tenant }).catch((e) => console.error('[audit]', e.message));
  });
  next();
}
