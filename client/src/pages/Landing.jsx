import { Link } from 'react-router-dom';

const ROLES = [
  ['University / Institute', 'Tracks its exams: status, lab and classroom allocation, candidate counts, attendance and lab utilization.'],
  ['Network Admin', 'Allocates computer labs per shift with live seat availability and conflict checks, then completes the network readiness checklist.'],
  ['Center In-Charge', 'Allocates classrooms and exam halls for offline exams, completes the center checklist, records attendance and reports incidents.'],
  ['Exam Conducting Agency', 'Creates exams with dates, center and candidate counts, starts and completes them, and records attendance and incidents on exam day.'],
  ['Super Admin', 'Onboards centers, labs, institutes, agencies and users, and sees every booking and report.'],
];

const FEATURES = [
  'Online (CBT) and offline (pen & paper) exams in one workflow',
  'Seat-level lab allocation with overlap and maintenance conflict checks',
  'Auto-suggested allocation (best-fit lab, else largest labs first)',
  'Lab utilization reports: capacity vs allocated vs attended seat-hours',
  'Readiness checklists for network and center',
  'Exam-day present / absent counts per classroom, block and center',
  'Attendance counts, incident log and post-exam center rating',
  'In-app notifications (optional e-mail), CSV exports and billing',
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="bg-gradient-to-br from-brand-900 to-brand-600 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="text-xl font-bold">TheSpot <span className="text-sky-300">Exam Booking</span></div>
          <div className="flex gap-2">
            <Link to="/register" className="btn border border-white/40 text-white hover:bg-white/10">Register institute</Link>
            <Link to="/login" className="btn bg-white text-brand-700 hover:bg-slate-100">Sign in</Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
          <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">Online & offline exam center booking for universities, institutes and exam centers</h1>
          <p className="mt-4 max-w-2xl text-lg text-sky-100">Book exam slots, allocate labs and halls without clashes, verify readiness and track every candidate count and lab utilization in real time.</p>
          <Link to="/login" className="btn mt-8 bg-white px-6 py-3 text-base text-brand-700 hover:bg-slate-100">Open the dashboard</Link>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-2xl font-bold">One workflow for every stakeholder</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ROLES.map(([t, d]) => (
            <div key={t} className="card"><div className="font-semibold text-brand-700">{t}</div><p className="mt-2 text-sm text-slate-600">{d}</p></div>
          ))}
        </div>
      </section>
      <section className="bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Booking flow</h2>
            <ol className="mt-4 space-y-3 text-sm text-slate-700">
              <li><b>1. Create</b> – the exam conducting agency picks the institute, center, exam mode, dates and candidate count.</li>
              <li><b>2. Allocate</b> – Network Admin (online) or Center In-Charge (offline) assigns labs or classrooms; the exam is confirmed and everyone sees the allocation.</li>
              <li><b>3. Ready</b> – network and center checklists are completed.</li>
              <li><b>4. Conduct</b> – the agency starts the exam, records attendance and incidents, and completes it.</li>
            </ol>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Add-ons included</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {FEATURES.map((f) => <li key={f}>✓ {f}</li>)}
            </ul>
          </div>
        </div>
      </section>
      <footer className="py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} TheSpot Exam Booking</footer>
    </div>
  );
}
