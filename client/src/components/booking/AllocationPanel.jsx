import { useState } from 'react';
import { Alert, Bar } from '../ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { LAB_TYPES, fmtDate, seatRange } from '../../lib/format.js';

export function ShiftAllocator({ suggestUrl, saveUrl, needed, current: currentList = [], onSaved, unit = 'labs' }) {
  const [labs, setLabs] = useState(null);
  const [plan, setPlan] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setError('');
    try {
      const r = await api.get(suggestUrl);
      setLabs(r.data.labs);
      const current = Object.fromEntries(currentList.map((a) => [String(a.lab._id), a.seats]));
      const suggested = Object.fromEntries(r.data.items.map((i) => [String(i.lab), i.seats]));
      setPlan(Object.keys(current).length ? current : suggested);
      if (!Object.keys(current).length && r.data.shortfall) setError(`Only ${needed - r.data.shortfall} seats are free in this time slot; ${r.data.shortfall} short.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const autoFill = async () => {
    const r = await api.get(suggestUrl);
    setPlan(Object.fromEntries(r.data.items.map((i) => [String(i.lab), i.seats])));
  };

  const total = Object.values(plan).reduce((n, v) => n + (Number(v) || 0), 0);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const items = Object.entries(plan).filter(([, v]) => Number(v) > 0).map(([lab, seats]) => ({ lab, seats: Number(seats) }));
      await api.put(saveUrl, { items });
      setLabs(null);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!labs) return <button className="btn-secondary" onClick={open}>{currentList.length ? 'Change allocation' : `Allocate ${unit}`}</button>;
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
      <Alert>{error}</Alert>
      <div className="overflow-x-auto">
        <table className="table bg-white">
          <thead><tr><th>Lab</th><th>Type</th><th>Usable</th><th>Used by others</th><th>Free</th><th>Seats for this exam</th></tr></thead>
          <tbody>
            {labs.map((l) => (
              <tr key={l._id} className={l.blocked ? 'opacity-50' : ''}>
                <td><b>{l.code}</b> · {l.name}{l.floor ? <div className="text-xs text-slate-500">{l.floor}</div> : null}</td>
                <td>{LAB_TYPES[l.type]}</td>
                <td>{l.usable}</td>
                <td>{l.used}</td>
                <td>{l.blocked ? <span className="text-rose-600">{l.status !== 'active' ? l.status : 'Maintenance'}</span> : l.free}</td>
                <td><input type="number" min={0} max={l.free} disabled={l.blocked} className="input w-24" value={plan[String(l._id)] || ''} onChange={(e) => setPlan({ ...plan, [String(l._id)]: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-medium ${total === needed ? 'text-emerald-700' : 'text-amber-700'}`}>{total} / {needed} seats</span>
        <button className="btn-secondary" onClick={autoFill}>Auto-suggest</button>
        <button className="btn-primary" disabled={busy} onClick={save}>Save allocation</button>
        <button className="btn-secondary" onClick={() => setLabs(null)}>Close</button>
      </div>
    </div>
  );
}

export default function AllocationPanel({ booking, allocation, actions, reload }) {
  const canAllocate = actions.includes('allocate');
  const allocator = booking.mode === 'online' ? 'Network Admin' : 'Center In-Charge';
  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{booking.mode === 'online' ? 'Computer lab allocation' : 'Classroom allocation'}</h2>
        <span className="text-xs text-slate-500">Allocated by the {allocator} · visible to everyone on this exam</span>
      </div>
      {booking.shifts.map((s, i) => {
        const sum = allocation.shifts.find((x) => String(x.shiftId) === String(s._id));
        return (
          <div key={s._id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{s.label || `Shift ${i + 1}`} · {fmtDate(s.date)} · {s.startTime}–{s.endTime}</div>
                <div className="text-xs text-slate-500">{s.candidates} candidates</div>
              </div>
              <div className="w-48">
                <div className="flex justify-between text-xs"><span>{sum?.seats || 0} seats allocated</span><span>{sum?.covered ? '✓' : ''}</span></div>
                <Bar value={((sum?.seats || 0) / s.candidates) * 100} />
              </div>
            </div>
            {sum?.allocations?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sum.allocations.map((a) => <span key={a._id} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{a.lab.code} · {a.lab.name}: <b>{a.seats}</b> <span className="text-slate-500">({seatRange(a)})</span></span>)}
              </div>
            )}
            {canAllocate && <div className="mt-2"><ShiftAllocator unit={booking.mode === 'online' ? 'labs' : 'classrooms'} suggestUrl={`/bookings/${booking._id}/allocations/suggest?shiftId=${s._id}`} saveUrl={`/bookings/${booking._id}/allocations/${s._id}`} needed={s.candidates} current={sum?.allocations} onSaved={reload} /></div>}
          </div>
        );
      })}
    </div>
  );
}
