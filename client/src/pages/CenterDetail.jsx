import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { LAB_TYPES, fmtDate, todayIso } from '../lib/format.js';

const blankLab = { name: '', code: '', type: 'computer_lab', block: '', floor: '', capacity: 30, systemsTotal: 30, systemsWorking: 30, bufferSeats: 2, bandwidthMbps: 100, status: 'active', notes: '' };

function canManageType(user, center, type) {
  if (user.role === 'super_admin') return true;
  if (!(user.centers || []).some((c) => String(c._id || c) === String(center._id))) return false;
  if (user.role === 'network_admin') return type === 'computer_lab';
  if (user.role === 'center_incharge') return type !== 'computer_lab';
  return false;
}

function LabForm({ center, lab, types, onDone }) {
  const [f, setF] = useState(lab || { ...blankLab, type: types[0] });
  const [error, setError] = useState('');
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? Number(e.target.value) : e.target.value });
  const isPc = f.type === 'computer_lab';
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const body = { name: f.name, code: f.code, type: f.type, block: f.block, floor: f.floor, capacity: f.capacity, systemsTotal: isPc ? f.systemsTotal : 0, systemsWorking: isPc ? f.systemsWorking : 0, bufferSeats: f.bufferSeats, bandwidthMbps: isPc ? f.bandwidthMbps : 0, status: f.status, notes: f.notes };
    try {
      if (lab) await api.put(`/labs/${lab._id}`, body);
      else await api.post(`/centers/${center._id}/labs`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3 md:grid-cols-6">
      <div className="md:col-span-6"><Alert>{error}</Alert></div>
      <div><label className="label">Code</label><input className="input" value={f.code} onChange={set('code')} required /></div>
      <div className="md:col-span-2"><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
      <div><label className="label">Type</label><select className="input" value={f.type} onChange={set('type')}>{types.map((t) => <option key={t} value={t}>{LAB_TYPES[t]}</option>)}</select></div>
      <div><label className="label">Block</label><input className="input" placeholder="e.g. Block A" value={f.block} onChange={set('block')} /></div>
      <div><label className="label">Floor</label><input className="input" value={f.floor} onChange={set('floor')} /></div>
      <div><label className="label">Status</label><select className="input" value={f.status} onChange={set('status')}>{['active', 'maintenance', 'inactive'].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div><label className="label">Seating capacity</label><input type="number" min={1} className="input" value={f.capacity} onChange={set('capacity', true)} /></div>
      {isPc && <div><label className="label">Systems total</label><input type="number" min={0} className="input" value={f.systemsTotal} onChange={set('systemsTotal', true)} /></div>}
      {isPc && <div><label className="label">Systems working</label><input type="number" min={0} className="input" value={f.systemsWorking} onChange={set('systemsWorking', true)} /></div>}
      <div><label className="label">Buffer seats</label><input type="number" min={0} className="input" value={f.bufferSeats} onChange={set('bufferSeats', true)} /></div>
      {isPc && <div><label className="label">Bandwidth Mbps</label><input type="number" min={0} className="input" value={f.bandwidthMbps} onChange={set('bandwidthMbps', true)} /></div>}
      <div className="flex items-end gap-2"><button className="btn-primary">{lab ? 'Save' : 'Add'}</button><button type="button" className="btn-secondary" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function Blocks({ lab, editable, reload }) {
  const [f, setF] = useState({ from: todayIso(1), to: todayIso(1), reason: '' });
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/labs/${lab._id}/blocks`, f);
      setF({ ...f, reason: '' });
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const remove = async (id) => {
    await api.delete(`/labs/${lab._id}/blocks/${id}`);
    reload();
  };
  return (
    <div className="space-y-2">
      {lab.maintenanceBlocks?.map((b) => (
        <div key={b._id} className="flex items-center justify-between rounded bg-amber-50 px-2 py-1 text-xs">
          <span>{fmtDate(b.from)} – {fmtDate(b.to)}: {b.reason}</span>
          {editable && <button className="text-rose-600 hover:underline" onClick={() => remove(b._id)}>Remove</button>}
        </div>
      ))}
      {editable && (
        <form onSubmit={add} className="flex flex-wrap gap-1">
          <input type="date" className="input w-36" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <input type="date" className="input w-36" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <input className="input w-40" placeholder="Reason" required minLength={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <button className="btn-secondary">Block dates</button>
          {error && <div className="w-full text-xs text-rose-600">{error}</div>}
        </form>
      )}
    </div>
  );
}

function Schedule({ center }) {
  const [from, setFrom] = useState(todayIso());
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/centers/${center._id}/schedule?from=${from}`).then((r) => setData(r.data));
  }, [center._id, from]);
  if (!data) return <Spinner />;
  const byDate = data.allocations.reduce((m, a) => ((m[a.date] ||= []).push(a), m), {});
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Lab schedule (14 days)</h2>
        <input type="date" className="input w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      {Object.keys(byDate).length === 0 ? <p className="text-sm text-slate-500">No allocations in this period.</p> : Object.entries(byDate).map(([d, list]) => (
        <div key={d}>
          <div className="text-sm font-semibold">{fmtDate(d)}</div>
          <div className="mt-1 grid gap-1 md:grid-cols-2">
            {list.map((a) => (
              <div key={a._id} className="flex items-center justify-between rounded border border-slate-200 px-2 py-1 text-xs">
                <span><b>{a.startTime}–{a.endTime}</b> · {a.lab?.code} · {a.seats} seats</span>
                {a.booking?._id ? <Link className="text-brand-600 hover:underline" to={`/bookings/${a.booking._id}`}>{a.booking.examName}</Link> : <span className="text-slate-500">Booked</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CenterDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api.get(`/centers/${id}`).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e))), [id]);
  useEffect(() => { load(); }, [load]);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const { center, labs } = data;
  const types = Object.keys(LAB_TYPES).filter((t) => canManageType(user, center, t) && (t === 'computer_lab' ? center.modes.includes('online') : center.modes.includes('offline')));
  const done = () => { setEditing(null); load(); };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/centers" className="text-sm text-brand-600">← Centers</Link>
        <h1 className="h1">{center.name}</h1>
        <p className="text-sm text-slate-600">{center.code} · {[center.address, center.city, center.state, center.pincode].filter(Boolean).join(', ')} · Hours {center.openTime}–{center.closeTime}{center.vendor ? ` · Vendor: ${center.vendor.name}` : ''}</p>
        {center.facilities?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{center.facilities.map((f) => <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{f}</span>)}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-3"><div className="text-xs text-slate-500">Labs / halls</div><div className="text-xl font-bold">{center.labCount}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-500">Usable online seats</div><div className="text-xl font-bold">{center.seats.online}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-500">Usable offline seats</div><div className="text-xl font-bold">{center.seats.offline}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-500">Rate per seat</div><div className="text-sm font-semibold">Online ₹{center.ratePerSeat?.online || 0} · Offline ₹{center.ratePerSeat?.offline || 0}</div></div>
      </div>
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h2">Labs, halls & classrooms</h2>
          {types.length > 0 && editing !== 'new' && <button className="btn-primary" onClick={() => setEditing('new')}>+ Add {types.length === 1 ? LAB_TYPES[types[0]].toLowerCase() : 'lab / hall'}</button>}
        </div>
        {editing === 'new' && <LabForm center={center} types={types} onDone={done} />}
        <div className="space-y-3">
          {labs.map((l) => {
            const editable = canManageType(user, center, l.type);
            return (
              <div key={l._id} className="rounded-lg border border-slate-200 p-3">
                {editing === l._id ? <LabForm center={center} lab={l} types={types.includes(l.type) ? types : [l.type]} onDone={done} /> : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{l.code} · {l.name} <span className="ml-1 text-xs font-normal text-slate-500">{LAB_TYPES[l.type]}{l.block ? ` · ${l.block}` : ''}{l.floor ? ` · ${l.floor}` : ''}</span></div>
                      <div className="text-sm text-slate-600">
                        Capacity {l.capacity}
                        {l.type === 'computer_lab' && ` · ${l.systemsWorking}/${l.systemsTotal} systems working · ${l.bandwidthMbps} Mbps`}
                        {` · buffer ${l.bufferSeats} · `}<b>{l.usable} usable seats</b>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.status === 'active' ? 'bg-emerald-100 text-emerald-700' : l.status === 'maintenance' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{l.status}</span>
                      {editable && <button className="btn-secondary" onClick={() => setEditing(l._id)}>Edit</button>}
                    </div>
                  </div>
                )}
                <div className="mt-2"><Blocks lab={l} editable={editable} reload={load} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <Schedule center={center} />
    </div>
  );
}
