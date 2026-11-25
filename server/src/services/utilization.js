import { isBlocked, usableSeats } from '../models/Lab.js';
import { daysBetween, durationHours } from '../utils/time.js';

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

/**
 * Lab utilization over a date range.
 * capacity  = usable seats x center operating hours x days the lab is available
 * allocated = seats x shift hours from lab allocations (bookings that are not cancelled)
 * attended  = allocated seat-hours scaled by the shift's recorded present / candidates ratio
 */
export function computeUtilization({ labs, centers, allocations, bookings, from, to }) {
  const days = daysBetween(from, to);
  const centerById = new Map(centers.map((c) => [String(c._id), c]));
  const shiftById = new Map();
  for (const b of bookings) for (const s of b.shifts) shiftById.set(String(s._id), s);

  const labRows = labs.map((lab) => {
    const center = centerById.get(String(lab.center)) || {};
    const dayHours = durationHours(center.openTime || '08:00', center.closeTime || '20:00');
    const openDays = lab.status === 'active' ? days.filter((d) => !isBlocked(lab, d)).length : 0;
    const capacitySeatHours = usableSeats(lab) * dayHours * openDays;
    let allocatedSeatHours = 0;
    let attendedSeatHours = 0;
    let sessions = 0;
    let seatsAllocated = 0;
    for (const a of allocations) {
      if (String(a.lab) !== String(lab._id)) continue;
      const hours = durationHours(a.startTime, a.endTime);
      allocatedSeatHours += a.seats * hours;
      seatsAllocated += a.seats;
      sessions += 1;
      const shift = shiftById.get(String(a.shiftId));
      if (shift?.attendance?.present != null && shift.candidates > 0) {
        attendedSeatHours += a.seats * hours * Math.min(1, shift.attendance.present / shift.candidates);
      }
    }
    return {
      lab: lab._id,
      labName: lab.name,
      labCode: lab.code,
      type: lab.type,
      center: lab.center,
      centerName: center.name,
      usableSeats: usableSeats(lab),
      openDays,
      sessions,
      seatsAllocated,
      capacitySeatHours: Math.round(capacitySeatHours),
      allocatedSeatHours: Math.round(allocatedSeatHours),
      attendedSeatHours: Math.round(attendedSeatHours),
      utilization: pct(allocatedSeatHours, capacitySeatHours),
      attendedUtilization: pct(attendedSeatHours, capacitySeatHours),
    };
  });

  const centerRows = centers.map((c) => {
    const rows = labRows.filter((r) => String(r.center) === String(c._id));
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    return {
      center: c._id,
      centerName: c.name,
      city: c.city,
      labs: rows.length,
      sessions: sum('sessions'),
      seatsAllocated: sum('seatsAllocated'),
      capacitySeatHours: sum('capacitySeatHours'),
      allocatedSeatHours: sum('allocatedSeatHours'),
      attendedSeatHours: sum('attendedSeatHours'),
      utilization: pct(sum('allocatedSeatHours'), sum('capacitySeatHours')),
      attendedUtilization: pct(sum('attendedSeatHours'), sum('capacitySeatHours')),
    };
  });

  const daily = days.map((d) => {
    const list = allocations.filter((a) => a.date === d);
    return { date: d, seats: list.reduce((n, a) => n + a.seats, 0), seatHours: Math.round(list.reduce((n, a) => n + a.seats * durationHours(a.startTime, a.endTime), 0)) };
  });

  const total = (k) => labRows.reduce((n, r) => n + r[k], 0);
  return {
    from,
    to,
    totals: {
      labs: labRows.length,
      capacitySeatHours: total('capacitySeatHours'),
      allocatedSeatHours: total('allocatedSeatHours'),
      attendedSeatHours: total('attendedSeatHours'),
      utilization: pct(total('allocatedSeatHours'), total('capacitySeatHours')),
      attendedUtilization: pct(total('attendedSeatHours'), total('capacitySeatHours')),
    },
    centers: centerRows,
    labs: labRows,
    daily,
  };
}

export function bookingCounts(bookings) {
  const byStatus = {};
  let candidates = 0;
  let present = 0;
  let absent = 0;
  let pendingAttendance = 0;
  let openIncidents = 0;
  const byMode = { online: 0, offline: 0 };
  for (const b of bookings) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    byMode[b.mode] = (byMode[b.mode] || 0) + 1;
    openIncidents += (b.incidents || []).filter((i) => !i.resolved).length;
    if (b.status === 'cancelled') continue;
    for (const s of b.shifts) {
      candidates += s.candidates;
      if (s.attendance?.present != null) {
        present += s.attendance.present;
        absent += s.attendance.absent || 0;
      } else if (['in_progress', 'completed'].includes(b.status)) pendingAttendance += s.candidates;
    }
  }
  return { total: bookings.length, byStatus, byMode, candidates, present, absent, pendingAttendance, attendanceRate: pct(present, present + absent), openIncidents };
}
