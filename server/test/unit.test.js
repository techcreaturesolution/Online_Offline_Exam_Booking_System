import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usableSeats } from '../src/models/Lab.js';
import { firstFreeRange, suggestPlan, takenSeats, validatePlan } from '../src/services/allocation.js';
import { attendanceCounts } from '../src/services/counts.js';
import { bookingCounts, computeUtilization } from '../src/services/utilization.js';
import { allocatorRole, denyReason, reviewerRole } from '../src/services/workflow.js';
import { parseCsv, toCsv } from '../src/utils/csv.js';
import { overlaps } from '../src/utils/time.js';

const C = 'c'.repeat(24);
const I = 'i'.repeat(24);
const V = 'v'.repeat(24);
const A = 'a'.repeat(24);
const user = (role, extra = {}) => ({ _id: 'u', role, centers: [], organization: null, ...extra });
const booking = (extra = {}) => ({ mode: 'online', status: 'requested', center: C, institute: I, agency: A, shifts: [{ candidates: 10, attendance: { present: null } }], ...extra });

test('time windows overlap only when they share minutes', () => {
  assert.equal(overlaps('09:00', '12:00', '11:59', '13:00'), true);
  assert.equal(overlaps('09:00', '12:00', '12:00', '13:00'), false);
  assert.equal(overlaps('14:00', '15:00', '09:00', '12:00'), false);
});

test('usable seats respect working systems and buffer seats', () => {
  assert.equal(usableSeats({ type: 'computer_lab', capacity: 120, systemsWorking: 116, bufferSeats: 6 }), 110);
  assert.equal(usableSeats({ type: 'exam_hall', capacity: 200, systemsWorking: 0, bufferSeats: 10 }), 190);
});

test('online labs are allocated by the Network Admin and verified by the Booking Vendor', () => {
  assert.equal(allocatorRole('online'), 'network_admin');
  assert.equal(reviewerRole('online'), 'booking_vendor');
  assert.equal(allocatorRole('offline'), 'center_incharge');
  assert.equal(reviewerRole('offline'), 'institute_admin');
  const net = user('network_admin', { centers: [C] });
  const inch = user('center_incharge', { centers: [C] });
  assert.equal(denyReason('allocate', net, booking()), null);
  assert.match(denyReason('allocate', inch, booking()), /Network Admin/);
  assert.equal(denyReason('allocate', inch, booking({ mode: 'offline' })), null);
  assert.match(denyReason('allocate', net, booking({ mode: 'offline' })), /Center In-Charge/);
  assert.match(denyReason('allocate', user('network_admin', { centers: ['x'.repeat(24)] }), booking()), /Network Admin/);
  assert.match(denyReason('allocate', net, booking({ status: 'confirmed' })), /locked/);
});

test('only the center vendor reviews online allocations; the institute reviews offline ones', () => {
  const vendor = user('booking_vendor', { organization: V });
  const center = { vendor: V };
  assert.equal(denyReason('review', vendor, booking({ status: 'allocated' }), { center }), null);
  assert.match(denyReason('review', vendor, booking({ status: 'allocated' }), { center: { vendor: 'z'.repeat(24) } }), /Booking Vendor/);
  assert.match(denyReason('review', vendor, booking({ status: 'requested' }), { center }), /completed/);
  const inst = user('institute_admin', { organization: I });
  assert.equal(denyReason('review', inst, booking({ status: 'allocated', mode: 'offline' })), null);
  assert.match(denyReason('review', inst, booking({ status: 'allocated' })), /Booking Vendor/);
});

test('readiness, start and completion follow the role and status rules', () => {
  const net = user('network_admin', { centers: [C] });
  const agency = user('exam_agency', { organization: A });
  assert.match(denyReason('readiness:network', net, booking({ mode: 'offline', status: 'confirmed' })), /Offline/);
  assert.equal(denyReason('readiness:network', net, booking({ status: 'confirmed' })), null);
  assert.match(denyReason('start', agency, booking({ status: 'confirmed' })), /readiness/);
  assert.equal(denyReason('start', agency, booking({ status: 'ready', shifts: [{ date: '2030-05-10', candidates: 5 }] }), { today: '2030-05-10' }), null);
  assert.match(denyReason('start', agency, booking({ status: 'ready', agency: 'z'.repeat(24) })), /agency/);
  assert.match(denyReason('complete', agency, booking({ status: 'in_progress' })), /attendance/);
  assert.equal(denyReason('complete', agency, booking({ status: 'in_progress', shifts: [{ candidates: 10, attendance: { present: 9 } }] })), null);
  assert.match(denyReason('cancel', agency, booking()), /institute/);
});

test('takenSeats counts overlapping allocations and ignores the shift being edited', () => {
  const allocs = [
    { lab: 'L1', booking: 'b1', shiftId: 's1', startTime: '09:00', endTime: '12:00', seats: 50 },
    { lab: 'L1', booking: 'b2', shiftId: 's2', startTime: '11:00', endTime: '13:00', seats: 20 },
    { lab: 'L1', booking: 'b3', shiftId: 's3', startTime: '14:00', endTime: '16:00', seats: 99 },
  ];
  assert.equal(takenSeats(allocs, { startTime: '10:00', endTime: '12:00' }).get('L1'), 70);
  assert.equal(takenSeats(allocs, { startTime: '10:00', endTime: '12:00', ignore: { booking: 'b1', shiftId: 's1' } }).get('L1'), 20);
});

test('takenSeats uses peak concurrent seats, not the sum of back-to-back allocations', () => {
  const allocs = [
    { lab: 'L1', booking: 'b1', shiftId: 's1', startTime: '09:00', endTime: '11:00', seats: 100 },
    { lab: 'L1', booking: 'b2', shiftId: 's2', startTime: '11:00', endTime: '13:00', seats: 100 },
  ];
  assert.equal(takenSeats(allocs, { startTime: '09:00', endTime: '13:00' }).get('L1'), 100);
});

test('suggestPlan picks the tightest single lab, otherwise fills the largest labs', () => {
  const labs = [
    { _id: 'A', free: 110, blocked: false },
    { _id: 'B', free: 76, blocked: false },
    { _id: 'C', free: 55, blocked: true },
  ];
  assert.deepEqual(suggestPlan(labs, 70).items, [{ lab: 'B', seats: 70 }]);
  assert.deepEqual(suggestPlan(labs, 150), { items: [{ lab: 'A', seats: 110 }, { lab: 'B', seats: 40 }], shortfall: 0 });
  assert.equal(suggestPlan(labs, 300).shortfall, 114);
});

test('validatePlan rejects over-allocation, blocked labs and duplicate labs', () => {
  const labs = [
    { _id: 'A', code: 'LAB-A', free: 50, blocked: false },
    { _id: 'B', code: 'LAB-B', free: 0, blocked: true },
  ];
  const shift = { date: '2030-01-01', startTime: '09:00', endTime: '10:00', candidates: 40 };
  assert.equal(validatePlan([{ lab: 'A', seats: 40 }], labs, shift), 40);
  assert.throws(() => validatePlan([{ lab: 'A', seats: 60 }], labs, { ...shift, candidates: 100 }), /only 50 free/);
  assert.throws(() => validatePlan([{ lab: 'B', seats: 1 }], labs, shift), /maintenance/);
  assert.throws(() => validatePlan([{ lab: 'A', seats: 20 }, { lab: 'A', seats: 20 }], labs, shift), /twice/);
  assert.throws(() => validatePlan([{ lab: 'A', seats: 45 }], labs, shift), /only 40 candidates/);
  assert.throws(() => validatePlan([{ lab: 'Z', seats: 1 }], labs, shift), /does not belong/);
});

test('utilization compares allocated seat-hours with open capacity', () => {
  const labs = [{ _id: 'L1', center: 'C1', name: 'Lab', code: 'L1', type: 'computer_lab', capacity: 100, systemsWorking: 100, bufferSeats: 0, status: 'active', maintenanceBlocks: [{ from: '2030-01-02', to: '2030-01-02' }] }];
  const centers = [{ _id: 'C1', name: 'Center', openTime: '08:00', closeTime: '18:00' }];
  const allocations = [{ lab: 'L1', shiftId: 'S1', date: '2030-01-01', startTime: '10:00', endTime: '15:00', seats: 100 }];
  const bookings = [{ shifts: [{ _id: 'S1', candidates: 100, attendance: { present: 80 } }] }];
  const r = computeUtilization({ labs, centers, allocations, bookings, from: '2030-01-01', to: '2030-01-02' });
  assert.equal(r.labs[0].openDays, 1);
  assert.equal(r.labs[0].capacitySeatHours, 1000);
  assert.equal(r.labs[0].utilization, 50);
  assert.equal(r.labs[0].attendedUtilization, 40);
  assert.equal(r.centers[0].utilization, 50);
  assert.deepEqual(r.daily.map((d) => d.seats), [100, 0]);
});

test('bookingCounts totals candidates and attendance, skipping cancelled bookings', () => {
  const r = bookingCounts([
    { status: 'completed', mode: 'online', shifts: [{ candidates: 100, attendance: { present: 90, absent: 10 } }] },
    { status: 'cancelled', mode: 'offline', shifts: [{ candidates: 50 }] },
    { status: 'in_progress', mode: 'offline', shifts: [{ candidates: 30, attendance: {} }], incidents: [{ resolved: false }] },
  ]);
  assert.equal(r.candidates, 130);
  assert.equal(r.present, 90);
  assert.equal(r.pendingAttendance, 30);
  assert.equal(r.attendanceRate, 90);
  assert.equal(r.openIncidents, 1);
  assert.deepEqual(r.byMode, { online: 1, offline: 2 });
});

test('CSV helpers round-trip quotes and neutralise formulas', () => {
  assert.deepEqual(parseCsv('rollNo,name\r\n1,"Shah, Ravi"\n2,"A ""B"""\n'), [['rollNo', 'name'], ['1', 'Shah, Ravi'], ['2', 'A "B"']]);
  assert.throws(() => parseCsv('rollNo,name\n1,"Shah\n2,Patel\n'), /unclosed quote/);
  assert.equal(toCsv(['a'], [['=SUM(1)']]), "a\r\n'=SUM(1)");
});

test('overlapping exams in one lab get separate seat ranges', () => {
  assert.equal(firstFreeRange([], 40, 100), 1);
  assert.equal(firstFreeRange([{ seatFrom: 1, seats: 40 }], 30, 100), 41);
  assert.equal(firstFreeRange([{ seatFrom: 41, seats: 20 }], 40, 100), 1);
  assert.equal(firstFreeRange([{ seatFrom: 31, seats: 20 }], 40, 100), 51);
  assert.equal(firstFreeRange([{ seatFrom: 31, seats: 40 }], 40, 100), null);
});

test('exam start and attendance are allowed only on the exam date', () => {
  const agency = user('exam_agency', { organization: A });
  const b = booking({ status: 'ready', shifts: [{ date: '2030-05-10', candidates: 10, attendance: { present: null } }] });
  assert.match(denyReason('start', agency, b, { today: '2030-05-09' }), /only on its exam date/);
  assert.equal(denyReason('start', agency, b, { today: '2030-05-10' }), null);
  assert.match(denyReason('start', agency, b, { today: '2030-05-11' }), /passed/);
  const split = booking({ status: 'ready', shifts: [{ date: '2030-05-10', candidates: 5 }, { date: '2030-05-14', candidates: 5 }] });
  assert.match(denyReason('start', agency, split, { today: '2030-05-12' }), /2030-05-14/);
  const live = { ...b, status: 'in_progress' };
  assert.equal(denyReason('attendance', agency, live, { today: '2030-05-10' }), null);
  assert.match(denyReason('attendance', agency, live, { today: '2030-05-12' }), /exam date/);
});

test('attendanceCounts totals classrooms by block and for the center', () => {
  const allocs = [
    { seats: 40, present: 35, lab: { _id: 'r1', code: 'CR-101', name: 'Room 101', block: 'Block A' } },
    { seats: 30, present: 30, lab: { _id: 'r2', code: 'CR-102', name: 'Room 102', block: 'Block A' } },
    { seats: 20, present: null, lab: { _id: 'r3', code: 'HALL-1', name: 'Hall', block: '' } },
  ];
  const c = attendanceCounts(allocs);
  assert.deepEqual(c.classrooms.map((r) => [r.code, r.allocated, r.present, r.absent]), [['CR-101', 40, 35, 5], ['CR-102', 30, 30, 0], ['HALL-1', 20, null, null]]);
  assert.deepEqual(c.blocks.map((b) => [b.block, b.allocated, b.present, b.absent]), [['Block A', 70, 65, 5], ['No block', 20, 0, 0]]);
  assert.deepEqual(c.total, { allocated: 90, present: 65, absent: 5, pending: 1 });
});
