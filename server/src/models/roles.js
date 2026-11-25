export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  INSTITUTE: 'institute_admin',
  VENDOR: 'booking_vendor',
  NETWORK: 'network_admin',
  CENTER: 'center_incharge',
  AGENCY: 'exam_agency',
};

export const ROLE_LIST = Object.values(ROLES);

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  institute_admin: 'University / Institute',
  booking_vendor: 'Booking Vendor',
  network_admin: 'Network Admin',
  center_incharge: 'Center In-Charge',
  exam_agency: 'Exam Conducting Agency',
};

export const MODES = ['online', 'offline'];

export const BOOKING_STATUSES = ['requested', 'allocated', 'confirmed', 'ready', 'in_progress', 'completed', 'cancelled'];

export const NETWORK_CHECKLIST = [
  { key: 'lan', label: 'LAN / switches tested on every allocated system' },
  { key: 'systems', label: 'Systems imaged, exam software / browser installed' },
  { key: 'bandwidth', label: 'Internet bandwidth and failover link tested' },
  { key: 'power', label: 'UPS and generator backup tested' },
  { key: 'mock', label: 'Mock test completed on allocated systems' },
];

export const CENTER_CHECKLIST = [
  { key: 'seating', label: 'Seating plan and seat numbers pasted' },
  { key: 'cctv', label: 'CCTV cameras recording in all labs / halls' },
  { key: 'staff', label: 'Invigilators and support staff briefed' },
  { key: 'frisking', label: 'Frisking and candidate verification desk ready' },
  { key: 'amenities', label: 'Drinking water, washrooms and accessibility ready' },
];

export const OFFLINE_EXTRA_CHECKLIST = [
  { key: 'strongroom', label: 'Strong room for question papers sealed' },
  { key: 'answersheets', label: 'Answer sheets / OMR counted and ready' },
];

export function centerChecklistFor(mode) {
  return mode === 'offline' ? [...CENTER_CHECKLIST, ...OFFLINE_EXTRA_CHECKLIST] : CENTER_CHECKLIST;
}
