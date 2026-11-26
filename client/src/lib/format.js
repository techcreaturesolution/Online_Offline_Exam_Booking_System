export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  institute_admin: 'University / Institute',
  booking_vendor: 'Booking Vendor',
  network_admin: 'Network Admin',
  center_incharge: 'Center In-Charge',
  exam_agency: 'Exam Conducting Agency',
};

export const STATUS = {
  requested: { label: 'Awaiting allocation', cls: 'bg-amber-100 text-amber-800' },
  allocated: { label: 'Allocated – verify', cls: 'bg-sky-100 text-sky-800' },
  confirmed: { label: 'Confirmed', cls: 'bg-indigo-100 text-indigo-800' },
  ready: { label: 'Center ready', cls: 'bg-teal-100 text-teal-800' },
  in_progress: { label: 'In progress', cls: 'bg-violet-100 text-violet-800' },
  completed: { label: 'Completed', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-200 text-slate-600' },
};

export const STATUS_ORDER = ['requested', 'allocated', 'confirmed', 'ready', 'in_progress', 'completed'];

export const LAB_TYPES = { computer_lab: 'Computer lab', exam_hall: 'Exam hall', classroom: 'Classroom' };

export const ACTION_LABELS = {
  requested: 'Booking requested',
  edited: 'Booking edited',
  allocation_updated: 'Allocation updated',
  allocated: 'Allocation complete',
  confirmed: 'Allocation verified & confirmed',
  changes_requested: 'Changes requested',
  agency_assigned: 'Agency assigned',
  network_checklist: 'Network checklist',
  center_checklist: 'Center checklist',
  started: 'Exam started',
  attendance: 'Attendance recorded',
  incident: 'Incident reported',
  incident_resolved: 'Incident resolved',
  incident_reopened: 'Incident reopened',
  completed: 'Exam completed',
  cancelled: 'Booking cancelled',
  billing: 'Billing updated',
  feedback: 'Feedback',
  candidates_uploaded: 'Candidates uploaded',
  seat_plan: 'Seat plan generated',
  mock_requested: 'Mock day requested',
  mock_cancelled: 'Mock day cancelled',
  mock_allocated: 'Mock day labs allocated',
  mock_permitted: 'Mock day lab permission granted',
  mock_rejected: 'Mock day sent back for changes',
  mock_completed: 'Mock day completed',
};

export const MOCK_STATUS = {
  requested: 'Waiting for Network Admin lab allocation',
  allocated: 'Waiting for Booking Vendor lab permission',
  approved: 'Permitted – agency conducts the mock test',
  completed: 'Mock test completed',
};

const pad = (n) => String(n).padStart(3, '0');
export const seatRange = (a) => `seats ${pad(a.seatFrom || 1)}–${pad((a.seatFrom || 1) + a.seats - 1)}`;

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
export const fmtDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
