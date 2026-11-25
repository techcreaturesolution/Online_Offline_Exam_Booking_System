import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Empty, Spinner } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

const blank = { name: '', code: '', city: '', state: '', address: '', pincode: '', modes: ['online'], openTime: '08:00', closeTime: '20:00', ratePerSeat: { online: 0, offline: 0 }, vendor: '', facilities: '' };

function CenterForm({ onCreated }) {
  const [f, setF] = useState(blank);
  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/admin/organizations?kind=vendor').then((r) => setVendors(r.data.organizations));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (m) => setF({ ...f, modes: f.modes.includes(m) ? f.modes.filter((x) => x !== m) : [...f.modes, m] });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/centers', { ...f, vendor: f.vendor || null, facilities: f.facilities.split(',').map((s) => s.trim()).filter(Boolean), ratePerSeat: { online: Number(f.ratePerSeat.online), offline: Number(f.ratePerSeat.offline) } });
      setF(blank);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 md:grid-cols-4">
      <h2 className="h2 md:col-span-4">Add exam center</h2>
      <div className="md:col-span-4"><Alert>{error}</Alert></div>
      <div className="md:col-span-2"><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
      <div><label className="label">Code</label><input className="input" value={f.code} onChange={set('code')} required /></div>
      <div><label className="label">Booking vendor</label>
        <select className="input" value={f.vendor} onChange={set('vendor')}><option value="">None</option>{vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}</select>
      </div>
      <div className="md:col-span-2"><label className="label">Address</label><input className="input" value={f.address} onChange={set('address')} /></div>
      <div><label className="label">City</label><input className="input" value={f.city} onChange={set('city')} required /></div>
      <div><label className="label">State</label><input className="input" value={f.state} onChange={set('state')} required /></div>
      <div><label className="label">Modes</label>
        <div className="flex gap-3 pt-2 text-sm">{['online', 'offline'].map((m) => <label key={m} className="flex items-center gap-1"><input type="checkbox" checked={f.modes.includes(m)} onChange={() => toggle(m)} />{m}</label>)}</div>
      </div>
      <div><label className="label">Open – close</label><div className="flex gap-1"><input type="time" className="input" value={f.openTime} onChange={set('openTime')} /><input type="time" className="input" value={f.closeTime} onChange={set('closeTime')} /></div></div>
      <div><label className="label">Online ₹/seat</label><input type="number" min={0} className="input" value={f.ratePerSeat.online} onChange={(e) => setF({ ...f, ratePerSeat: { ...f.ratePerSeat, online: e.target.value } })} /></div>
      <div><label className="label">Offline ₹/seat</label><input type="number" min={0} className="input" value={f.ratePerSeat.offline} onChange={(e) => setF({ ...f, ratePerSeat: { ...f.ratePerSeat, offline: e.target.value } })} /></div>
      <div className="md:col-span-3"><label className="label">Facilities (comma separated)</label><input className="input" value={f.facilities} onChange={set('facilities')} placeholder="CCTV, Parking, Power backup" /></div>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={!f.modes.length}>Create center</button></div>
    </form>
  );
}

export default function Centers() {
  const { user } = useAuth();
  const [centers, setCenters] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const load = () => api.get('/centers').then((r) => setCenters(r.data.centers)).catch((e) => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Exam centers & labs</h1>
        {user.role === 'super_admin' && <button className="btn-primary" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Add center'}</button>}
      </div>
      {adding && <CenterForm onCreated={() => { setAdding(false); load(); }} />}
      <Alert>{error}</Alert>
      {!centers ? <Spinner /> : centers.length === 0 ? <Empty>No centers available.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {centers.map((c) => (
            <Link key={c._id} to={`/centers/${c._id}`} className="card block hover:border-brand-500">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.code} · {c.city}, {c.state}</div>
                </div>
                {!c.active && <span className="rounded bg-slate-200 px-2 text-xs">Inactive</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">{c.modes.map((m) => <span key={m} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>{m}</span>)}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded bg-slate-50 p-2"><div className="font-bold">{c.labCount}</div><div className="text-xs text-slate-500">Labs / halls</div></div>
                <div className="rounded bg-slate-50 p-2"><div className="font-bold">{c.seats.online}</div><div className="text-xs text-slate-500">Online seats</div></div>
                <div className="rounded bg-slate-50 p-2"><div className="font-bold">{c.seats.offline}</div><div className="text-xs text-slate-500">Offline seats</div></div>
              </div>
              <div className="mt-2 text-xs text-slate-500">Hours {c.openTime}–{c.closeTime}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
