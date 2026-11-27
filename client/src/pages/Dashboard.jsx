import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Bar, Empty, ModeBadge, Spinner, Stat, StatusBadge } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { STATUS, STATUS_ORDER, fmtDate } from '../lib/format.js';

const GUIDE = {
  institute_admin: 'Track your exams: status, lab / classroom allocation, candidate counts and attendance.',
  network_admin: 'Allocate computer labs to online exam bookings, then complete the network readiness checklist.',
  center_incharge: 'Allocate exam halls for offline exams and complete the center readiness checklist for every exam.',
  exam_agency: 'Create exams with dates, center and candidate counts, then start them once the center is ready, record attendance and complete them.',
  super_admin: 'Overview of every booking, center and lab across the platform.',
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/reports/dashboard').then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const { counts, upcoming, actionNeeded, utilization30 } = data;
  const daily = utilization30.daily.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Welcome, {user.name.split(' ')[0]}</h1>
          <p className="text-sm text-slate-600">{GUIDE[user.role]}</p>
        </div>
        {['exam_agency', 'super_admin'].includes(user.role) && <Link to="/bookings/new" className="btn-primary">+ Create exam</Link>}
      </div>

      <Link to="/bookings" className="block rounded-xl border border-amber-200 bg-amber-50 p-4 hover:bg-amber-100">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Action needed</div>
        <div className="text-lg font-semibold text-amber-900">{actionNeeded.count} · {actionNeeded.label}</div>
      </Link>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Exam bookings" value={counts.total} hint={`${counts.byMode.online || 0} online · ${counts.byMode.offline || 0} offline`} />
        <Stat label="Registered candidates" value={counts.candidates.toLocaleString('en-IN')} hint={`${counts.pendingAttendance.toLocaleString('en-IN')} awaiting attendance`} />
        <Stat label="Attendance" value={`${counts.attendanceRate}%`} hint={`${counts.present.toLocaleString('en-IN')} present · ${counts.absent.toLocaleString('en-IN')} absent`} tone="text-emerald-700" />
        <Stat label="Lab utilization (next 30 days)" value={`${utilization30.totals.utilization}%`} hint={`${utilization30.totals.allocatedSeatHours.toLocaleString('en-IN')} of ${utilization30.totals.capacitySeatHours.toLocaleString('en-IN')} seat-hours`} tone="text-brand-700" />
      </div>

      <div className="card">
        <h2 className="h2 mb-3">Exam status</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[...STATUS_ORDER, 'cancelled'].map((s) => (
            <Link key={s} to={`/bookings?status=${s}`} className="rounded-lg border border-slate-200 p-3 hover:border-brand-500">
              <div className="text-2xl font-bold">{counts.byStatus[s] || 0}</div>
              <div className="text-xs text-slate-600">{STATUS[s].label}</div>
            </Link>
          ))}
        </div>
        {counts.openIncidents > 0 && <p className="mt-3 text-sm text-rose-700">{counts.openIncidents} open incident(s) need attention.</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Upcoming shifts (7 days)</h2>
            <Link to="/bookings" className="text-sm text-brand-600 hover:underline">All bookings</Link>
          </div>
          {upcoming.length === 0 ? <Empty>No exam shifts in the next 7 days.</Empty> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Date</th><th>Exam</th><th>Center</th><th>Candidates</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.map((u) => (
                    <tr key={`${u.booking}-${u._id}`}>
                      <td className="whitespace-nowrap">{fmtDate(u.date)}<div className="text-xs text-slate-500">{u.startTime}–{u.endTime}</div></td>
                      <td><Link className="font-medium text-brand-700 hover:underline" to={`/bookings/${u.booking}`}>{u.examName}</Link><div className="mt-0.5"><ModeBadge mode={u.mode} /></div></td>
                      <td>{u.center}<div className="text-xs text-slate-500">{u.institute}</div></td>
                      <td>{u.candidates}</td>
                      <td><StatusBadge status={u.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Center utilization (30 days)</h2>
            <Link to="/utilization" className="text-sm text-brand-600 hover:underline">Report</Link>
          </div>
          {utilization30.centers.length === 0 ? <Empty>No centers in scope.</Empty> : (
            <div className="space-y-3">
              {utilization30.centers.map((c) => (
                <div key={c.center}>
                  <div className="flex justify-between text-sm"><span className="font-medium">{c.centerName}</span><span>{c.utilization}%</span></div>
                  <Bar value={c.utilization} className="mt-1" />
                  <div className="mt-0.5 text-xs text-slate-500">{c.labs} labs · {c.sessions} sessions · {c.seatsAllocated} seats allocated</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="h2 mb-3">Seats allocated per day (next 30 days)</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <RBar dataKey="seats" name="Seats allocated" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
