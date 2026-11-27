import { Router } from 'express';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Lab } from '../models/Lab.js';
import { LabAllocation } from '../models/LabAllocation.js';
import { ROLES } from '../models/roles.js';
import { bookingScope, centerScope } from '../services/access.js';
import { attendanceCounts } from '../services/counts.js';
import { bookingCounts, computeUtilization } from '../services/utilization.js';
import { toCsv } from '../utils/csv.js';
import { HttpError } from '../utils/httpError.js';
import { DATE_RE, addDays, todayIso } from '../utils/time.js';

const router = Router();

function range(q) {
  const to = DATE_RE.test(q.to || '') ? q.to : addDays(todayIso(), 30);
  const from = DATE_RE.test(q.from || '') ? q.from : addDays(to, -60);
  if (to < from) throw new HttpError(400, 'End date is before start date');
  if (addDays(from, 366) < to) throw new HttpError(400, 'Choose a range of at most one year');
  return { from, to };
}

/**
 * Lab-owning roles see utilization of their own centers. Institutes and agencies see only the
 * seats their own bookings use, measured against the labs of the centers they booked.
 */
async function utilizationData(user, q) {
  const { from, to } = range(q);
  const bookingFilter = await bookingScope(user);
  let centerFilter = await centerScope(user);
  const ownBookingsOnly = [ROLES.INSTITUTE, ROLES.AGENCY].includes(user.role);
  if (ownBookingsOnly) centerFilter = { _id: { $in: await Booking.distinct('center', bookingFilter) } };
  if (q.center && /^[a-f\d]{24}$/i.test(q.center)) centerFilter = { $and: [centerFilter, { _id: q.center }] };
  const centers = await Center.find(centerFilter).lean();
  const centerIds = centers.map((c) => c._id);
  const labFilter = { center: { $in: centerIds } };
  if (q.mode === 'online') labFilter.type = 'computer_lab';
  if (q.mode === 'offline') labFilter.type = { $ne: 'computer_lab' };
  if (user.role === ROLES.NETWORK) labFilter.type = 'computer_lab';
  const labs = await Lab.find(labFilter).lean();
  const allocFilter = { center: { $in: centerIds }, date: { $gte: from, $lte: to } };
  if (ownBookingsOnly) allocFilter.booking = { $in: await Booking.distinct('_id', bookingFilter) };
  const allocations = await LabAllocation.find(allocFilter).lean();
  const bookings = await Booking.find({ _id: { $in: [...new Set(allocations.map((a) => String(a.booking)))] } }).select('shifts').lean();
  return computeUtilization({ labs, centers, allocations, bookings, from, to });
}

router.get('/dashboard', async (req, res) => {
  const scope = await bookingScope(req.user);
  const bookings = await Booking.find(scope).select('status mode shifts incidents examName bookingNo center institute').populate('center', 'name city').populate('institute', 'name').lean();
  const today = todayIso();
  const weekEnd = addDays(today, 7);
  const upcoming = [];
  for (const b of bookings) {
    if (['cancelled', 'completed'].includes(b.status)) continue;
    for (const s of b.shifts) {
      if (s.date >= today && s.date <= weekEnd) upcoming.push({ booking: b._id, bookingNo: b.bookingNo, examName: b.examName, mode: b.mode, status: b.status, center: b.center?.name, institute: b.institute?.name, ...s });
    }
  }
  upcoming.sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const util = await utilizationData(req.user, { from: today, to: addDays(today, 29) });
  const pending = {
    [ROLES.NETWORK]: { label: 'Awaiting lab allocation', statuses: ['requested'] },
    [ROLES.CENTER]: { label: 'Awaiting allocation or readiness', statuses: ['requested', 'confirmed'] },
    [ROLES.INSTITUTE]: { label: 'Exams in progress', statuses: ['in_progress'] },
    [ROLES.AGENCY]: { label: 'Exams ready to conduct', statuses: ['ready', 'in_progress'] },
    [ROLES.SUPER_ADMIN]: { label: 'Open bookings', statuses: ['requested', 'confirmed', 'ready'] },
  }[req.user.role];
  const actionNeeded = bookings.filter((b) => pending.statuses.includes(b.status) && (!pending.mode || b.mode === pending.mode) && !(req.user.role === ROLES.CENTER && b.status === 'requested' && b.mode === 'online')).length;
  res.json({
    counts: bookingCounts(bookings),
    upcoming: upcoming.slice(0, 20),
    actionNeeded: { label: pending.label, count: actionNeeded },
    utilization30: { totals: util.totals, centers: util.centers, daily: util.daily },
  });
});

router.get('/utilization', async (req, res) => {
  res.json(await utilizationData(req.user, req.query));
});

router.get('/utilization.csv', async (req, res) => {
  const data = await utilizationData(req.user, req.query);
  const rows = data.labs.map((r) => [r.centerName, r.labCode, r.labName, r.type, r.usableSeats, r.openDays, r.sessions, r.capacitySeatHours, r.allocatedSeatHours, r.attendedSeatHours, r.utilization, r.attendedUtilization]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lab-utilization-${data.from}-to-${data.to}.csv"`);
  res.send(toCsv(['Center', 'Lab Code', 'Lab', 'Type', 'Usable Seats', 'Open Days', 'Sessions', 'Capacity Seat-Hours', 'Allocated Seat-Hours', 'Attended Seat-Hours', 'Utilization %', 'Attended Utilization %'], rows));
});

/** Lab planning: every lab allocated to bookings in scope (exam shifts and mock days) with seat ranges. */
router.get('/attendance', async (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : todayIso();
  const bookings = await Booking.find({ ...(await bookingScope(req.user)), status: { $ne: 'cancelled' }, 'shifts.date': date }).select('shifts').lean();
  const allocations = await LabAllocation.find({ booking: { $in: bookings.map((b) => b._id) }, date, kind: { $ne: 'mock' } })
    .populate('lab', 'name code block')
    .populate('center', 'name code city')
    .lean();
  const centers = new Map();
  for (const a of allocations) {
    const key = String(a.center._id);
    if (!centers.has(key)) centers.set(key, { center: a.center, allocations: [] });
    centers.get(key).allocations.push(a);
  }
  const rows = [...centers.values()]
    .map(({ center, allocations: list }) => ({ center, ...attendanceCounts(list) }))
    .sort((x, y) => x.center.name.localeCompare(y.center.name));
  res.json({ date, centers: rows });
});

router.get('/planning', async (req, res) => {
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : todayIso();
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : addDays(from, 60);
  if (to < from) throw new HttpError(400, 'End date is before start date');
  const bookings = await Booking.find({ ...(await bookingScope(req.user)), status: { $ne: 'cancelled' } })
    .select('bookingNo examName mode status shifts mock institute agency')
    .populate('institute', 'name')
    .populate('agency', 'name')
    .lean();
  const byId = new Map(bookings.map((b) => [String(b._id), b]));
  const allocations = await LabAllocation.find({ booking: { $in: bookings.map((b) => b._id) }, date: { $gte: from, $lte: to } })
    .populate('lab', 'name code type floor')
    .populate('center', 'name code')
    .populate('allocatedBy', 'name role')
    .sort({ date: 1, startTime: 1 })
    .lean();
  const rows = allocations.map((a) => {
    const b = byId.get(String(a.booking));
    const shift = b.shifts.find((s) => String(s._id) === String(a.shiftId));
    const seatFrom = a.seatFrom || 1;
    return {
      _id: a._id,
      kind: a.kind || 'exam',
      date: a.date,
      startTime: a.startTime,
      endTime: a.endTime,
      shiftLabel: a.kind === 'mock' ? 'Mock day' : shift?.label || '',
      booking: { _id: b._id, bookingNo: b.bookingNo, examName: b.examName, status: b.status, institute: b.institute?.name, agency: b.agency?.name },
      mockStatus: a.kind === 'mock' ? b.mock?.status || null : null,
      center: a.center,
      lab: a.lab,
      seats: a.seats,
      seatFrom,
      seatTo: seatFrom + a.seats - 1,
      present: a.present,
      allocatedBy: a.allocatedBy,
    };
  });
  res.json({ from, to, rows });
});

export default router;
