import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS } from '../lib/format.js';

const ORG_ROLE = { institute_admin: 'institute', exam_agency: 'agency' };
const CENTER_ROLES = ['network_admin', 'center_incharge'];
const blankUser = { name: '', email: '', phone: '', role: 'institute_admin', organization: '', centers: [], password: '' };

function UserForm({ orgs, centers, onDone }) {
  const [f, setF] = useState(blankUser);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const kind = ORG_ROLE[f.role];
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/users', { ...f, organization: kind ? f.organization : null, centers: CENTER_ROLES.includes(f.role) ? f.centers : [] });
      setF(blankUser);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 md:grid-cols-4">
      <h2 className="h2 md:col-span-4">Add user</h2>
      <div className="md:col-span-4"><Alert>{error}</Alert></div>
      <div><label className="label">Role</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, organization: '', centers: [] })}>{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
      <div><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={set('email')} required /></div>
      <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
      {kind && (
        <div className="md:col-span-2"><label className="label">{kind}</label>
          <select className="input" value={f.organization} onChange={set('organization')} required>
            <option value="">Select…</option>
            {orgs.filter((o) => o.kind === kind).map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {CENTER_ROLES.includes(f.role) && (
        <div className="md:col-span-2"><label className="label">Centers</label>
          <div className="flex flex-wrap gap-3 pt-1 text-sm">
            {centers.map((c) => (
              <label key={c._id} className="flex items-center gap-1"><input type="checkbox" checked={f.centers.includes(c._id)} onChange={(e) => setF({ ...f, centers: e.target.checked ? [...f.centers, c._id] : f.centers.filter((x) => x !== c._id) })} />{c.name}</label>
            ))}
          </div>
        </div>
      )}
      <div><label className="label">Temporary password</label><input type="text" className="input" value={f.password} onChange={set('password')} required minLength={8} /></div>
      <div className="flex items-end"><button className="btn-primary w-full">Create user</button></div>
    </form>
  );
}

function OrgForm({ onDone }) {
  const [f, setF] = useState({ kind: 'institute', name: '', type: 'university', code: '', city: '', state: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/organizations', { ...f, type: f.kind === 'institute' ? f.type : undefined });
      setF({ ...f, name: '', code: '', email: '', phone: '' });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 md:grid-cols-4">
      <h2 className="h2 md:col-span-4">Add organization</h2>
      <div className="md:col-span-4"><Alert>{error}</Alert></div>
      <div><label className="label">Kind</label><select className="input" value={f.kind} onChange={set('kind')}><option value="institute">University / Institute</option><option value="agency">Exam conducting agency</option></select></div>
      <div className="md:col-span-2"><label className="label">Name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
      <div><label className="label">Code</label><input className="input" value={f.code} onChange={set('code')} /></div>
      {f.kind === 'institute' && <div><label className="label">Type</label><select className="input" value={f.type} onChange={set('type')}>{['university', 'institute', 'college', 'board', 'recruiter', 'company', 'other'].map((t) => <option key={t}>{t}</option>)}</select></div>}
      <div><label className="label">City</label><input className="input" value={f.city} onChange={set('city')} /></div>
      <div><label className="label">State</label><input className="input" value={f.state} onChange={set('state')} /></div>
      <div><label className="label">Email</label><input type="email" className="input" value={f.email} onChange={set('email')} /></div>
      <div className="flex items-end"><button className="btn-primary w-full">Create organization</button></div>
    </form>
  );
}

export default function Admin() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [centers, setCenters] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api.get(`/admin/users${filter ? `?status=${filter}` : ''}`).then((r) => setUsers(r.data.users)).catch((e) => setError(errorMessage(e)));
    api.get('/admin/organizations').then((r) => setOrgs(r.data.organizations));
    api.get('/centers').then((r) => setCenters(r.data.centers));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const updateUser = async (u, body) => {
    setError('');
    try {
      await api.put(`/admin/users/${u._id}`, body);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const toggleOrg = async (o) => {
    await api.put(`/admin/organizations/${o._id}`, { active: !o.active });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">Users & organizations</h1>
        <div className="flex gap-2">
          {['users', 'organizations'].map((t) => <button key={t} className={tab === t ? 'btn-primary' : 'btn-secondary'} onClick={() => { setTab(t); setAdding(false); }}>{t === 'users' ? 'Users' : 'Organizations'}</button>)}
          <button className="btn-secondary" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : `+ Add ${tab === 'users' ? 'user' : 'organization'}`}</button>
        </div>
      </div>
      <Alert>{error}</Alert>
      {adding && tab === 'users' && <UserForm orgs={orgs} centers={centers} onDone={() => { setAdding(false); load(); }} />}
      {adding && tab === 'organizations' && <OrgForm onDone={() => { setAdding(false); load(); }} />}
      {tab === 'users' && (
        <>
          <div className="flex gap-2 text-sm">
            {[['', 'All'], ['pending', 'Pending approval'], ['active', 'Active'], ['disabled', 'Disabled']].map(([v, l]) => <button key={v} className={`rounded-full px-3 py-1 ${filter === v ? 'bg-brand-600 text-white' : 'bg-white ring-1 ring-slate-300'}`} onClick={() => setFilter(v)}>{l}</button>)}
          </div>
          {!users ? <Spinner /> : (
            <div className="card overflow-x-auto p-0">
              <table className="table">
                <thead><tr><th>Name</th><th>Role</th><th>Organization / centers</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                      <td>{ROLE_LABELS[u.role]}</td>
                      <td>{u.organization?.name || u.centers?.map((c) => c.name).join(', ') || '–'}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : u.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{u.status}</span></td>
                      <td className="whitespace-nowrap text-right">
                        {u._id !== me._id && u.status !== 'active' && <button className="btn-success mr-1" onClick={() => updateUser(u, { status: 'active' })}>{u.status === 'pending' ? 'Approve' : 'Enable'}</button>}
                        {u._id !== me._id && u.status === 'active' && <button className="btn-secondary" onClick={() => updateUser(u, { status: 'disabled' })}>Disable</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === 'organizations' && (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Name</th><th>Kind</th><th>City</th><th>Contact</th><th>Status</th><th /></tr></thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o._id}>
                  <td className="font-medium">{o.name}{o.code ? <span className="ml-1 text-xs text-slate-500">{o.code}</span> : null}</td>
                  <td className="capitalize">{o.kind}{o.kind === 'institute' ? ` · ${o.type}` : ''}</td>
                  <td>{o.city}</td>
                  <td className="text-xs">{[o.email, o.phone].filter(Boolean).join(' · ')}</td>
                  <td>{o.active ? 'Active' : 'Inactive'}</td>
                  <td className="text-right"><button className="btn-secondary" onClick={() => toggleOrg(o)}>{o.active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
