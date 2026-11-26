import { useState } from 'react';
import { Alert } from '../ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';

function Checklist({ booking, kind, list, editable, reload }) {
  const saved = booking.readiness?.[kind] || {};
  const [items, setItems] = useState(saved.items || {});
  const [remarks, setRemarks] = useState(saved.remarks || '');
  const [error, setError] = useState('');
  const save = async () => {
    setError('');
    try {
      await api.put(`/bookings/${booking._id}/readiness/${kind}`, { items, remarks });
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const doneCount = list.filter((c) => (editable ? items : saved.items || {})[c.key]).length;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium">{kind === 'network' ? 'Network readiness (Network Admin)' : 'Center readiness (Center In-Charge)'}</div>
        <span className={`text-xs font-semibold ${saved.done ? 'text-emerald-700' : 'text-slate-500'}`}>{saved.done ? 'Complete' : `${doneCount}/${list.length}`}</span>
      </div>
      <Alert>{error}</Alert>
      <ul className="space-y-1.5">
        {list.map((c) => (
          <li key={c.key}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" disabled={!editable} checked={Boolean((editable ? items : saved.items || {})[c.key])} onChange={(e) => setItems({ ...items, [c.key]: e.target.checked })} />
              {c.label}
            </label>
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="mt-2 space-y-2">
          <input className="input" placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <button className="btn-primary" onClick={save}>Save checklist</button>
        </div>
      ) : (
        saved.at && <p className="mt-2 text-xs text-slate-500">Updated {fmtDateTime(saved.at)}{saved.remarks ? ` · ${saved.remarks}` : ''}</p>
      )}
    </div>
  );
}

export default function ReadinessPanel({ booking, checklists, actions, reload }) {
  return (
    <div className="card space-y-3">
      <h2 className="h2">Readiness checklists</h2>
      {!['confirmed', 'ready', 'in_progress', 'completed'].includes(booking.status) && <p className="text-sm text-slate-500">Checklists open once the allocation is verified and the booking is confirmed.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {booking.mode === 'online' && <Checklist booking={booking} kind="network" list={checklists.network} editable={actions.includes('readiness:network')} reload={reload} />}
        <Checklist booking={booking} kind="center" list={checklists.center} editable={actions.includes('readiness:center')} reload={reload} />
      </div>
    </div>
  );
}
