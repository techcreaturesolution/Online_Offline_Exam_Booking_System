import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Empty, ModeBadge, Spinner, StatusBadge } from '../components/ui.jsx';
import { api, downloadCsv, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { STATUS, fmtDate } from '../lib/format.js';

export default function Bookings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [bookings, setBookings] = useState(null);
  const [centers, setCenters] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState(params.get('q') || '');
  const query = params.toString();

  useEffect(() => {
    api.get('/centers').then((r) => setCenters(r.data.centers)).catch(() => {});
  }, []);
  useEffect(() => {
    let stale = false;
    api.get(`/bookings?${query}`)
      .then((r) => { if (!stale) { setBookings(r.data.bookings); setError(''); } })
      .catch((e) => { if (!stale) setError(errorMessage(e)); });
    return () => { stale = true; };
  }, [query]);

  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    setBookings(null);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{user.role === 'exam_agency' ? 'Assigned exams' : 'Exam bookings'}</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => downloadCsv(`/bookings/export.csv?${query}`, 'bookings.csv').catch((e) => setError(errorMessage(e)))}>Export CSV</button>
          {['institute_admin', 'super_admin'].includes(user.role) && <Link to="/bookings/new" className="btn-primary">+ New booking</Link>}
        </div>
      </div>
      <div className="card grid gap-3 md:grid-cols-6">
        <form className="md:col-span-2" onSubmit={(e) => { e.preventDefault(); setParam('q', q); }}>
          <label className="label">Search</label>
          <input className="input" placeholder="Exam, code or booking no." value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div>
          <label className="label">Status</label>
          <select className="input" value={params.get('status') || ''} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Mode</label>
          <select className="input" value={params.get('mode') || ''} onChange={(e) => setParam('mode', e.target.value)}>
            <option value="">All</option><option value="online">Online</option><option value="offline">Offline</option>
          </select>
        </div>
        <div>
          <label className="label">Center</label>
          <select className="input" value={params.get('center') || ''} onChange={(e) => setParam('center', e.target.value)}>
            <option value="">All</option>
            {centers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Exam date from</label>
          <input type="date" className="input" value={params.get('from') || ''} onChange={(e) => setParam('from', e.target.value)} />
        </div>
      </div>
      <Alert>{error}</Alert>
      {!bookings ? <Spinner /> : bookings.length === 0 ? <Empty>No bookings match these filters.</Empty> : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>Booking</th><th>Exam</th><th>Institute / Center</th><th>First date</th><th>Shifts</th><th>Candidates</th><th>Seats allocated</th><th>Present</th><th>Status</th></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap"><Link className="font-mono text-xs font-semibold text-brand-700 hover:underline" to={`/bookings/${b._id}`}>{b.bookingNo}</Link></td>
                  <td><Link className="font-medium hover:underline" to={`/bookings/${b._id}`}>{b.examName}</Link><div className="mt-0.5"><ModeBadge mode={b.mode} /></div></td>
                  <td>{b.institute?.name}<div className="text-xs text-slate-500">{b.center?.name}, {b.center?.city}</div></td>
                  <td className="whitespace-nowrap">{fmtDate(b.firstDate)}</td>
                  <td>{b.shifts.length}</td>
                  <td>{b.candidates}</td>
                  <td className={b.allocatedSeats < b.candidates && b.status !== 'cancelled' ? 'text-amber-700' : ''}>{b.allocatedSeats}</td>
                  <td>{['in_progress', 'completed'].includes(b.status) ? b.present : '–'}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
