import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../ui.jsx';
import { api, downloadCsv, errorMessage } from '../../lib/api.js';

const SAMPLE = 'rollNo,name,email,phone,shift\nR0001,Asha Patel,asha@example.com,9876500001,1\nR0002,Rahul Shah,rahul@example.com,9876500002,1\n';

export default function CandidatesPanel({ booking, count, actions, reload }) {
  const [csv, setCsv] = useState('');
  const [replace, setReplace] = useState(false);
  const [msg, setMsg] = useState({ kind: 'error', text: '' });
  const total = booking.shifts.reduce((n, s) => n + s.candidates, 0);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result));
    reader.readAsText(file);
  };
  const run = async (fn) => {
    setMsg({ kind: 'error', text: '' });
    try {
      setMsg({ kind: 'success', text: await fn() });
      reload();
    } catch (e) {
      const d = e.response?.data?.details;
      setMsg({ kind: 'error', text: Array.isArray(d) ? `${e.response.data.error}: ${d.slice(0, 5).join(' · ')}` : errorMessage(e) });
    }
  };
  const upload = () => run(async () => {
    const r = await api.post(`/bookings/${booking._id}/candidates`, { csv, replace });
    setCsv('');
    return `Imported ${r.data.imported} candidate(s). ${r.data.total} on the list now.`;
  });
  const seatPlan = () => run(async () => {
    const r = await api.post(`/bookings/${booking._id}/seat-plan`);
    return `Seat plan generated: ${r.data.seated} seated${r.data.unseated.length ? `, ${r.data.unseated.length} without seats (allocation is short)` : ''}.`;
  });

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Candidates & seat plan</h2>
        <span className="text-sm text-slate-600">{count} of {total} uploaded</span>
      </div>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      {actions.includes('candidates') && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            <button type="button" className="text-brand-600 hover:underline" onClick={() => setCsv(SAMPLE)}>Use sample format</button>
          </div>
          <textarea className="input font-mono text-xs" rows={4} placeholder="rollNo,name,email,phone,shift" value={csv} onChange={(e) => setCsv(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace existing list</label>
            <button className="btn-primary" disabled={!csv.trim()} onClick={upload}>Upload candidates</button>
          </div>
          <p className="text-xs text-slate-500">The shift column takes the shift number (1–{booking.shifts.length}) or its label; it can be left out for single-shift exams.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {actions.includes('seatPlan') && count > 0 && <button className="btn-secondary" onClick={seatPlan}>Generate seat plan</button>}
        {count > 0 && <button className="btn-secondary" onClick={() => downloadCsv(`/bookings/${booking._id}/candidates.csv`, `${booking.bookingNo}-seat-plan.csv`)}>Download CSV</button>}
        {count > 0 && <Link className="btn-secondary" to={`/bookings/${booking._id}/seat-plan`} target="_blank">Printable seat list</Link>}
      </div>
    </div>
  );
}
