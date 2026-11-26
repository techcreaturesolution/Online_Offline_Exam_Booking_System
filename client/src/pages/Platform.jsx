import { useCallback, useEffect, useState } from 'react';
import { Alert, Empty, Spinner, Stat } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const STATUSES = ['trial', 'active', 'suspended', 'cancelled'];
const TONE = { trial: 'bg-amber-100 text-amber-800', active: 'bg-emerald-100 text-emerald-800', suspended: 'bg-rose-100 text-rose-800', cancelled: 'bg-slate-200 text-slate-700' };

export default function Platform() {
  const [tenants, setTenants] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api.get('/platform/tenants', { params: { q: q || undefined, status: status || undefined } }).then((r) => setTenants(r.data.tenants)).catch((e) => setError(errorMessage(e)));
  }, [q, status]);
  useEffect(load, [load]);

  const update = async (t, body) => {
    setError('');
    setMsg('');
    try {
      await api.patch(`/platform/tenants/${t._id}`, body);
      setMsg(`${t.name} updated`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const impersonate = async (t) => {
    const reason = window.prompt(`Reason for signing in to ${t.name} (recorded in its audit log)`);
    if (!reason) return;
    try {
      const r = await api.post(`/platform/tenants/${t._id}/impersonate`, { reason });
      sessionStorage.setItem('eb_owner_token', localStorage.getItem('eb_token'));
      localStorage.setItem('eb_token', r.data.token);
      window.location.href = '/dashboard';
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!tenants) return error ? <Alert>{error}</Alert> : <Spinner />;
  const count = (s) => tenants.filter((t) => t.status === s).length;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Platform console</h1>
        <p className="text-sm text-slate-600">Every organisation (tenant) on the platform, its plan, status and usage.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Tenants" value={tenants.length} />
        <Stat label="Active" value={count('active')} tone="text-emerald-700" />
        <Stat label="On trial" value={count('trial')} tone="text-amber-700" />
        <Stat label="Suspended / cancelled" value={count('suspended') + count('cancelled')} tone="text-rose-700" />
      </div>
      <Alert>{error}</Alert>
      <Alert kind="success">{msg}</Alert>
      <div className="card flex flex-wrap items-end gap-3">
        <label className="flex-1 text-xs">Search<input className="input" placeholder="Name or address" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="text-xs">Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {tenants.length === 0 ? <Empty>No tenants match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Organisation</th><th>Types</th><th>Status</th><th>Plan</th><th>Users</th><th>Centers</th><th>Labs</th><th>Bookings</th><th>Created</th><th /></tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t._id}>
                  <td><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.slug}{t.contactEmail ? ` · ${t.contactEmail}` : ''}</div></td>
                  <td className="text-xs">{t.types.join(', ')}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[t.status]}`}>{t.status}</span>
                    {t.status === 'trial' && t.trialEndsAt && <div className="text-[11px] text-slate-500">ends {fmtDate(t.trialEndsAt)}</div>}
                    {t.deletionScheduledAt && <div className="text-[11px] text-rose-600">deletes {fmtDate(t.deletionScheduledAt)}</div>}
                  </td>
                  <td><input className="input w-28" defaultValue={t.plan} aria-label={`Plan for ${t.name}`} onBlur={(e) => e.target.value !== t.plan && update(t, { plan: e.target.value })} /></td>
                  <td>{t.usage.users}</td>
                  <td>{t.usage.centers}</td>
                  <td>{t.usage.labs}</td>
                  <td>{t.usage.bookings}</td>
                  <td className="text-xs">{fmtDate(t.createdAt)}</td>
                  <td className="space-x-1 whitespace-nowrap">
                    {['suspended', 'cancelled'].includes(t.status) ? (
                      <button className="btn-secondary" onClick={() => update(t, { status: 'active' })}>Reactivate</button>
                    ) : (
                      <button className="btn-secondary" onClick={() => window.confirm(`Suspend ${t.name}? Its users will be signed out.`) && update(t, { status: 'suspended' })}>Suspend</button>
                    )}
                    <button className="btn-secondary" onClick={() => impersonate(t)}>Sign in as admin</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
