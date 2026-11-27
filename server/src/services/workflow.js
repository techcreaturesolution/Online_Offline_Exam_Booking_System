import { ROLES } from '../models/roles.js';
import { todayIso } from '../utils/time.js';

const same = (a, b) => a != null && b != null && String(a?._id || a) === String(b?._id || b);
const inCenters = (user, booking) => (user.centers || []).some((c) => same(c, booking.center));

const OPEN = ['requested', 'confirmed', 'ready'];

export function isOwnInstitute(user, booking) {
  return user.role === ROLES.INSTITUTE && same(user.organization, booking.institute);
}

export function isCenterIncharge(user, booking) {
  return user.role === ROLES.CENTER && inCenters(user, booking);
}

export function isNetworkAdmin(user, booking) {
  return user.role === ROLES.NETWORK && inCenters(user, booking);
}

export function isAssignedAgency(user, booking) {
  return user.role === ROLES.AGENCY && same(user.organization, booking.agency);
}

/** Who may allocate labs: Network Admin for online exams, Center In-Charge for offline exams. */
export function allocatorRole(mode) {
  return mode === 'online' ? ROLES.NETWORK : ROLES.CENTER;
}

export function readinessKinds(mode) {
  return mode === 'online' ? ['network', 'center'] : ['center'];
}

/**
 * Returns null when the action is allowed, otherwise a reason string.
 */
export function denyReason(action, user, booking, ctx = {}) {
  const admin = user.role === ROLES.SUPER_ADMIN;
  const status = booking.status;
  const online = booking.mode === 'online';
  const today = ctx.today || todayIso();
  const dates = booking.shifts.map((s) => s.date).sort();
  const mock = booking.mock;
  switch (action) {
    case 'edit':
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the exam conducting agency that created this exam can edit it';
      if (status !== 'requested' || ctx.hasAllocations) return 'Bookings can be edited only before labs are allocated';
      return null;
    case 'allocate':
      if (!admin && !(online ? isNetworkAdmin(user, booking) : isCenterIncharge(user, booking))) {
        return online ? 'Only the Network Admin of this center allocates labs for online exams' : 'Only the Center In-Charge allocates halls for offline exams';
      }
      if (!['requested', 'confirmed'].includes(status)) return 'Allocation is locked once the center is ready';
      return null;
    case 'assignAgency':
      if (!admin) return 'Only the Super Admin can change the exam conducting agency';
      if (!OPEN.includes(status)) return 'Agency can be changed only before the exam starts';
      return null;
    case 'readiness:network':
      if (!online) return 'Offline exams have no network readiness check';
      if (!admin && !isNetworkAdmin(user, booking)) return 'Only the Network Admin of this center completes the network checklist';
      if (!['confirmed', 'ready'].includes(status)) return 'Readiness checks open after the booking is confirmed';
      return null;
    case 'readiness:center':
      if (!admin && !isCenterIncharge(user, booking)) return 'Only the Center In-Charge completes the center checklist';
      if (!['confirmed', 'ready'].includes(status)) return 'Readiness checks open after the booking is confirmed';
      return null;
    case 'start':
      if (!admin && !isAssignedAgency(user, booking) && !isCenterIncharge(user, booking)) return 'Only the assigned agency or Center In-Charge can start the exam';
      if (status !== 'ready') return 'All readiness checklists must be completed before the exam starts';
      if (!booking.agency) return 'Assign an exam conducting agency first';
      if (today > dates[dates.length - 1]) return `The exam dates have passed (last date ${dates[dates.length - 1]})`;
      if (!dates.includes(today)) return `The exam can be started only on its exam date (${dates.find((d) => d > today)})`;
      return null;
    case 'attendance':
      if (!admin && !isAssignedAgency(user, booking) && !isCenterIncharge(user, booking)) return 'Only the agency or Center In-Charge records attendance';
      if (status !== 'in_progress') return 'Attendance is recorded while the exam is in progress';
      if (!admin && !dates.includes(today)) return 'Attendance is recorded on the exam date';
      return null;
    case 'mockRequest':
      if (!online) return 'Mock day is available for online exams';
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the exam conducting agency requests a mock day';
      if (!OPEN.includes(status)) return 'Mock day can be planned only before the exam starts';
      if (mock?.status === 'completed') return 'Mock day is already completed';
      if (today >= dates[0]) return 'Mock day must be before the exam date';
      return null;
    case 'mockAllocate':
      if (!online) return 'Mock day is available for online exams';
      if (!admin && !isNetworkAdmin(user, booking)) return 'Only the Network Admin of this center allocates mock day labs';
      if (!OPEN.includes(status)) return 'Mock day can be planned only before the exam starts';
      if (!mock || !['requested', 'approved'].includes(mock.status)) return 'Mock day labs are allocated after a mock day is requested';
      return null;
    case 'mockResult':
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the assigned agency records the mock day result';
      if (mock?.status !== 'approved') return 'Mock day needs lab allocation first';
      if (today < mock.date) return `Mock day result can be recorded on or after ${mock.date}`;
      return null;
    case 'incident':
      if (!admin && !isAssignedAgency(user, booking) && !isCenterIncharge(user, booking) && !(online && isNetworkAdmin(user, booking))) {
        return 'Only center staff or the agency can report incidents';
      }
      if (!['confirmed', 'ready', 'in_progress', 'completed'].includes(status)) return 'Incidents can be reported once the booking is confirmed';
      return null;
    case 'complete':
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the assigned agency can mark the exam completed';
      if (status !== 'in_progress') return 'Only an exam in progress can be completed';
      if (booking.shifts.some((s) => s.attendance?.present == null)) return 'Record attendance for every shift first';
      return null;
    case 'cancel':
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the exam conducting agency can cancel this exam';
      if (!OPEN.includes(status)) return 'Only bookings that have not started can be cancelled';
      return null;
    case 'billing':
      if (!admin && !isAssignedAgency(user, booking)) return 'Only the exam conducting agency or Super Admin manages billing';
      if (status === 'cancelled') return 'Booking is cancelled';
      return null;
    case 'feedback':
      if (!isOwnInstitute(user, booking)) return 'Only the booking institute can rate the center';
      if (status !== 'completed') return 'Feedback opens after the exam is completed';
      return null;
    default:
      return 'Unknown action';
  }
}

export function allowedActions(user, booking, ctx = {}) {
  const actions = ['edit', 'allocate', 'assignAgency', 'readiness:network', 'readiness:center', 'start', 'attendance', 'incident', 'complete', 'cancel', 'billing', 'feedback', 'mockRequest', 'mockAllocate', 'mockResult'];
  return actions.filter((a) => denyReason(a, user, booking, ctx) === null);
}
