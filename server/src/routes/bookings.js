import { Router } from 'express';
import { z } from 'zod';
import { Booking } from '../models/Booking.js';
import { Candidate } from '../models/Candidate.js';
import { Center } from '../models/Center.js';
import { nextSeq } from '../models/Counter.js';
import { LabAllocation } from '../models/LabAllocation.js';
import { Organization } from '../models/Organization.js';
import { NETWORK_CHECKLIST, ROLES, centerChecklistFor } from '../models/roles.js';
import { bookingScope } from '../services/access.js';
import { allocationSummary, availability, suggestPlan, validatePlan } from '../services/allocation.js';
import { notifyBooking } from '../services/notify.js';
import { buildSeatPlan } from '../services/seatPlan.js';
import { allowedActions, denyReason, readinessKinds } from '../services/workflow.js';
import { parseCsv, toCsv } from '../utils/csv.js';
import { HttpError } from '../utils/httpError.js';
import { DATE_RE, TIME_RE, todayIso, toMinutes } from '../utils/time.js';

const router = Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const shiftSchema = z
  .object({
    label: z.string().trim().max(40).optional().default(''),
    date: z.string().regex(DATE_RE, 'Use YYYY-MM-DD'),
    startTime: z.string().regex(TIME_RE, 'Use HH:MM'),
    endTime: z.string().regex(TIME_RE, 'Use HH:MM'),
    candidates: z.number().int().min(1).max(100000),
  })
  .refine((s) => toMinutes(s.endTime) > toMinutes(s.startTime), { message: 'Shift end time must be after start time' });

const bookingSchema = z.object({
  institute: objectId.optional(),
  center: objectId,
  agency: objectId.nullable().optional(),
  examName: z.string().trim().min(3).max(150),
  examCode: z.string().trim().max(40).optional().default(''),
  mode: z.enum(['online', 'offline']),
  shifts: z.array(shiftSchema).min(1).max(60),
  requirements: z.array(z.string().trim().min(1)).max(20).optional().default([]),
  notes: z.string().trim().max(2000).optional().default(''),
});

function event(user, action, note = '') {
  return { action, note, by: user._id, byName: user.name, byRole: user.role, at: new Date() };
}

async function validateBookingInput(body, user) {
  const center = await Center.findById(body.center).lean();
  if (!center || !center.active) throw new HttpError(400, 'Center not found or inactive');
  if (!center.modes.includes(body.mode)) throw new HttpError(400, `${center.name} does not conduct ${body.mode} exams`);
  const today = todayIso();
  for (const s of body.shifts) {
    if (s.date < today) throw new HttpError(400, `Shift date ${s.date} is in the past`);
    if (toMinutes(s.startTime) < toMinutes(center.openTime) || toMinutes(s.endTime) > toMinutes(center.closeTime)) {
      throw new HttpError(400, `Shift ${s.date} ${s.startTime}-${s.endTime} is outside center hours ${center.openTime}-${center.closeTime}`);
    }
  }
  if (body.agency && !(await Organization.exists({ _id: body.agency, kind: 'agency', active: true }))) throw new HttpError(400, 'Agency not found');
  let institute = user.organization;
  if (user.role === ROLES.SUPER_ADMIN) {
    if (!body.institute) throw new HttpError(400, 'Select the institute for this booking');
    institute = body.institute;
  }
  if (!(await Organization.exists({ _id: institute, kind: 'institute' }))) throw new HttpError(400, 'Institute not found');
  return { center, institute };
}

function billingFor(center, mode, shifts) {
  const rate = center.ratePerSeat?.[mode] || 0;
  return { ratePerSeat: rate, amount: rate * shifts.reduce((n, s) => n + s.candidates, 0) };
}

async function loadBooking(req) {
  const booking = await Booking.findOne({ _id: req.params.id, ...(await bookingScope(req.user)) });
  if (!booking) throw new HttpError(404, 'Booking not found');
  const center = await Center.findById(booking.center).lean();
  return { booking, center };
}

function assertAllowed(action, user, booking, ctx) {
  const reason = denyReason(action, user, booking, ctx);
  if (reason) throw new HttpError(403, reason);
}

async function listFilter(req) {
  const filter = await bookingScope(req.user);
  const q = req.query;
  if (q.status) filter.status = { $in: String(q.status).split(',') };
  if (q.mode) filter.mode = String(q.mode);
  if (q.center && /^[a-f\d]{24}$/i.test(q.center)) filter.$and = [{ center: q.center }];
  if (q.from || q.to) {
    filter['shifts.date'] = {};
    if (DATE_RE.test(q.from || '')) filter['shifts.date'].$gte = q.from;
    if (DATE_RE.test(q.to || '')) filter['shifts.date'].$lte = q.to;
  }
  if (q.q) {
    const re = new RegExp(escapeRe(String(q.q)), 'i');
    filter.$or = [{ examName: re }, { examCode: re }, { bookingNo: re }];
  }
  return filter;
}

async function bookingsForList(req) {
  return Booking.find(await listFilter(req))
    .select('-timeline -incidents.description')
    .populate('institute', 'name')
    .populate('center', 'name code city')
    .populate('agency', 'name')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
}

router.get('/', async (req, res) => {
  const bookings = await bookingsForList(req);
  const seats = await LabAllocation.aggregate([{ $match: { booking: { $in: bookings.map((b) => b._id) } } }, { $group: { _id: '$booking', seats: { $sum: '$seats' } } }]);
  const seatMap = new Map(seats.map((s) => [String(s._id), s.seats]));
  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      candidates: b.shifts.reduce((n, s) => n + s.candidates, 0),
      allocatedSeats: seatMap.get(String(b._id)) || 0,
      present: b.shifts.reduce((n, s) => n + (s.attendance?.present || 0), 0),
      firstDate: b.shifts.map((s) => s.date).sort()[0],
    })),
  });
});

router.get('/export.csv', async (req, res) => {
  const bookings = await bookingsForList(req);
  const rows = [];
  for (const b of bookings) {
    for (const s of b.shifts) {
      rows.push([b.bookingNo, b.examName, b.examCode, b.mode, b.status, b.institute?.name, b.center?.name, b.center?.city, b.agency?.name || '', s.label, s.date, s.startTime, s.endTime, s.candidates, s.attendance?.present ?? '', s.attendance?.absent ?? '']);
    }
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bookings.csv"');
  res.send(toCsv(['Booking No', 'Exam', 'Exam Code', 'Mode', 'Status', 'Institute', 'Center', 'City', 'Agency', 'Shift', 'Date', 'Start', 'End', 'Candidates', 'Present', 'Absent'], rows));
});

router.post('/', async (req, res) => {
  if (![ROLES.INSTITUTE, ROLES.SUPER_ADMIN].includes(req.user.role)) throw new HttpError(403, 'Only a University / Institute can request an exam booking');
  const body = bookingSchema.parse(req.body);
  const { center, institute } = await validateBookingInput(body, req.user);
  const year = new Date().getFullYear();
  const booking = await Booking.create({
    ...body,
    institute,
    agency: body.agency || null,
    bookingNo: `EB-${year}-${String(await nextSeq(`booking-${year}`)).padStart(5, '0')}`,
    billing: billingFor(center, body.mode, body.shifts),
    createdBy: req.user._id,
    timeline: [event(req.user, 'requested', `${body.mode} exam, ${body.shifts.length} shift(s)`)],
  });
  const allocator = body.mode === 'online' ? 'Network Admin' : 'Center In-Charge';
  await notifyBooking(booking, `New ${body.mode} exam booking ${booking.bookingNo}`, `${body.examName} at ${center.name} needs lab allocation by the ${allocator}.`, { exclude: req.user._id });
  res.status(201).json({ booking });
});

router.get('/:id', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  await booking.populate([
    { path: 'institute', select: 'name type city email phone' },
    { path: 'center', select: 'name code city state address openTime closeTime vendor facilities', populate: { path: 'vendor', select: 'name' } },
    { path: 'agency', select: 'name city email phone' },
  ]);
  const plain = booking.toObject({ flattenMaps: true });
  const summary = await allocationSummary(booking);
  const candidates = await Candidate.countDocuments({ booking: booking._id });
  res.json({
    booking: plain,
    allocation: summary,
    candidates,
    actions: allowedActions(req.user, { ...plain, center: booking.center._id, institute: booking.institute._id, agency: booking.agency?._id || null }, { center, hasAllocations: summary.totalSeats > 0 }),
    checklists: { network: NETWORK_CHECKLIST, center: centerChecklistFor(booking.mode) },
  });
});

router.put('/:id', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  const hasAllocations = await LabAllocation.exists({ booking: booking._id });
  assertAllowed('edit', req.user, booking, { center, hasAllocations });
  const body = bookingSchema.omit({ institute: true }).parse({ ...req.body, center: req.body.center || String(booking.center), mode: req.body.mode || booking.mode });
  const { center: newCenter } = await validateBookingInput({ ...body, institute: String(booking.institute) }, req.user);
  const existingCandidates = await Candidate.countDocuments({ booking: booking._id });
  if (existingCandidates) throw new HttpError(400, 'Remove uploaded candidates before changing shifts');
  Object.assign(booking, body, { billing: { ...booking.billing.toObject(), ...billingFor(newCenter, body.mode, body.shifts) } });
  booking.timeline.push(event(req.user, 'edited'));
  await booking.save();
  res.json({ booking });
});

router.get('/:id/allocations/suggest', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('allocate', req.user, booking, { center });
  const shift = booking.shifts.id(String(req.query.shiftId || ''));
  if (!shift) throw new HttpError(404, 'Shift not found');
  const labs = await availability({ center: booking.center, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, mode: booking.mode, ignore: { booking: booking._id, shiftId: shift._id } });
  res.json({ labs, ...suggestPlan(labs, shift.candidates) });
});

router.put('/:id/allocations/:shiftId', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('allocate', req.user, booking, { center });
  const shift = booking.shifts.id(req.params.shiftId);
  if (!shift) throw new HttpError(404, 'Shift not found');
  const { items } = z.object({ items: z.array(z.object({ lab: objectId, seats: z.number().int().min(1) })).max(50) }).parse(req.body);
  const ignore = { booking: booking._id, shiftId: shift._id };
  const labs = await availability({ center: booking.center, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, mode: booking.mode, ignore });
  const total = validatePlan(items, labs, shift);
  await LabAllocation.deleteMany(ignore);
  if (items.length) {
    await LabAllocation.insertMany(
      items.map((it) => ({ ...ignore, center: booking.center, lab: it.lab, seats: it.seats, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, allocatedBy: req.user._id })),
    );
  }
  const summary = await allocationSummary(booking);
  const before = booking.status;
  booking.status = summary.complete ? 'allocated' : 'requested';
  const labCodes = items.map((it) => labs.find((l) => String(l._id) === it.lab)?.code).join(', ');
  booking.timeline.push(event(req.user, 'allocation_updated', `${shift.date} ${shift.startTime}: ${total}/${shift.candidates} seats${labCodes ? ` in ${labCodes}` : ''}`));
  if (before !== 'allocated' && booking.status === 'allocated') {
    booking.review = { decision: null, note: '' };
    booking.timeline.push(event(req.user, 'allocated', 'All shifts have lab allocation'));
    const reviewer = booking.mode === 'online' ? [ROLES.VENDOR, ROLES.SUPER_ADMIN] : [ROLES.INSTITUTE, ROLES.SUPER_ADMIN];
    await notifyBooking(booking, `Lab allocation ready: ${booking.bookingNo}`, `${booking.examName}: labs allocated for all shifts. Please verify the allocation.`, { exclude: req.user._id, roles: [...reviewer, ROLES.INSTITUTE] });
  }
  await booking.save();
  res.json({ allocation: summary, status: booking.status });
});

router.post('/:id/review', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('review', req.user, booking, { center });
  const body = z.object({ decision: z.enum(['approved', 'changes_requested']), note: z.string().trim().max(1000).optional().default('') }).parse(req.body);
  if (body.decision === 'changes_requested' && !body.note) throw new HttpError(400, 'Tell the allocator what needs to change');
  booking.review = { decision: body.decision, note: body.note, by: req.user._id, at: new Date() };
  booking.status = body.decision === 'approved' ? 'confirmed' : 'requested';
  booking.timeline.push(event(req.user, body.decision === 'approved' ? 'confirmed' : 'changes_requested', body.note));
  await booking.save();
  await notifyBooking(
    booking,
    body.decision === 'approved' ? `Booking confirmed: ${booking.bookingNo}` : `Allocation changes requested: ${booking.bookingNo}`,
    body.decision === 'approved' ? `${booking.examName} is confirmed. Center staff can start readiness checks.` : body.note,
    { exclude: req.user._id },
  );
  res.json({ booking });
});

router.post('/:id/agency', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('assignAgency', req.user, booking, { center });
  const { agency } = z.object({ agency: objectId.nullable() }).parse(req.body);
  const org = agency ? await Organization.findOne({ _id: agency, kind: 'agency', active: true }).lean() : null;
  if (agency && !org) throw new HttpError(400, 'Agency not found');
  booking.agency = agency;
  booking.timeline.push(event(req.user, 'agency_assigned', org?.name || 'Agency removed'));
  await booking.save();
  if (org) await notifyBooking(booking, `Exam assigned to ${org.name}: ${booking.bookingNo}`, `${booking.examName} at ${center.name}.`, { exclude: req.user._id });
  res.json({ booking });
});

router.put('/:id/readiness/:kind', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  const kind = req.params.kind;
  if (!['network', 'center'].includes(kind)) throw new HttpError(404, 'Unknown checklist');
  assertAllowed(`readiness:${kind}`, req.user, booking, { center });
  const list = kind === 'network' ? NETWORK_CHECKLIST : centerChecklistFor(booking.mode);
  const body = z.object({ items: z.record(z.string(), z.boolean()), remarks: z.string().trim().max(1000).optional().default('') }).parse(req.body);
  const items = Object.fromEntries(list.map((c) => [c.key, Boolean(body.items[c.key])]));
  const done = list.every((c) => items[c.key]);
  booking.readiness[kind] = { items, remarks: body.remarks, by: req.user._id, at: new Date(), done };
  booking.timeline.push(event(req.user, `${kind}_checklist`, done ? 'Completed' : `${Object.values(items).filter(Boolean).length}/${list.length} items`));
  await booking.save();
  // Re-read so a checklist saved concurrently by the other role is taken into account.
  const fresh = await Booking.findById(booking._id).select('mode status readiness').lean();
  const next = readinessKinds(fresh.mode).every((k) => fresh.readiness?.[k]?.done) ? 'ready' : 'confirmed';
  booking.status = next;
  if (fresh.status !== next) {
    const moved = await Booking.updateOne({ _id: booking._id, status: fresh.status }, { status: next });
    if (moved.modifiedCount && next === 'ready') {
      await notifyBooking(booking, `Center ready: ${booking.bookingNo}`, `${booking.examName}: all readiness checklists are complete.`, { exclude: req.user._id });
    }
  }
  res.json({ booking });
});

router.post('/:id/start', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('start', req.user, booking, { center });
  booking.status = 'in_progress';
  booking.timeline.push(event(req.user, 'started'));
  await booking.save();
  await notifyBooking(booking, `Exam started: ${booking.bookingNo}`, booking.examName, { exclude: req.user._id, roles: [ROLES.INSTITUTE, ROLES.SUPER_ADMIN, ROLES.VENDOR] });
  res.json({ booking });
});

router.put('/:id/shifts/:shiftId/attendance', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('attendance', req.user, booking, { center });
  const shift = booking.shifts.id(req.params.shiftId);
  if (!shift) throw new HttpError(404, 'Shift not found');
  const { present, absent } = z.object({ present: z.number().int().min(0), absent: z.number().int().min(0) }).parse(req.body);
  if (present + absent !== shift.candidates) throw new HttpError(400, `Present + absent must equal the ${shift.candidates} registered candidates`);
  shift.attendance = { present, absent, recordedBy: req.user._id, recordedAt: new Date() };
  booking.timeline.push(event(req.user, 'attendance', `${shift.date} ${shift.startTime}: ${present} present, ${absent} absent`));
  await booking.save();
  res.json({ booking });
});

router.post('/:id/incidents', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('incident', req.user, booking, { center });
  const body = z
    .object({
      category: z.enum(['technical', 'network', 'power', 'malpractice', 'medical', 'other']),
      severity: z.enum(['low', 'medium', 'high']).default('low'),
      shiftId: objectId.optional(),
      description: z.string().trim().min(5).max(2000),
    })
    .parse(req.body);
  if (body.shiftId && !booking.shifts.id(body.shiftId)) throw new HttpError(400, 'Shift not found');
  booking.incidents.push({ ...body, by: req.user._id, byRole: req.user.role });
  booking.timeline.push(event(req.user, 'incident', `${body.severity} ${body.category}`));
  await booking.save();
  if (body.severity === 'high') await notifyBooking(booking, `High severity incident: ${booking.bookingNo}`, body.description, { exclude: req.user._id });
  res.status(201).json({ booking });
});

router.put('/:id/incidents/:incidentId', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('incident', req.user, booking, { center });
  const incident = booking.incidents.id(req.params.incidentId);
  if (!incident) throw new HttpError(404, 'Incident not found');
  incident.resolved = z.object({ resolved: z.boolean() }).parse(req.body).resolved;
  booking.timeline.push(event(req.user, incident.resolved ? 'incident_resolved' : 'incident_reopened', incident.category));
  await booking.save();
  res.json({ booking });
});

router.post('/:id/complete', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('complete', req.user, booking, { center });
  booking.status = 'completed';
  const present = booking.shifts.reduce((n, s) => n + s.attendance.present, 0);
  const total = booking.shifts.reduce((n, s) => n + s.candidates, 0);
  booking.timeline.push(event(req.user, 'completed', `${present}/${total} candidates appeared`));
  await booking.save();
  await notifyBooking(booking, `Exam completed: ${booking.bookingNo}`, `${booking.examName}: ${present}/${total} candidates appeared.`, { exclude: req.user._id });
  res.json({ booking });
});

router.post('/:id/cancel', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('cancel', req.user, booking, { center });
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  await LabAllocation.deleteMany({ booking: booking._id });
  booking.status = 'cancelled';
  booking.cancelReason = reason;
  booking.timeline.push(event(req.user, 'cancelled', reason));
  await booking.save();
  await notifyBooking(booking, `Booking cancelled: ${booking.bookingNo}`, reason, { exclude: req.user._id });
  res.json({ booking });
});

router.put('/:id/billing', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('billing', req.user, booking, { center });
  const body = z.object({ ratePerSeat: z.number().min(0).optional(), paymentStatus: z.enum(['unpaid', 'paid', 'waived']).optional(), invoiceNo: z.string().trim().max(40).optional() }).parse(req.body);
  const b = booking.billing;
  if (body.ratePerSeat !== undefined) {
    b.ratePerSeat = body.ratePerSeat;
    b.amount = body.ratePerSeat * booking.shifts.reduce((n, s) => n + s.candidates, 0);
  }
  if (body.paymentStatus) b.paymentStatus = body.paymentStatus;
  if (body.invoiceNo !== undefined) b.invoiceNo = body.invoiceNo;
  booking.timeline.push(event(req.user, 'billing', `Rs ${b.amount} (${b.paymentStatus})`));
  await booking.save();
  res.json({ booking });
});

router.post('/:id/feedback', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('feedback', req.user, booking, { center });
  const body = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional().default('') }).parse(req.body);
  booking.feedback = { ...body, at: new Date() };
  booking.timeline.push(event(req.user, 'feedback', `${body.rating}/5`));
  await booking.save();
  res.json({ booking });
});

router.get('/:id/candidates', async (req, res) => {
  const { booking } = await loadBooking(req);
  const candidates = await Candidate.find({ booking: booking._id }).populate('lab', 'name code').sort({ rollNo: 1 }).lean();
  res.json({ candidates });
});

router.post('/:id/candidates', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('candidates', req.user, booking, { center });
  const { csv, replace } = z.object({ csv: z.string().min(1).max(2_000_000), replace: z.boolean().optional().default(false) }).parse(req.body);
  const rows = parseCsv(csv);
  const header = rows.shift()?.map((h) => h.toLowerCase().replace(/[^a-z]/g, '')) || [];
  const col = (names) => header.findIndex((h) => names.includes(h));
  const idx = { roll: col(['rollno', 'roll', 'rollnumber', 'applicationno']), name: col(['name', 'candidatename', 'fullname']), email: col(['email', 'emailid']), phone: col(['phone', 'mobile', 'mobileno']), shift: col(['shift', 'shiftno', 'slot']) };
  if (idx.roll < 0 || idx.name < 0) throw new HttpError(400, 'CSV needs rollNo and name columns (optional: email, phone, shift)');
  const errors = [];
  const docs = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const line = i + 2;
    const rollNo = r[idx.roll];
    const name = r[idx.name];
    if (!rollNo || !name) return errors.push(`Line ${line}: rollNo and name are required`);
    if (seen.has(rollNo)) return errors.push(`Line ${line}: duplicate roll number ${rollNo}`);
    seen.add(rollNo);
    const raw = idx.shift >= 0 ? r[idx.shift] : '';
    let shift = booking.shifts.length === 1 && !raw ? booking.shifts[0] : null;
    if (raw) shift = booking.shifts.find((s, n) => String(n + 1) === raw || s.label.toLowerCase() === raw.toLowerCase()) || null;
    if (!shift) return errors.push(`Line ${line}: shift "${raw}" not found (use the shift number 1-${booking.shifts.length} or its label)`);
    docs.push({ booking: booking._id, shiftId: shift._id, rollNo, name, email: idx.email >= 0 ? r[idx.email] : '', phone: idx.phone >= 0 ? r[idx.phone] : '' });
  });
  if (errors.length) throw new HttpError(400, `${errors.length} row(s) have problems`, errors.slice(0, 50));
  if (!docs.length) throw new HttpError(400, 'No candidate rows found');

  const existing = replace ? [] : await Candidate.find({ booking: booking._id }).select('rollNo shiftId').lean();
  const finalByRoll = new Map(existing.map((c) => [c.rollNo, String(c.shiftId)]));
  for (const d of docs) finalByRoll.set(d.rollNo, String(d.shiftId));
  for (const s of booking.shifts) {
    const n = [...finalByRoll.values()].filter((id) => id === String(s._id)).length;
    if (n > s.candidates) throw new HttpError(400, `Shift ${s.label || s.date} would have ${n} candidates but only ${s.candidates} were booked`);
  }
  if (replace) await Candidate.deleteMany({ booking: booking._id });
  const previousShift = new Map(existing.map((c) => [c.rollNo, String(c.shiftId)]));
  await Candidate.bulkWrite(
    docs.map((d) => {
      const keepSeat = previousShift.get(d.rollNo) === String(d.shiftId);
      return { updateOne: { filter: { booking: d.booking, rollNo: d.rollNo }, update: { $set: keepSeat ? d : { ...d, lab: null, seatNo: '' } }, upsert: true } };
    }),
  );
  booking.timeline.push(event(req.user, 'candidates_uploaded', `${docs.length} candidate(s)${replace ? ' (replaced list)' : ''}`));
  await booking.save();
  res.status(201).json({ imported: docs.length, total: await Candidate.countDocuments({ booking: booking._id }) });
});

router.post('/:id/seat-plan', async (req, res) => {
  const { booking, center } = await loadBooking(req);
  assertAllowed('seatPlan', req.user, booking, { center });
  const candidates = await Candidate.find({ booking: booking._id }).lean();
  if (!candidates.length) throw new HttpError(400, 'Upload candidates first');
  const allocations = await LabAllocation.find({ booking: booking._id }).populate('lab', 'code name').lean();
  const { updates, unseated } = buildSeatPlan(candidates, allocations);
  if (updates.length) await Candidate.bulkWrite(updates.map((u) => ({ updateOne: { filter: { _id: u._id }, update: { $set: { lab: u.lab, seatNo: u.seatNo } } } })));
  booking.timeline.push(event(req.user, 'seat_plan', `${updates.length} seated${unseated.length ? `, ${unseated.length} without seat` : ''}`));
  await booking.save();
  res.json({ seated: updates.length, unseated });
});

router.get('/:id/candidates.csv', async (req, res) => {
  const { booking } = await loadBooking(req);
  const candidates = await Candidate.find({ booking: booking._id }).populate('lab', 'name code').sort({ rollNo: 1 }).lean();
  const shiftById = new Map(booking.shifts.map((s, i) => [String(s._id), { ...s.toObject(), n: i + 1 }]));
  const rows = candidates.map((c) => {
    const s = shiftById.get(String(c.shiftId)) || {};
    return [c.rollNo, c.name, c.email, c.phone, s.n, s.date, `${s.startTime}-${s.endTime}`, c.lab?.name || '', c.seatNo];
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${booking.bookingNo}-seat-plan.csv"`);
  res.send(toCsv(['Roll No', 'Name', 'Email', 'Phone', 'Shift', 'Date', 'Time', 'Lab', 'Seat'], rows));
});

export default router;
