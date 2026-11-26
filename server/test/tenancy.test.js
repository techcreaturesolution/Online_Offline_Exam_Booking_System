import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
const uri = process.env.MONGO_URI_TENANCY_TEST || 'mongodb://127.0.0.1:27017/thespot_exam_booking_tenancy_test';
process.env.MONGO_URI = uri;

let server;
let base;
let skip = false;
const { createApp } = await import('../src/app.js');
const { seedDemo, DEMO_PASSWORD } = await import('../scripts/seed-demo.js');
const { Booking } = await import('../src/models/Booking.js');
const { AuditLog } = await import('../src/models/AuditLog.js');
const { asPlatform, withTenant } = await import('../src/tenancy/context.js');
const { Tenant } = await import('../src/models/Tenant.js');

before(async () => {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
  } catch {
    skip = true;
    return;
  }
  await seedDemo();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  if (!skip) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* csv */
  }
  return { status: r.status, data };
}
const login = async (email, password = DEMO_PASSWORD, headers) => call('POST', '/auth/login', { body: { email, password }, headers });
const tokenFor = async (email) => (await login(email)).data.token;

test('tenant data is isolated: lists, reads and writes never cross tenants', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  const main = await tokenFor('admin@examhub.test');
  const acme = await tokenFor('admin@acme.test');

  const mainCenters = (await call('GET', '/centers', { token: main })).data.centers;
  const acmeCenters = (await call('GET', '/centers', { token: acme })).data.centers;
  assert.equal(acmeCenters.length, 1);
  assert.equal(acmeCenters[0].name, 'Acme Pune Test Center');
  assert.ok(!mainCenters.some((c) => c.name === 'Acme Pune Test Center'));
  const mainAhm = mainCenters.find((c) => c.code === 'AHM01');

  assert.equal((await call('GET', `/centers/${mainAhm._id}`, { token: acme })).status, 404);
  assert.equal((await call('PUT', `/centers/${mainAhm._id}`, { token: acme, body: { name: 'Hijacked' } })).status, 404);
  assert.equal((await call('GET', `/centers/${acmeCenters[0]._id}`, { token: main })).status, 404);

  const mainBookings = (await call('GET', '/bookings', { token: main })).data.bookings;
  assert.ok(mainBookings.length > 0);
  assert.equal((await call('GET', '/bookings', { token: acme })).data.bookings.length, 0);
  assert.equal((await call('GET', `/bookings/${mainBookings[0]._id}`, { token: acme })).status, 404);

  const acmeUsers = (await call('GET', '/admin/users', { token: acme })).data.users;
  assert.deepEqual(acmeUsers.map((u) => u.email), ['admin@acme.test']);
  const dash = (await call('GET', '/reports/dashboard', { token: acme })).data;
  assert.equal(dash.totals?.bookings ?? 0, 0);
});

test('queries without a tenant context fail instead of leaking data', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  await assert.rejects(() => Booking.find().exec(), /Unscoped Booking query/);
  const all = await asPlatform(() => Booking.countDocuments());
  const acme = await asPlatform(() => Tenant.findOne({ slug: 'acme' }));
  assert.ok(all > 0);
  assert.equal(await withTenant(acme._id, () => Booking.countDocuments()), 0);
});

test('organisations sign up for a trial; X-Tenant must match the account', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  const body = { organisation: { name: 'Nova Exams', slug: 'nova', types: ['vendor'] }, name: 'Nova Admin', email: 'admin@nova.test', password: 'Nova@12345' };
  const r = await call('POST', '/auth/signup-tenant', { body });
  assert.equal(r.status, 201);
  assert.equal(r.data.tenant.status, 'trial');
  assert.equal((await call('POST', '/auth/signup-tenant', { body: { ...body, email: 'other@nova.test' } })).status, 409);
  const me = await call('GET', '/auth/me', { token: r.data.token });
  assert.equal(me.data.tenant.slug, 'nova');
  assert.equal(me.data.user.role, 'super_admin');
  assert.equal((await call('GET', '/centers', { token: r.data.token })).data.centers.length, 0);
  assert.equal((await login('admin@nova.test', 'Nova@12345', { 'X-Tenant': 'acme' })).status, 401);
  assert.equal((await call('GET', '/centers', { token: r.data.token, headers: { 'X-Tenant': 'acme' } })).status, 401);
  assert.equal((await login('admin@nova.test', 'Nova@12345', { 'X-Tenant': 'nova' })).status, 200);
});

test('platform owner lists, suspends and impersonates tenants; every step is audited', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  const owner = await tokenFor('owner@examhub.test');
  assert.equal((await call('GET', '/bookings', { token: owner })).status, 403);
  assert.equal((await call('GET', '/platform/tenants', { token: await tokenFor('admin@examhub.test') })).status, 403);

  const { tenants } = (await call('GET', '/platform/tenants', { token: owner })).data;
  const acme = tenants.find((x) => x.slug === 'acme');
  const main = tenants.find((x) => x.slug === 'default');
  assert.equal(acme.usage.centers, 1);
  assert.ok(main.usage.bookings > 0);

  const acmeToken = await tokenFor('admin@acme.test');
  assert.equal((await call('PATCH', `/platform/tenants/${acme._id}`, { token: owner, body: { status: 'suspended' } })).status, 200);
  assert.equal((await login('admin@acme.test')).status, 403);
  assert.equal((await call('GET', '/centers', { token: acmeToken })).status, 403);
  await call('PATCH', `/platform/tenants/${acme._id}`, { token: owner, body: { status: 'active', plan: 'starter' } });
  assert.equal((await call('GET', '/centers', { token: acmeToken })).status, 200);

  assert.equal((await call('POST', `/platform/tenants/${acme._id}/impersonate`, { token: owner, body: {} })).status, 400);
  const imp = await call('POST', `/platform/tenants/${acme._id}/impersonate`, { token: owner, body: { reason: 'Support ticket 42' } });
  assert.equal(imp.status, 200);
  const me = await call('GET', '/auth/me', { token: imp.data.token });
  assert.equal(me.data.tenant.slug, 'acme');
  assert.ok(me.data.impersonatedBy);
  await call('PATCH', '/tenant', { token: imp.data.token, body: { branding: { primaryColor: '#123456' } } });

  const logs = (await call('GET', '/tenant/audit-logs', { token: acmeToken })).data.items;
  const actions = logs.map((l) => l.action);
  assert.ok(actions.includes('platform.impersonation_started'));
  assert.ok(actions.includes('platform.tenant_updated'));
  const settings = logs.find((l) => l.action === 'tenant.settings_updated');
  assert.ok(settings.impersonatedBy);
  assert.equal(settings.before.branding.primaryColor, '');
  const mainLogs = (await call('GET', '/tenant/audit-logs', { token: await tokenFor('admin@examhub.test') })).data.items;
  assert.ok(!mainLogs.some((l) => String(l.tenant) === String(acme._id)));
});

test('audit log is immutable and records writes; repeated bad passwords lock the account', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  const main = await tokenFor('admin@examhub.test');
  const users = (await call('GET', '/admin/users', { token: main })).data.users;
  const agency = users.find((u) => u.email === 'agency2@examhub.test');
  assert.equal((await call('PUT', `/admin/users/${agency._id}`, { token: main, body: { phone: '9999999999', password: 'Changed@123' } })).status, 200);
  await new Promise((r) => setTimeout(r, 100));
  const items = (await call('GET', '/tenant/audit-logs?entity=User', { token: main })).data.items;
  const write = items.find((l) => l.action === 'PUT /admin/users/:id');
  assert.equal(write.after.password, '[redacted]');
  assert.ok(items.some((l) => l.action === 'user.updated'));
  assert.match((await call('GET', '/tenant/audit-logs.csv', { token: main })).data, /user\.updated/);
  await assert.rejects(() => asPlatform(() => AuditLog.updateOne({}, { action: 'tampered' })), /immutable/);
  await assert.rejects(() => asPlatform(() => AuditLog.deleteMany({})), /immutable/);

  for (let i = 0; i < 5; i += 1) assert.equal((await login('agency2@examhub.test', 'wrong-password')).status, 401);
  assert.equal((await login('agency2@examhub.test', 'Changed@123')).status, 429);
});

test('tenant admin exports data and schedules deletion with a grace period', { skip }, async (t) => {
  if (skip) return t.skip('MongoDB not available');
  const nova = (await login('admin@nova.test', 'Nova@12345')).data.token;
  const exp = await call('GET', '/tenant/export', { token: nova });
  assert.equal(exp.status, 200);
  assert.equal(exp.data.tenant.slug, 'nova');
  assert.ok(exp.data.users.every((u) => !u.passwordHash));
  assert.equal((await call('POST', '/tenant/delete', { token: nova, body: { confirm: 'wrong' } })).status, 400);
  const del = await call('POST', '/tenant/delete', { token: nova, body: { confirm: 'nova' } });
  assert.equal(del.data.tenant.status, 'cancelled');
  assert.ok(new Date(del.data.tenant.deletionScheduledAt) > new Date(Date.now() + 29 * 86400000));
  assert.equal((await call('GET', '/centers', { token: nova })).status, 403);
});
