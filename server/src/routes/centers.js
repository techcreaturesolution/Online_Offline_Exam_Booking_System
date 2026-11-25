import { Router } from 'express';
import { z } from 'zod';
import { requireRoles } from '../middleware/auth.js';
import { Booking } from '../models/Booking.js';
import { Center } from '../models/Center.js';
import { Lab, labMode, usableSeats } from '../models/Lab.js';
import { LabAllocation } from '../models/LabAllocation.js';
import { Organization } from '../models/Organization.js';
import { ROLES } from '../models/roles.js';
import { assertCanManageLab, centerScope, managesCenter } from '../services/access.js';
import { availability } from '../services/allocation.js';
import { HttpError } from '../utils/httpError.js';
import { DATE_RE, TIME_RE, addDays, todayIso } from '../utils/time.js';

const router = Router();
const time = z.string().regex(TIME_RE, 'Use HH:MM');
const date = z.string().regex(DATE_RE, 'Use YYYY-MM-DD');

const centerSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).max(20),
  address: z.string().trim().optional().default(''),
  city: z.string().trim().min(2),
  state: z.string().trim().min(2),
  pincode: z.string().trim().optional().default(''),
  modes: z.array(z.enum(['online', 'offline'])).min(1),
  facilities: z.array(z.string().trim()).optional().default([]),
  openTime: time.default('08:00'),
  closeTime: time.default('20:00'),
  ratePerSeat: z.object({ online: z.number().min(0).default(0), offline: z.number().min(0).default(0) }).optional(),
  vendor: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
  active: z.boolean().optional(),
});

function checkHours(c) {
  if (c.openTime >= c.closeTime) throw new HttpError(400, 'Closing time must be after opening time');
}

const INCHARGE_FIELDS = ['address', 'pincode', 'facilities', 'openTime', 'closeTime'];

function summarize(center, labs) {
  const mine = labs.filter((l) => String(l.center) === String(center._id) && l.status !== 'inactive');
  const sum = (mode) => mine.filter((l) => labMode(l) === mode && l.status === 'active').reduce((n, l) => n + usableSeats(l), 0);
  return { ...center, labCount: mine.length, seats: { online: sum('online'), offline: sum('offline') } };
}

async function loadCenter(id) {
  const center = await Center.findById(id).populate('vendor', 'name').lean();
  if (!center) throw new HttpError(404, 'Center not found');
  return center;
}

router.get('/centers', async (req, res) => {
  const filter = await centerScope(req.user);
  if (req.user.role !== ROLES.SUPER_ADMIN) filter.active = true;
  if (req.query.mode) filter.modes = String(req.query.mode);
  if (req.query.city) filter.city = new RegExp(`^${String(req.query.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const centers = await Center.find(filter).populate('vendor', 'name').sort({ name: 1 }).lean();
  const labs = await Lab.find({ center: { $in: centers.map((c) => c._id) } }).lean();
  res.json({ centers: centers.map((c) => summarize(c, labs)) });
});

router.post('/centers', requireRoles(ROLES.SUPER_ADMIN), async (req, res) => {
  const body = centerSchema.parse(req.body);
  checkHours(body);
  if (body.vendor && !(await Organization.exists({ _id: body.vendor, kind: 'vendor' }))) throw new HttpError(400, 'Vendor not found');
  if (await Center.exists({ code: body.code.toUpperCase() })) throw new HttpError(409, 'Center code already exists');
  res.status(201).json({ center: await Center.create(body) });
});

router.get('/centers/:id', async (req, res) => {
  const center = await loadCenter(req.params.id);
  const labs = await Lab.find({ center: center._id }).sort({ code: 1 }).lean();
  res.json({ center: summarize(center, labs), labs: labs.map((l) => ({ ...l, mode: labMode(l), usable: usableSeats(l) })), canManage: managesCenter(req.user, center._id) });
});

router.put('/centers/:id', async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) throw new HttpError(404, 'Center not found');
  const body = centerSchema.partial().parse(req.body);
  if (req.user.role === ROLES.SUPER_ADMIN) {
    if (body.vendor && !(await Organization.exists({ _id: body.vendor, kind: 'vendor' }))) throw new HttpError(400, 'Vendor not found');
    Object.assign(center, body);
  } else if (req.user.role === ROLES.CENTER && managesCenter(req.user, center._id)) {
    for (const k of INCHARGE_FIELDS) if (body[k] !== undefined) center[k] = body[k];
  } else throw new HttpError(403, 'Only the Super Admin or this center\'s In-Charge can edit the center');
  checkHours(center);
  await center.save();
  res.json({ center });
});

const labSchema = z.object({
  name: z.string().trim().min(1),
  code: z.string().trim().min(1).max(20),
  type: z.enum(['computer_lab', 'exam_hall', 'classroom']),
  floor: z.string().trim().optional().default(''),
  capacity: z.number().int().min(1).max(5000),
  systemsTotal: z.number().int().min(0).optional().default(0),
  systemsWorking: z.number().int().min(0).optional().default(0),
  bufferSeats: z.number().int().min(0).optional().default(0),
  bandwidthMbps: z.number().min(0).optional().default(0),
  status: z.enum(['active', 'maintenance', 'inactive']).optional(),
  notes: z.string().optional().default(''),
});

function checkLab(lab) {
  if (lab.systemsWorking > lab.systemsTotal) throw new HttpError(400, 'Working systems cannot exceed total systems');
  if (lab.type === 'computer_lab' && lab.systemsTotal < 1) throw new HttpError(400, 'Computer labs need the number of systems');
  if (lab.bufferSeats >= lab.capacity) throw new HttpError(400, 'Buffer seats must be fewer than capacity');
}

router.post('/centers/:id/labs', async (req, res) => {
  const center = await loadCenter(req.params.id);
  const body = labSchema.parse(req.body);
  assertCanManageLab(req.user, center._id, body.type);
  checkLab(body);
  if (await Lab.exists({ center: center._id, code: body.code.toUpperCase() })) throw new HttpError(409, 'Lab code already exists in this center');
  res.status(201).json({ lab: await Lab.create({ ...body, center: center._id }) });
});

async function loadLabForEdit(req) {
  const lab = await Lab.findById(req.params.labId);
  if (!lab) throw new HttpError(404, 'Lab not found');
  assertCanManageLab(req.user, lab.center, lab.type);
  return lab;
}

router.put('/labs/:labId', async (req, res) => {
  const lab = await loadLabForEdit(req);
  const body = labSchema.partial().parse(req.body);
  if (body.type && body.type !== lab.type) assertCanManageLab(req.user, lab.center, body.type);
  Object.assign(lab, body);
  checkLab(lab);
  await lab.save();
  res.json({ lab });
});

router.post('/labs/:labId/blocks', async (req, res) => {
  const lab = await loadLabForEdit(req);
  const body = z.object({ from: date, to: date, reason: z.string().trim().min(2) }).parse(req.body);
  if (body.to < body.from) throw new HttpError(400, 'End date is before start date');
  const clash = await LabAllocation.findOne({ lab: lab._id, date: { $gte: body.from, $lte: body.to } }).lean();
  if (clash) throw new HttpError(409, `Lab is already allocated on ${clash.date}; release that booking first`);
  lab.maintenanceBlocks.push(body);
  await lab.save();
  res.status(201).json({ lab });
});

router.delete('/labs/:labId/blocks/:blockId', async (req, res) => {
  const lab = await loadLabForEdit(req);
  lab.maintenanceBlocks.pull({ _id: req.params.blockId });
  await lab.save();
  res.json({ lab });
});

router.get('/centers/:id/availability', async (req, res) => {
  const q = z
    .object({ date, startTime: time, endTime: time, mode: z.enum(['online', 'offline']).optional(), booking: z.string().optional(), shiftId: z.string().optional() })
    .parse(req.query);
  const ignore = q.booking && q.shiftId ? { booking: q.booking, shiftId: q.shiftId } : null;
  res.json({ labs: await availability({ center: req.params.id, ...q, ignore }) });
});

router.get('/centers/:id/schedule', async (req, res) => {
  const from = DATE_RE.test(req.query.from || '') ? req.query.from : todayIso();
  const to = DATE_RE.test(req.query.to || '') ? req.query.to : addDays(from, 13);
  const allocations = await LabAllocation.find({ center: req.params.id, date: { $gte: from, $lte: to } })
    .populate('lab', 'name code type')
    .sort({ date: 1, startTime: 1 })
    .lean();
  const bookings = await Booking.find({ _id: { $in: allocations.map((a) => a.booking) } }).select('bookingNo examName status mode institute').populate('institute', 'name').lean();
  const byId = new Map(bookings.map((b) => [String(b._id), b]));
  const hideNames = req.user.role === ROLES.INSTITUTE;
  res.json({
    from,
    to,
    allocations: allocations.map((a) => {
      const b = byId.get(String(a.booking));
      const own = b && String(b.institute?._id) === String(req.user.organization);
      return { ...a, booking: hideNames && !own ? { status: b?.status } : b };
    }),
  });
});

export default router;
