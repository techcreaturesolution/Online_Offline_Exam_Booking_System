import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner, StatusBadge } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { LAB_TYPES, MOCK_STATUS, ROLE_LABELS, fmtDate, seatRange, todayIso } from '../lib/format.js';

export default function Planning() {
  const { user } = useAuth();
  const [q, setQ] = useState({ from: todayIso(), to: todayIso(30), kind: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const qs = `from=${q.from}&to=${q.to}`;

  useEffect(() => {
    let stale = false;
    api.get(`/reports/planning?${qs}`)
      .then((r) => { if (!stale) { setData(r.data); setError(''); } })
      .catch((e) => { if (!stale) setError(errorMessage(e)); });
    return () => { stale = true; };
  }, [qs]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setQ((prev) => ({ ...prev, [k]: v }));
  };
  const rows = (data?.rows || []).filter((r) => !q.kind || r.kind === q.kind);
  const byDate = rows.reduce((m, r) => m.set(r.date, [...(m.get(r.date) || []), r]), new Map());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Lab planning</h1>
        <p className="text-sm text-slate-600">
          {user.role === 'exam_agency' ? 'Labs and seat ranges assigned by the Network Admin for your exams and mock days.' : 'Lab and hall allocation with seat ranges for exam shifts and mock days.'}
        </p>
      </div>
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-xs">From<input type="date" className="input" value={q.from} onChange={set('from')} /></label>
        <label className="text-xs">To<input type="date" className="input" value={q.to} onChange={set('to')} /></label>
        <label className="text-xs">Type
          <select className="input" value={q.kind} onChange={set('kind')}>
            <option value="">Exams and mock days</option>
            <option value="exam">Exam shifts</option>
            <option value="mock">Mock days</option>
          </select>
        </label>
        <span className="text-sm text-slate-500">{rows.length} lab allocations · {rows.reduce((n, r) => n + r.seats, 0)} seats</span>
      </div>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : rows.length === 0 ? <Empty>No labs are allocated in this period.</Empty> : (
        [...byDate].map(([date, list]) => (
          <div key={date} className="card overflow-x-auto">
            <h2 className="h2 mb-2">{fmtDate(date)}{date === todayIso() ? ' · Today' : ''}</h2>
            <table className="table">
              <thead><tr><th>Time</th><th>Exam</th><th>Center / lab</th><th>Seats</th><th>Seat range</th><th>Present</th><th>Allocated by</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r._id}>
                    <td className="whitespace-nowrap">{r.startTime}–{r.endTime}<div className="text-xs">{r.kind === 'mock' ? <span className="rounded bg-violet-100 px-1.5 text-violet-800">Mock day</span> : r.shiftLabel}</div></td>
                    <td>
                      <Link className="text-brand-600 hover:underline" to={`/bookings/${r.booking._id}`}>{r.booking.examName}</Link>
                      <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-mono">{r.booking.bookingNo}</span>{r.kind === 'mock' ? MOCK_STATUS[r.mockStatus] : <StatusBadge status={r.booking.status} />}</div>
                    </td>
                    <td>{r.center?.name}<div className="text-xs text-slate-500"><b>{r.lab?.code}</b> · {r.lab?.name} · {LAB_TYPES[r.lab?.type]}{r.lab?.floor ? ` · ${r.lab.floor}` : ''}</div></td>
                    <td>{r.seats}</td>
                    <td className="whitespace-nowrap">{seatRange(r)}</td>
                    <td>{r.present ?? '–'}</td>
                    <td>{r.allocatedBy?.name}<div className="text-xs text-slate-500">{ROLE_LABELS[r.allocatedBy?.role]}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
