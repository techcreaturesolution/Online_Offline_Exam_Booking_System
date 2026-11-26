import { Lab, isBlocked, labMode, usableSeats } from '../models/Lab.js';
import { LabAllocation } from '../models/LabAllocation.js';
import { HttpError } from '../utils/httpError.js';
import { overlaps, toMinutes } from '../utils/time.js';

/** Peak seats already taken in each lab during a time window, ignoring one booking shift (the one being edited). */
export function takenSeats(allocations, { startTime, endTime, ignore }) {
  const byLab = new Map();
  for (const a of allocations) {
    if (ignore && String(a.booking) === String(ignore.booking) && String(a.shiftId) === String(ignore.shiftId)) continue;
    if (!overlaps(a.startTime, a.endTime, startTime, endTime)) continue;
    const key = String(a.lab);
    if (!byLab.has(key)) byLab.set(key, []);
    byLab.get(key).push(a);
  }
  const taken = new Map();
  for (const [key, list] of byLab) {
    const points = [startTime, ...list.map((a) => a.startTime)].map(toMinutes).filter((m) => m >= toMinutes(startTime) && m < toMinutes(endTime));
    let peak = 0;
    for (const m of points) {
      const used = list.filter((a) => toMinutes(a.startTime) <= m && m < toMinutes(a.endTime)).reduce((n, a) => n + a.seats, 0);
      peak = Math.max(peak, used);
    }
    taken.set(key, peak);
  }
  return taken;
}

export function describeLab(lab, taken, date) {
  const usable = usableSeats(lab);
  const used = taken.get(String(lab._id)) || 0;
  const blocked = lab.status !== 'active' || isBlocked(lab, date);
  return {
    _id: lab._id,
    name: lab.name,
    code: lab.code,
    type: lab.type,
    mode: labMode(lab),
    floor: lab.floor,
    capacity: lab.capacity,
    systemsWorking: lab.systemsWorking,
    bufferSeats: lab.bufferSeats,
    usable,
    used,
    free: blocked ? 0 : Math.max(0, usable - used),
    blocked,
    status: lab.status,
  };
}

export async function availability({ center, date, startTime, endTime, mode, ignore }) {
  const labs = await Lab.find({ center, status: { $ne: 'inactive' } }).sort({ code: 1 }).lean();
  const allocations = await LabAllocation.find({ center, date }).lean();
  const taken = takenSeats(allocations, { startTime, endTime, ignore });
  return labs.filter((l) => !mode || labMode(l) === mode).map((l) => describeLab(l, taken, date));
}

/** Best fit: one lab that fits everyone if possible, otherwise fill the largest free labs first. */
export function suggestPlan(labs, needed) {
  const open = labs.filter((l) => !l.blocked && l.free > 0);
  const single = open.filter((l) => l.free >= needed).sort((a, b) => a.free - b.free)[0];
  if (single) return { items: [{ lab: single._id, seats: needed }], shortfall: 0 };
  const items = [];
  let left = needed;
  for (const l of [...open].sort((a, b) => b.free - a.free)) {
    if (left <= 0) break;
    const seats = Math.min(l.free, left);
    items.push({ lab: l._id, seats });
    left -= seats;
  }
  return { items, shortfall: Math.max(0, left) };
}

export function validatePlan(items, labs, shift) {
  const byId = new Map(labs.map((l) => [String(l._id), l]));
  const seen = new Set();
  let total = 0;
  for (const it of items) {
    const lab = byId.get(String(it.lab));
    if (!lab) throw new HttpError(400, 'Lab does not belong to this center or does not match the exam mode');
    if (seen.has(String(it.lab))) throw new HttpError(400, `Lab ${lab.code} is listed twice`);
    seen.add(String(it.lab));
    if (lab.blocked) throw new HttpError(409, `Lab ${lab.code} is under maintenance or inactive on ${shift.date}`);
    if (it.seats > lab.free) throw new HttpError(409, `Lab ${lab.code} has only ${lab.free} free seats for ${shift.date} ${shift.startTime}-${shift.endTime}`);
    total += it.seats;
  }
  if (total > shift.candidates) throw new HttpError(400, `Allocated ${total} seats but the shift has only ${shift.candidates} candidates`);
  return total;
}

export async function allocationSummary(booking) {
  const allocations = await LabAllocation.find({ booking: booking._id }).populate('lab', 'name code type floor').lean();
  const shifts = booking.shifts.map((s) => {
    const list = allocations.filter((a) => String(a.shiftId) === String(s._id));
    const seats = list.reduce((n, a) => n + a.seats, 0);
    return { shiftId: s._id, seats, candidates: s.candidates, covered: seats >= s.candidates, allocations: list };
  });
  return { shifts, complete: shifts.every((s) => s.covered), totalSeats: shifts.reduce((n, s) => n + s.seats, 0) };
}
