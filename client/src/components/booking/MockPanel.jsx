import { useState } from 'react';
import { Alert } from '../ui.jsx';
import { ShiftAllocator } from './AllocationPanel.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { MOCK_STATUS, fmtDate, seatRange, todayIso } from '../../lib/format.js';

function RequestForm({ booking, onDone }) {
  const m = booking.mock;
  const maxCandidates = Math.max(...booking.shifts.map((s) => s.candidates));
  const [f, setF] = useState({ date: m?.date || todayIso(1), startTime: m?.startTime || '10:00', endTime: m?.endTime || '11:00', candidates: m?.candidates || maxCandidates, notes: m?.notes || '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/bookings/${booking._id}/mock`, { ...f, candidates: Number(f.candidates) });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const firstDate = booking.shifts.map((s) => s.date).sort()[0];
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <div className="text-sm font-medium text-violet-900">{m ? 'Change mock day' : 'Request a mock day'} (before {fmtDate(firstDate)})</div>
      <Alert>{error}</Alert>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs">Date<input type="date" className="input" min={todayIso()} max={firstDate} value={f.date} onChange={set('date')} required /></label>
        <label className="text-xs">Start<input type="time" className="input" value={f.startTime} onChange={set('startTime')} required /></label>
        <label className="text-xs">End<input type="time" className="input" value={f.endTime} onChange={set('endTime')} required /></label>
        <label className="text-xs">Candidates<input type="number" min={1} max={maxCandidates} className="input" value={f.candidates} onChange={set('candidates')} required /></label>
      </div>
      <input className="input" placeholder="Purpose / notes (e.g. login and system check)" value={f.notes} onChange={set('notes')} />
      <button className="btn-primary">{m ? 'Update mock day' : 'Request mock day'}</button>
    </form>
  );
}

export default function MockPanel({ booking, mockAllocations, actions, reload }) {
  const m = booking.mock;
  const [error, setError] = useState('');
  const [result, setResult] = useState({ present: m?.result?.present ?? '', remarks: m?.result?.remarks || '' });
  const [editing, setEditing] = useState(false);
  const act = async (fn) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const canRequest = actions.includes('mockRequest');
  const seats = mockAllocations.reduce((n, a) => n + a.seats, 0);
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Mock day</h2>
        <span className="text-xs text-slate-500">Requested by the agency · labs allocated by the Network Admin</span>
      </div>
      <Alert>{error}</Alert>
      {!m && <p className="text-sm text-slate-500">No mock day planned. A mock test lets candidates and staff check systems and logins before the exam date.</p>}
      {m && (
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{fmtDate(m.date)} · {m.startTime}–{m.endTime} · {m.candidates} candidates</div>
              {m.notes && <div className="text-xs text-slate-500">{m.notes}</div>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : m.status === 'approved' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{MOCK_STATUS[m.status]}</span>
          </div>
          <div className="mt-2 text-xs text-slate-600">{seats} / {m.candidates} seats allocated</div>
          {mockAllocations.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {mockAllocations.map((a) => <span key={a._id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{a.lab.code} · {a.lab.name}: <b>{a.seats}</b> <span className="text-slate-500">({seatRange(a)})</span></span>)}
            </div>
          )}
          {m.status === 'completed' && <div className="mt-2 text-xs">Result: <b>{m.result.present}/{m.candidates}</b> appeared{m.result.remarks ? ` – ${m.result.remarks}` : ''}</div>}
        </div>
      )}
      {actions.includes('mockAllocate') && (
        <ShiftAllocator key={`${m._id}-${seats}`} suggestUrl={`/bookings/${booking._id}/mock/suggest`} saveUrl={`/bookings/${booking._id}/mock/allocation`} needed={m.candidates} current={mockAllocations} onSaved={reload} />
      )}
      {actions.includes('mockResult') && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <div className="font-medium text-emerald-900">Record mock day result</div>
          <div className="flex flex-wrap gap-2">
            <input type="number" min={0} max={m.candidates} className="input w-32" placeholder="Present" value={result.present} onChange={(e) => setResult({ ...result, present: e.target.value })} />
            <input className="input flex-1" placeholder="Remarks (system issues, login problems…)" value={result.remarks} onChange={(e) => setResult({ ...result, remarks: e.target.value })} />
            <button className="btn-success" disabled={result.present === ''} onClick={() => act(() => api.post(`/bookings/${booking._id}/mock/result`, { present: Number(result.present), remarks: result.remarks }))}>Save result</button>
          </div>
        </div>
      )}
      {m?.status === 'approved' && !actions.includes('mockResult') && m.date > todayIso() && <p className="text-xs text-slate-500">The agency records the result on {fmtDate(m.date)}.</p>}
      {canRequest && (!m || editing) && <RequestForm booking={booking} onDone={() => { setEditing(false); reload(); }} />}
      {canRequest && m && !editing && (
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditing(true)}>Change mock day</button>
          <button className="btn-secondary" onClick={() => act(() => api.delete(`/bookings/${booking._id}/mock`))}>Cancel mock day</button>
        </div>
      )}
    </div>
  );
}
