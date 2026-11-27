import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { inr, todayIso } from '../lib/format.js';

const REQUIREMENTS = ['CCTV recording', 'Biometric verification', 'Frisking / metal detector', 'Jammer', 'Wheelchair access', 'Separate staff room', 'Projector for briefing'];
const blankShift = (i = 0) => ({ label: `Shift ${i + 1}`, date: todayIso(7), startTime: i % 2 ? '14:00' : '10:00', endTime: i % 2 ? '16:00' : '12:00', candidates: 50 });

export default function NewBooking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [centers, setCenters] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [institutes, setInstitutes] = useState([]);
  const [f, setF] = useState({ examName: '', examCode: '', mode: 'online', center: '', agency: '', institute: '', notes: '', requirements: [] });
  const [shifts, setShifts] = useState([blankShift()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/centers').then((r) => setCenters(r.data.centers.filter((c) => c.active)));
    api.get('/meta/agencies').then((r) => setAgencies(r.data.agencies));
    api.get('/meta/institutes').then((r) => setInstitutes(r.data.institutes));
  }, [user.role]);

  const eligible = centers.filter((c) => c.modes.includes(f.mode));
  const center = eligible.find((c) => c._id === f.center);
  const total = shifts.reduce((n, s) => n + (Number(s.candidates) || 0), 0);
  const maxShift = Math.max(0, ...shifts.map((s) => Number(s.candidates) || 0));
  const estimate = center ? (center.ratePerSeat?.[f.mode] || 0) * total : 0;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setShift = (i, k, v) => setShifts(shifts.map((s, n) => (n === i ? { ...s, [k]: v } : s)));
  const toggleReq = (r) => setF({ ...f, requirements: f.requirements.includes(r) ? f.requirements.filter((x) => x !== r) : [...f.requirements, r] });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, agency: f.agency || null, institute: f.institute || undefined, shifts: shifts.map((s) => ({ ...s, candidates: Number(s.candidates) })) };
      const r = await api.post('/bookings', body);
      navigate(`/bookings/${r.data.booking._id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="h1">Create exam</h1>
      <Alert>{error}</Alert>
      <div className="card grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="label">Exam mode</label>
          <div className="grid gap-3 md:grid-cols-2">
            {[['online', 'Online (Computer Based Test)', 'Network Admin allocates computer labs'], ['offline', 'Offline (Pen & paper)', 'Center In-Charge allocates classrooms / exam halls']].map(([m, t, d]) => (
              <button type="button" key={m} onClick={() => setF({ ...f, mode: m, center: '' })} className={`rounded-lg border p-3 text-left ${f.mode === m ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-300'}`}>
                <div className="font-semibold">{t}</div>
                <div className="text-xs text-slate-600">{d}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="label">University / Institute</label>
          <select className="input" value={f.institute} onChange={set('institute')} required>
            <option value="">Select institute…</option>
            {institutes.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
          </select>
        </div>
        <div><label className="label">Exam name</label><input className="input" value={f.examName} onChange={set('examName')} required minLength={3} placeholder="e.g. B.Tech Semester 6 – Data Structures" /></div>
        <div><label className="label">Exam code (optional)</label><input className="input" value={f.examCode} onChange={set('examCode')} /></div>
        <div>
          <label className="label">Exam center</label>
          <select className="input" value={f.center} onChange={set('center')} required>
            <option value="">Select center…</option>
            {eligible.map((c) => <option key={c._id} value={c._id}>{c.name} – {c.city} ({c.seats[f.mode]} seats)</option>)}
          </select>
          {center && (
            <p className={`mt-1 text-xs ${maxShift > center.seats[f.mode] ? 'text-rose-600' : 'text-slate-500'}`}>
              {center.labCount} labs/halls · {center.seats[f.mode]} usable {f.mode} seats · hours {center.openTime}–{center.closeTime}
              {maxShift > center.seats[f.mode] && ' · a shift exceeds the center\'s total seats'}
            </p>
          )}
        </div>
        {user.role === 'super_admin' && (
          <div>
            <label className="label">Exam conducting agency (optional)</label>
            <select className="input" value={f.agency} onChange={set('agency')}>
              <option value="">Assign later</option>
              {agencies.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h2">Shifts</h2>
          <button type="button" className="btn-secondary" onClick={() => setShifts([...shifts, { ...blankShift(shifts.length), date: shifts.at(-1)?.date || todayIso(7) }])}>+ Add shift</button>
        </div>
        {shifts.map((s, i) => (
          <div key={i} className="grid items-end gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-6">
            <div><label className="label">Label</label><input className="input" value={s.label} onChange={(e) => setShift(i, 'label', e.target.value)} /></div>
            <div><label className="label">Date</label><input type="date" min={todayIso()} className="input" value={s.date} onChange={(e) => setShift(i, 'date', e.target.value)} required /></div>
            <div><label className="label">Start</label><input type="time" className="input" value={s.startTime} onChange={(e) => setShift(i, 'startTime', e.target.value)} required /></div>
            <div><label className="label">End</label><input type="time" className="input" value={s.endTime} onChange={(e) => setShift(i, 'endTime', e.target.value)} required /></div>
            <div><label className="label">Candidates</label><input type="number" min={1} className="input" value={s.candidates} onChange={(e) => setShift(i, 'candidates', e.target.value)} required /></div>
            <button type="button" className="btn-secondary" disabled={shifts.length === 1} onClick={() => setShifts(shifts.filter((_, n) => n !== i))}>Remove</button>
          </div>
        ))}
        <p className="text-sm text-slate-600">Total candidates: <b>{total}</b>{center ? <> · Estimated fee: <b>{inr(estimate)}</b> ({inr(center.ratePerSeat?.[f.mode])}/seat)</> : null}</p>
      </div>

      <div className="card space-y-3">
        <h2 className="h2">Requirements & notes</h2>
        <div className="flex flex-wrap gap-2">
          {REQUIREMENTS.map((r) => (
            <button type="button" key={r} onClick={() => toggleReq(r)} className={`rounded-full border px-3 py-1 text-sm ${f.requirements.includes(r) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300'}`}>{r}</button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder="Notes for the center" value={f.notes} onChange={set('notes')} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit booking request'}</button>
    </form>
  );
}
