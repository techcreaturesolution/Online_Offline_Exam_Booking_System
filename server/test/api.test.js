import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
const uri = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/thespot_exam_booking_test';
process.env.MONGO_URI = uri;

let server;
let base;
let skip = false;
const { createApp } = await import('../src/app.js');
const { seedDemo, DEMO_PASSWORD } = await import('../scripts/seed-demo.js');
const { addDays, todayIso } = await import('../src/utils/time.js');

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

const tokens = {};
async function api(who, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (who) {
    if (!tokens[who]) {
      const r = await fetch(`${base}/auth/login`, { method: 'POST', headers, body: JSON.stringify({ email: `${who}@examhub.test`, password: DEMO_PASSWORD }) });
      tokens[who] = (await r.json()).token;
    }
    headers.Authorization = `Bearer ${tokens[who]}`;
  }
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* csv */
  }
  return { status: r.status, data };
}

async function centerByCode(code) {
  const { data } = await api('admin', 'GET', '/centers');
  return data.centers.find((c) => c.code === code);
}

test('online exam: institute books, network admin allocates, vendor verifies, center gets ready, agency conducts', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const ahm = await centerByCode('AHM01');
  const { data: meta } = await api('university', 'GET', '/meta/agencies');
  const agency = meta.agencies.find((a) => a.code === 'EDUSEC');
  const date = todayIso();
  const created = await api('university', 'POST', '/bookings', {
    center: ahm._id, examName: 'API Flow Online Exam', mode: 'online', agency: agency._id,
    shifts: [{ label: 'Morning', date, startTime: '09:00', endTime: '11:00', candidates: 150 }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.booking._id;
  const shiftId = created.data.booking.shifts[0]._id;
  assert.equal(created.data.booking.billing.amount, 150 * 450);

  assert.equal((await api('center', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: [] })).status, 403, 'center in-charge cannot allocate online labs');
  assert.equal((await api('agency2', 'GET', `/bookings/${id}`)).status, 404, 'other agencies cannot see the booking');

  const suggest = await api('network', 'GET', `/bookings/${id}/allocations/suggest?shiftId=${shiftId}`);
  assert.equal(suggest.status, 200);
  assert.equal(suggest.data.shortfall, 0);
  assert.equal(suggest.data.labs.every((l) => l.mode === 'online'), true);
  const labA = suggest.data.labs.find((l) => l.code === 'LAB-A');

  const over = await api('network', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: [{ lab: labA._id, seats: labA.free + 1 }] });
  assert.equal(over.status, 409);
  const partial = await api('network', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: [{ lab: labA._id, seats: 100 }] });
  assert.equal(partial.data.status, 'requested');
  const alloc = await api('network', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: suggest.data.items });
  assert.equal(alloc.status, 200, JSON.stringify(alloc.data));
  assert.equal(alloc.data.status, 'allocated');

  assert.equal((await api('university', 'POST', `/bookings/${id}/review`, { decision: 'approved' })).status, 403, 'institute does not verify online allocation');
  const changes = await api('vendor', 'POST', `/bookings/${id}/review`, { decision: 'changes_requested', note: 'Use Lab B for 40 seats' });
  assert.equal(changes.data.booking.status, 'requested');
  await api('network', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: suggest.data.items });
  const approved = await api('vendor', 'POST', `/bookings/${id}/review`, { decision: 'approved' });
  assert.equal(approved.data.booking.status, 'confirmed');

  const { data: detail } = await api('network', 'GET', `/bookings/${id}`);
  const all = (list) => Object.fromEntries(list.map((c) => [c.key, true]));
  assert.ok(detail.actions.includes('readiness:network'));
  assert.equal((await api('network', 'PUT', `/bookings/${id}/readiness/network`, { items: all(detail.checklists.network) })).data.booking.status, 'confirmed');
  assert.equal((await api('center', 'PUT', `/bookings/${id}/readiness/center`, { items: all(detail.checklists.center) })).data.booking.status, 'ready');

  assert.equal((await api('agency', 'POST', `/bookings/${id}/start`)).data.booking.status, 'in_progress');
  const bad = await api('agency', 'PUT', `/bookings/${id}/shifts/${shiftId}/attendance`, { present: 100, absent: 10 });
  assert.equal(bad.status, 400);
  assert.equal((await api('agency', 'POST', `/bookings/${id}/complete`)).status, 403);
  const { data: live } = await api('agency', 'GET', `/bookings/${id}`);
  let left = 140;
  const labs = live.allocation.shifts[0].allocations.map((a) => {
    const present = Math.min(a.seats, left);
    left -= present;
    return { allocation: a._id, present };
  });
  const labWise = await api('agency', 'PUT', `/bookings/${id}/shifts/${shiftId}/attendance`, { labs });
  assert.equal(labWise.status, 200, JSON.stringify(labWise.data));
  assert.equal(labWise.data.booking.shifts[0].attendance.present, 140);
  assert.equal(labWise.data.booking.shifts[0].attendance.absent, 10);
  const inc = await api('network', 'POST', `/bookings/${id}/incidents`, { category: 'network', severity: 'high', description: 'Switch reboot in Lab A' });
  assert.equal(inc.status, 201);
  const done = await api('agency', 'POST', `/bookings/${id}/complete`);
  assert.equal(done.data.booking.status, 'completed');
  assert.equal((await api('university', 'POST', `/bookings/${id}/feedback`, { rating: 5 })).status, 200);

  const notes = await api('university', 'GET', '/notifications');
  assert.ok(notes.data.unread > 0);
  assert.ok(notes.data.notifications.some((n) => n.title.includes('High severity incident')));
});

test('lab conflicts: a second booking cannot take seats already allocated in an overlapping shift', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const srt = await centerByCode('SRT01');
  const date = addDays(todayIso(), 25);
  const mk = async (who, startTime, endTime, candidates) => {
    const r = await api(who, 'POST', '/bookings', { center: srt._id, examName: `Conflict ${startTime}`, mode: 'online', shifts: [{ date, startTime, endTime, candidates }] });
    return { id: r.data.booking._id, shiftId: r.data.booking.shifts[0]._id };
  };
  const a = await mk('university', '09:00', '11:00', 140);
  const b = await mk('institute', '10:00', '12:00', 140);
  const c = await mk('institute', '11:00', '13:00', 140);
  const lab1 = (await api('network', 'GET', `/centers/${srt._id}/availability?date=${date}&startTime=09:00&endTime=11:00`)).data.labs.find((l) => l.code === 'S-LAB1');
  assert.equal(lab1.free, 140);
  assert.equal((await api('network', 'PUT', `/bookings/${a.id}/allocations/${a.shiftId}`, { items: [{ lab: lab1._id, seats: 140 }] })).status, 200);
  const clash = await api('network', 'PUT', `/bookings/${b.id}/allocations/${b.shiftId}`, { items: [{ lab: lab1._id, seats: 1 }] });
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /only 0 free seats/);
  assert.equal((await api('network', 'PUT', `/bookings/${c.id}/allocations/${c.shiftId}`, { items: [{ lab: lab1._id, seats: 140 }] })).status, 200, 'back-to-back shift is free');
  await api('university', 'POST', `/bookings/${a.id}/cancel`, { reason: 'Postponed' });
  assert.equal((await api('network', 'PUT', `/bookings/${b.id}/allocations/${b.shiftId}`, { items: [{ lab: lab1._id, seats: 140 }] })).status, 409, 'still overlaps the 11:00 shift');
  assert.equal((await api('university', 'POST', `/bookings/${c.id}/cancel`, { reason: 'Postponed' })).status, 404, 'other institutes cannot see or cancel it');
  await api('institute', 'POST', `/bookings/${c.id}/cancel`, { reason: 'Postponed' });
  assert.equal((await api('network', 'PUT', `/bookings/${b.id}/allocations/${b.shiftId}`, { items: [{ lab: lab1._id, seats: 140 }] })).status, 200, 'cancel releases seats');
});

test('offline exam: center in-charge allocates halls and the institute verifies', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const vad = await centerByCode('VAD01');
  const date = addDays(todayIso(), 15);
  assert.equal((await api('university', 'POST', '/bookings', { center: vad._id, examName: 'Online at offline center', mode: 'online', shifts: [{ date, startTime: '10:00', endTime: '12:00', candidates: 5 }] })).status, 400);
  const r = await api('university', 'POST', '/bookings', { center: vad._id, examName: 'Offline API Exam', mode: 'offline', shifts: [{ label: 'P1', date, startTime: '10:00', endTime: '12:00', candidates: 3 }] });
  const id = r.data.booking._id;
  const shiftId = r.data.booking.shifts[0]._id;
  assert.equal((await api('network', 'GET', `/bookings/${id}`)).status, 404, 'network admin does not see offline bookings');
  const sug = await api('center2', 'GET', `/bookings/${id}/allocations/suggest?shiftId=${shiftId}`);
  assert.equal(sug.data.labs.every((l) => l.mode === 'offline'), true);
  assert.equal((await api('center2', 'PUT', `/bookings/${id}/allocations/${shiftId}`, { items: sug.data.items })).data.status, 'allocated');
  assert.equal((await api('vendor', 'POST', `/bookings/${id}/review`, { decision: 'approved' })).status, 403);
  assert.equal((await api('university', 'POST', `/bookings/${id}/review`, { decision: 'approved' })).data.booking.status, 'confirmed');
});

test('reports: dashboard counts and utilization are scoped by role', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const admin = await api('admin', 'GET', '/reports/dashboard');
  const inst = await api('institute', 'GET', '/reports/dashboard');
  assert.ok(admin.data.counts.total > inst.data.counts.total);
  const util = await api('center', 'GET', `/reports/utilization?from=${addDays(todayIso(), -10)}&to=${addDays(todayIso(), 10)}`);
  assert.equal(util.status, 200);
  assert.deepEqual([...new Set(util.data.centers.map((c) => c.centerName))], ['Ahmedabad Digital Exam Center']);
  assert.ok(util.data.totals.allocatedSeatHours > 0);
  const net = await api('network', 'GET', '/reports/utilization');
  assert.equal(net.data.labs.every((l) => l.type === 'computer_lab'), true);
  const csv = await api('vendor', 'GET', '/reports/utilization.csv');
  assert.match(csv.data, /^Center,Lab Code/);
});

test('admin manages users; institutes self-register and wait for approval', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const reg = await api(null, 'POST', '/auth/register-institute', { name: 'New Registrar', email: 'reg@newuni.test', password: 'Secret@123', institute: { name: 'New City University', type: 'university', city: 'Rajkot', state: 'Gujarat' } });
  assert.equal(reg.status, 201);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reg@newuni.test', password: 'Secret@123' }) });
  assert.equal(login.status, 403);
  const { data } = await api('admin', 'GET', '/admin/users?status=pending');
  const pending = data.users.find((u) => u.email === 'reg@newuni.test');
  assert.equal((await api('admin', 'PUT', `/admin/users/${pending._id}`, { status: 'active' })).status, 200);
  const ok = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reg@newuni.test', password: 'Secret@123' }) });
  assert.equal(ok.status, 200);
  assert.equal((await api('vendor', 'GET', '/admin/users')).status, 403);
  const noCenter = await api('admin', 'POST', '/admin/users', { name: 'Net Two', email: 'net2@examhub.test', role: 'network_admin', password: 'Secret@123' });
  assert.equal(noCenter.status, 400);
});

test('mock day: agency requests, network admin allocates, vendor permits, agency records the result', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const ahm = await centerByCode('AHM01');
  const { data: meta } = await api('university', 'GET', '/meta/agencies');
  const agency = meta.agencies.find((a) => a.code === 'EDUSEC');
  const examDate = addDays(todayIso(), 9);
  const created = await api('university', 'POST', '/bookings', {
    center: ahm._id, examName: 'Mock Flow Online Exam', mode: 'online', agency: agency._id,
    shifts: [{ date: examDate, startTime: '09:00', endTime: '11:00', candidates: 50 }],
  });
  const id = created.data.booking._id;
  const mock = { date: todayIso(), startTime: '15:00', endTime: '16:00', candidates: 50 };
  assert.equal((await api('university', 'PUT', `/bookings/${id}/mock`, { ...mock, date: examDate })).status, 400, 'mock day must be before the exam date');
  assert.equal((await api('university', 'PUT', `/bookings/${id}/mock`, { ...mock, candidates: 51 })).status, 400);
  assert.equal((await api('network', 'PUT', `/bookings/${id}/mock`, mock)).status, 403);
  const req = await api('agency', 'PUT', `/bookings/${id}/mock`, mock);
  assert.equal(req.status, 200, JSON.stringify(req.data));
  assert.equal(req.data.booking.mock.status, 'requested');

  assert.equal((await api('agency', 'GET', `/bookings/${id}/mock/suggest`)).status, 403, 'only the network admin allocates');
  const suggest = await api('network', 'GET', `/bookings/${id}/mock/suggest`);
  assert.equal(suggest.data.shortfall, 0);
  assert.equal((await api('vendor', 'POST', `/bookings/${id}/mock/permission`, { decision: 'approved' })).status, 403, 'permission needs allocation first');
  const alloc = await api('network', 'PUT', `/bookings/${id}/mock/allocation`, { items: suggest.data.items });
  assert.equal(alloc.status, 200, JSON.stringify(alloc.data));
  assert.equal(alloc.data.booking.mock.status, 'allocated');
  assert.equal((await api('network', 'POST', `/bookings/${id}/mock/permission`, { decision: 'approved' })).status, 403);
  assert.equal((await api('vendor', 'POST', `/bookings/${id}/mock/permission`, { decision: 'rejected' })).status, 400, 'rejection needs a note');
  const permit = await api('vendor', 'POST', `/bookings/${id}/mock/permission`, { decision: 'approved', note: 'Lab open from 14:30' });
  assert.equal(permit.data.booking.mock.status, 'approved');

  const { data: detail } = await api('agency', 'GET', `/bookings/${id}`);
  assert.equal(detail.mockAllocations.length, suggest.data.items.length);
  assert.ok(detail.actions.includes('mockResult'));
  assert.equal(detail.allocation.totalSeats, 0, 'mock seats are not exam allocation');
  const result = await api('agency', 'POST', `/bookings/${id}/mock/result`, { present: 46, remarks: 'Two systems replaced' });
  assert.equal(result.data.booking.mock.status, 'completed');

  const plan = await api('agency', 'GET', `/reports/planning?from=${todayIso()}&to=${examDate}`);
  assert.ok(plan.data.rows.some((r) => r.kind === 'mock' && r.booking._id === id));
});

test('exam start is allowed only on the exam date', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const { data } = await api('agency2', 'GET', '/bookings?status=ready');
  const offline = data.bookings.find((b) => b.examCode === 'BCOM-S3');
  assert.ok(offline, 'seeded ready exam scheduled for tomorrow');
  const start = await api('agency2', 'POST', `/bookings/${offline._id}/start`);
  assert.equal(start.status, 403);
  assert.match(start.data.error, /only on its exam date/);
});

test('simultaneous allocation saves cannot overbook a lab, and overlapping exams get separate seat ranges', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const srt = await centerByCode('SRT01');
  const date = addDays(todayIso(), 30);
  const mk = async (who, startTime, endTime, candidates) => {
    const r = await api(who, 'POST', '/bookings', { center: srt._id, examName: `Race ${startTime}`, mode: 'online', shifts: [{ date, startTime, endTime, candidates }] });
    return { id: r.data.booking._id, shiftId: r.data.booking.shifts[0]._id };
  };
  const a = await mk('university', '09:00', '11:00', 100);
  const b = await mk('institute', '09:00', '11:00', 100);
  const lab1 = (await api('network', 'GET', `/centers/${srt._id}/availability?date=${date}&startTime=09:00&endTime=11:00`)).data.labs.find((l) => l.code === 'S-LAB1');
  const results = await Promise.all([a, b].map((x) => api('network', 'PUT', `/bookings/${x.id}/allocations/${x.shiftId}`, { items: [{ lab: lab1._id, seats: 100 }] })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);

  const c = await mk('institute', '10:00', '12:00', 30);
  assert.equal((await api('network', 'PUT', `/bookings/${c.id}/allocations/${c.shiftId}`, { items: [{ lab: lab1._id, seats: 30 }] })).status, 200);
  const plan = await api('network', 'GET', `/reports/planning?from=${date}&to=${date}`);
  const rows = plan.data.rows.filter((r) => r.lab.code === 'S-LAB1').sort((x, y) => x.seatFrom - y.seatFrom);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.seatFrom, r.seatTo]), [[1, 100], [101, 130]]);
});

test('the exam agency sees a user directory without super admins', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const r = await api('agency', 'GET', '/meta/directory');
  assert.equal(r.status, 200);
  assert.ok(r.data.users.length > 5);
  assert.equal(r.data.users.some((u) => u.role === 'super_admin'), false);
  assert.ok(r.data.users.some((u) => u.role === 'network_admin'));
  assert.equal((await api('institute', 'GET', '/meta/directory')).status, 403);
});

test('attendance counts roll up classrooms by block and center', async (t) => {
  if (skip) return t.skip('MongoDB not reachable');
  const r = await api('admin', 'GET', `/reports/attendance?date=${todayIso()}`);
  assert.equal(r.status, 200);
  for (const c of r.data.centers) {
    assert.equal(c.total.allocated, c.blocks.reduce((n, b) => n + b.allocated, 0));
    assert.equal(c.total.present, c.classrooms.reduce((n, x) => n + (x.present || 0), 0));
  }
  assert.equal((await api('university', 'GET', `/bookings/${r.data.centers[0]?.classrooms?.[0]?.lab || '000000000000000000000000'}/candidates`)).status, 404);
});
