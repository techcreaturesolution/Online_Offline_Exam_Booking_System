import { useState } from 'react';
import { Alert } from '../ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { ROLE_LABELS, fmtDate, fmtDateTime } from '../../lib/format.js';

function AttendanceRow({ booking, shift, i, editable, reload }) {
  const [present, setPresent] = useState(shift.attendance?.present ?? '');
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      const p = Number(present);
      await api.put(`/bookings/${booking._id}/shifts/${shift._id}/attendance`, { present: p, absent: shift.candidates - p });
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const recorded = shift.attendance?.present != null;
  return (
    <tr>
      <td>{shift.label || `Shift ${i + 1}`}<div className="text-xs text-slate-500">{fmtDate(shift.date)} {shift.startTime}–{shift.endTime}</div></td>
      <td>{shift.candidates}</td>
      <td>
        {editable ? (
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={shift.candidates} className="input w-24" value={present} onChange={(e) => setPresent(e.target.value)} />
            <button className="btn-secondary" onClick={save} disabled={present === ''}>Save</button>
          </div>
        ) : recorded ? shift.attendance.present : '–'}
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
      </td>
      <td>{recorded ? shift.attendance.absent : editable && present !== '' ? shift.candidates - Number(present) : '–'}</td>
      <td>{recorded ? `${Math.round((shift.attendance.present / shift.candidates) * 100)}%` : '–'}</td>
    </tr>
  );
}

export default function ConductPanel({ booking, actions, reload }) {
  const [inc, setInc] = useState({ category: 'technical', severity: 'low', shiftId: '', description: '' });
  const [error, setError] = useState('');
  const act = async (fn) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const report = (e) => {
    e.preventDefault();
    act(async () => {
      await api.post(`/bookings/${booking._id}/incidents`, { ...inc, shiftId: inc.shiftId || undefined });
      setInc({ ...inc, description: '' });
    });
  };
  const showAttendance = ['in_progress', 'completed'].includes(booking.status);
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Exam day</h2>
        <div className="flex gap-2">
          {actions.includes('start') && <button className="btn-primary" onClick={() => act(() => api.post(`/bookings/${booking._id}/start`))}>Start exam</button>}
          {actions.includes('complete') && <button className="btn-success" onClick={() => act(() => api.post(`/bookings/${booking._id}/complete`))}>Mark exam completed</button>}
        </div>
      </div>
      <Alert>{error}</Alert>
      {booking.status === 'ready' && !booking.agency && <Alert kind="info">Assign an exam conducting agency before the exam can start.</Alert>}
      {showAttendance ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Shift</th><th>Registered</th><th>Present</th><th>Absent</th><th>Attendance</th></tr></thead>
            <tbody>{booking.shifts.map((s, i) => <AttendanceRow key={s._id} booking={booking} shift={s} i={i} editable={actions.includes('attendance')} reload={reload} />)}</tbody>
          </table>
        </div>
      ) : <p className="text-sm text-slate-500">Attendance is recorded once the exam is started.</p>}

      <div>
        <h3 className="mb-2 font-semibold">Incidents ({booking.incidents.length})</h3>
        {booking.incidents.length > 0 && (
          <ul className="mb-3 space-y-2">
            {booking.incidents.map((x) => (
              <li key={x._id} className={`rounded-lg border p-2 text-sm ${x.resolved ? 'border-slate-200 bg-slate-50' : x.severity === 'high' ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium capitalize">{x.severity} · {x.category}{x.resolved ? ' · resolved' : ''}</span>
                  {actions.includes('incident') && <button className="text-xs text-brand-600 hover:underline" onClick={() => act(() => api.put(`/bookings/${booking._id}/incidents/${x._id}`, { resolved: !x.resolved }))}>{x.resolved ? 'Reopen' : 'Mark resolved'}</button>}
                </div>
                <div>{x.description}</div>
                <div className="text-xs text-slate-500">{ROLE_LABELS[x.byRole]} · {fmtDateTime(x.at)}</div>
              </li>
            ))}
          </ul>
        )}
        {actions.includes('incident') && (
          <form onSubmit={report} className="grid gap-2 md:grid-cols-4">
            <select className="input" value={inc.category} onChange={(e) => setInc({ ...inc, category: e.target.value })}>
              {['technical', 'network', 'power', 'malpractice', 'medical', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input" value={inc.severity} onChange={(e) => setInc({ ...inc, severity: e.target.value })}>
              {['low', 'medium', 'high'].map((c) => <option key={c} value={c}>{c} severity</option>)}
            </select>
            <select className="input" value={inc.shiftId} onChange={(e) => setInc({ ...inc, shiftId: e.target.value })}>
              <option value="">All shifts</option>
              {booking.shifts.map((s, i) => <option key={s._id} value={s._id}>{s.label || `Shift ${i + 1}`}</option>)}
            </select>
            <button className="btn-secondary">Report incident</button>
            <textarea className="input md:col-span-4" rows={2} required minLength={5} placeholder="What happened?" value={inc.description} onChange={(e) => setInc({ ...inc, description: e.target.value })} />
          </form>
        )}
      </div>
    </div>
  );
}
