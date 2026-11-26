import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { Booking } from '../src/models/Booking.js';
import { Center } from '../src/models/Center.js';
import { Counter } from '../src/models/Counter.js';
import { Lab } from '../src/models/Lab.js';
import { LabAllocation } from '../src/models/LabAllocation.js';
import { Notification } from '../src/models/Notification.js';
import { Organization } from '../src/models/Organization.js';
import { CENTER_CHECKLIST, NETWORK_CHECKLIST, OFFLINE_EXTRA_CHECKLIST, ROLES } from '../src/models/roles.js';
import { User } from '../src/models/User.js';
import { addDays, todayIso } from '../src/utils/time.js';

export const DEMO_PASSWORD = 'Demo@1234';

export async function seedDemo() {
  await Promise.all([Booking, Center, Counter, Lab, LabAllocation, Notification, Organization, User].map((m) => m.deleteMany({})));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [gtu, sim, vendor, agency, agency2] = await Organization.create([
    { kind: 'institute', name: 'Gujarat State Technical University', type: 'university', code: 'GSTU', city: 'Ahmedabad', state: 'Gujarat', email: 'exams@gstu.test' },
    { kind: 'institute', name: 'Spot Institute of Management', type: 'institute', code: 'SIM', city: 'Surat', state: 'Gujarat', email: 'admin@sim.test' },
    { kind: 'vendor', name: 'TheSpot Exam Services', type: 'company', code: 'TSES', city: 'Ahmedabad', state: 'Gujarat' },
    { kind: 'agency', name: 'EduSecure Exam Agency', type: 'company', code: 'EDUSEC', city: 'Ahmedabad', state: 'Gujarat' },
    { kind: 'agency', name: 'National Assessment Partners', type: 'company', code: 'NAP', city: 'Vadodara', state: 'Gujarat' },
  ]);

  const [ahm, srt, vad] = await Center.create([
    { name: 'Ahmedabad Digital Exam Center', code: 'AHM01', address: 'SG Highway, Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', pincode: '380054', modes: ['online', 'offline'], facilities: ['CCTV', 'Power backup', 'Jammer', 'Biometric', 'Wheelchair access'], ratePerSeat: { online: 450, offline: 200 }, vendor: vendor._id },
    { name: 'Surat Tech Assessment Hub', code: 'SRT01', address: 'Ring Road, Surat', city: 'Surat', state: 'Gujarat', pincode: '395002', modes: ['online'], facilities: ['CCTV', 'Power backup', 'Biometric'], ratePerSeat: { online: 400, offline: 0 }, vendor: vendor._id },
    { name: 'Vadodara Exam Hall Complex', code: 'VAD01', address: 'Alkapuri, Vadodara', city: 'Vadodara', state: 'Gujarat', pincode: '390007', modes: ['offline'], facilities: ['CCTV', 'Strong room', 'Parking'], ratePerSeat: { online: 0, offline: 180 }, vendor: vendor._id },
  ]);

  const labs = await Lab.create([
    { center: ahm._id, name: 'Computer Lab A', code: 'LAB-A', block: 'Block A', type: 'computer_lab', floor: 'Ground', capacity: 120, systemsTotal: 120, systemsWorking: 116, bufferSeats: 6, bandwidthMbps: 200 },
    { center: ahm._id, name: 'Computer Lab B', code: 'LAB-B', block: 'Block A', type: 'computer_lab', floor: 'First', capacity: 80, systemsTotal: 80, systemsWorking: 80, bufferSeats: 4, bandwidthMbps: 200 },
    { center: ahm._id, name: 'Computer Lab C', code: 'LAB-C', block: 'Block A', type: 'computer_lab', floor: 'First', capacity: 60, systemsTotal: 60, systemsWorking: 58, bufferSeats: 3, bandwidthMbps: 100, maintenanceBlocks: [{ from: addDays(todayIso(), 10), to: addDays(todayIso(), 12), reason: 'UPS replacement' }] },
    { center: ahm._id, name: 'Main Exam Hall', code: 'HALL-1', block: 'Block B', type: 'exam_hall', floor: 'Ground', capacity: 200, bufferSeats: 10 },
    { center: ahm._id, name: 'Classroom 201', code: 'CR-201', block: 'Block B', type: 'classroom', floor: 'Second', capacity: 60 },
    { center: srt._id, name: 'Lab 1', code: 'S-LAB1', type: 'computer_lab', floor: 'Ground', capacity: 150, systemsTotal: 150, systemsWorking: 145, bufferSeats: 5, bandwidthMbps: 300 },
    { center: srt._id, name: 'Lab 2', code: 'S-LAB2', type: 'computer_lab', floor: 'First', capacity: 100, systemsTotal: 100, systemsWorking: 92, bufferSeats: 2, bandwidthMbps: 300 },
    { center: vad._id, name: 'Hall North', code: 'V-HN', type: 'exam_hall', floor: 'Ground', capacity: 300, bufferSeats: 10 },
    { center: vad._id, name: 'Hall South', code: 'V-HS', type: 'exam_hall', floor: 'Ground', capacity: 250, bufferSeats: 10 },
  ]);
  const lab = Object.fromEntries(labs.map((l) => [l.code, l]));

  const users = await User.create(
    [
      { name: 'Super Admin', email: 'admin@examhub.test', role: ROLES.SUPER_ADMIN },
      { name: 'Dr. Meera Shah (Exam Controller)', email: 'university@examhub.test', role: ROLES.INSTITUTE, organization: gtu._id },
      { name: 'Rahul Patel (SIM Admin)', email: 'institute@examhub.test', role: ROLES.INSTITUTE, organization: sim._id },
      { name: 'Kiran Desai (Booking Vendor)', email: 'vendor@examhub.test', role: ROLES.VENDOR, organization: vendor._id },
      { name: 'Amit Joshi (Network Admin)', email: 'network@examhub.test', role: ROLES.NETWORK, centers: [ahm._id, srt._id] },
      { name: 'Neha Trivedi (Center In-Charge AHM)', email: 'center@examhub.test', role: ROLES.CENTER, centers: [ahm._id] },
      { name: 'Vikram Rao (Center In-Charge SRT/VAD)', email: 'center2@examhub.test', role: ROLES.CENTER, centers: [srt._id, vad._id] },
      { name: 'Sanjay Mehta (EduSecure)', email: 'agency@examhub.test', role: ROLES.AGENCY, organization: agency._id },
      { name: 'Pooja Iyer (NAP)', email: 'agency2@examhub.test', role: ROLES.AGENCY, organization: agency2._id },
    ].map((u) => ({ ...u, passwordHash, status: 'active' })),
  );
  const admin = users[0];
  const today = todayIso();
  let seq = 0;
  const year = new Date().getFullYear();
  const full = (list) => Object.fromEntries(list.map((c) => [c.key, true]));
  const ev = (action, note = '') => ({ action, note, by: admin._id, byName: admin.name, byRole: admin.role, at: new Date() });

  async function booking(data, allocations = []) {
    seq += 1;
    const center = [ahm, srt, vad].find((c) => String(c._id) === String(data.center));
    const total = data.shifts.reduce((n, s) => n + s.candidates, 0);
    const rate = center.ratePerSeat[data.mode];
    const b = await Booking.create({ bookingNo: `EB-${year}-${String(seq).padStart(5, '0')}`, billing: { ratePerSeat: rate, amount: rate * total }, createdBy: admin._id, timeline: [ev('requested')], ...data });
    for (const [shiftIndex, code, seats] of allocations) {
      const s = b.shifts[shiftIndex];
      const left = s.attendance?.present == null ? null : s.attendance.present - (s.$seeded || 0);
      const present = left == null ? null : Math.max(0, Math.min(seats, left));
      if (present != null) s.$seeded = (s.$seeded || 0) + present;
      await LabAllocation.create({ booking: b._id, shiftId: s._id, center: b.center, lab: lab[code]._id, seats, present, date: s.date, startTime: s.startTime, endTime: s.endTime, allocatedBy: admin._id });
    }
    return b;
  }

  await booking({ institute: gtu._id, center: ahm._id, examName: 'B.E. Semester VII Online Exam', examCode: 'BE-SEM7', mode: 'online', requirements: ['Webcam', 'Biometric attendance'], shifts: [
    { label: 'Morning', date: addDays(today, 5), startTime: '09:30', endTime: '12:30', candidates: 150 },
    { label: 'Afternoon', date: addDays(today, 5), startTime: '14:00', endTime: '17:00', candidates: 140 },
  ] });
  await booking({ institute: sim._id, center: ahm._id, agency: agency._id, examName: 'MBA Entrance Test (Online)', examCode: 'SIM-MET', mode: 'online', status: 'allocated', shifts: [
    { label: 'Slot 1', date: addDays(today, 7), startTime: '10:00', endTime: '12:00', candidates: 150 },
  ], timeline: [ev('requested'), ev('allocated', 'All shifts have lab allocation')] }, [[0, 'LAB-A', 110], [0, 'LAB-B', 40]]);
  await booking({ institute: gtu._id, center: srt._id, agency: agency._id, examName: 'Diploma Engineering Online Exam', examCode: 'DIP-ONL', mode: 'online', status: 'confirmed', review: { decision: 'approved', by: users[3]._id, at: new Date() }, shifts: [
    { label: 'Morning', date: addDays(today, 3), startTime: '09:00', endTime: '11:00', candidates: 200 },
  ], mock: { status: 'requested', date: addDays(today, 1), startTime: '15:00', endTime: '16:00', candidates: 60, notes: 'Mock test for system and login check', requestedBy: users[7]._id, requestedRole: 'exam_agency' },
  readiness: { network: { items: { lan: true, systems: true }, done: false } }, timeline: [ev('requested'), ev('allocated'), ev('confirmed'), ev('mock_requested')] }, [[0, 'S-LAB1', 140], [0, 'S-LAB2', 60]]);
  await booking({ institute: gtu._id, center: vad._id, agency: agency2._id, examName: 'B.Com Semester III Written Exam', examCode: 'BCOM-S3', mode: 'offline', status: 'ready', review: { decision: 'approved', by: users[1]._id, at: new Date() }, shifts: [
    { label: 'Paper 1', date: addDays(today, 1), startTime: '10:00', endTime: '13:00', candidates: 420 },
  ], readiness: { center: { items: full([...CENTER_CHECKLIST, ...OFFLINE_EXTRA_CHECKLIST]), done: true, by: users[6]._id, at: new Date() } }, timeline: [ev('requested'), ev('allocated'), ev('confirmed'), ev('center_checklist', 'Completed')] }, [[0, 'V-HN', 240], [0, 'V-HS', 180]]);
  await booking({ institute: sim._id, center: ahm._id, agency: agency._id, examName: 'Faculty Recruitment CBT', examCode: 'SIM-FAC', mode: 'online', status: 'completed', review: { decision: 'approved', by: users[3]._id, at: new Date() }, shifts: [
    { label: 'Shift 1', date: addDays(today, -6), startTime: '10:00', endTime: '12:00', candidates: 100, attendance: { present: 86, absent: 14, recordedAt: new Date() } },
    { label: 'Shift 2', date: addDays(today, -6), startTime: '14:00', endTime: '16:00', candidates: 90, attendance: { present: 81, absent: 9, recordedAt: new Date() } },
  ], readiness: { network: { items: full(NETWORK_CHECKLIST), done: true }, center: { items: full(CENTER_CHECKLIST), done: true } }, incidents: [{ category: 'network', severity: 'medium', description: 'Switch on row 4 restarted, 6 candidates resumed after 4 minutes', resolved: true, by: users[4]._id, byRole: ROLES.NETWORK }], feedback: { rating: 4, comment: 'Smooth conduct, quick network recovery', at: new Date() }, timeline: [ev('requested'), ev('confirmed'), ev('started'), ev('completed', '167/190 candidates appeared')] }, [[0, 'LAB-A', 100], [1, 'LAB-B', 76], [1, 'LAB-C', 14]]);
  await booking({ institute: gtu._id, center: ahm._id, agency: agency._id, examName: 'M.Sc. Mathematics Written Exam', examCode: 'MSC-MATH', mode: 'offline', status: 'in_progress', review: { decision: 'approved', by: users[1]._id, at: new Date() }, shifts: [
    { label: 'Paper 2', date: today, startTime: '10:00', endTime: '13:00', candidates: 230 },
  ], readiness: { center: { items: full([...CENTER_CHECKLIST, ...OFFLINE_EXTRA_CHECKLIST]), done: true } }, timeline: [ev('requested'), ev('confirmed'), ev('started')] }, [[0, 'HALL-1', 190], [0, 'CR-201', 40]]);
  await booking({ institute: sim._id, center: srt._id, examName: 'Aptitude Test (Cancelled)', mode: 'online', status: 'cancelled', cancelReason: 'Exam postponed by institute', shifts: [
    { date: addDays(today, 9), startTime: '10:00', endTime: '11:00', candidates: 50 },
  ] });
  await Counter.create({ _id: `booking-${year}`, seq });

  return { users: users.map((u) => ({ email: u.email, role: u.role })) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDb();
  const { users } = await seedDemo();
  console.log(`Seeded demo data. Password for every account: ${DEMO_PASSWORD}`);
  console.table(users);
  await mongoose.disconnect();
}
