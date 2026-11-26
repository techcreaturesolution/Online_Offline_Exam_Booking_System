import { useCallback, useEffect, useState } from 'react';
import { Alert, Empty, Spinner } from '../components/ui.jsx';
import { api, downloadCsv, errorMessage } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';

function AuditLog() {
  const [f, setF] = useState({ action: '', entity: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  const key = JSON.stringify(params);
  const load = useCallback(() => {
    api.get('/tenant/audit-logs', { params: { ...JSON.parse(key), page } }).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  }, [key, page]);
  useEffect(load, [load]);
  const set = (k) => (e) => {
    setPage(1);
    setF({ ...f, [k]: e.target.value });
  };
  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Audit log</h2>
        <button className="btn-secondary" onClick={() => downloadCsv(`/tenant/audit-logs.csv?${new URLSearchParams(params)}`, 'audit-log.csv')}>Export CSV</button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs">Action<input className="input" placeholder="e.g. bookings" value={f.action} onChange={set('action')} /></label>
        <label className="text-xs">Entity
          <select className="input" value={f.entity} onChange={set('entity')}>
            <option value="">All</option>
            {['Booking', 'Center', 'Lab', 'User', 'Organization', 'Tenant'].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-xs">From<input className="input" type="date" value={f.from} onChange={set('from')} /></label>
        <label className="text-xs">To<input className="input" type="date" value={f.to} onChange={set('to')} /></label>
      </div>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty>No audit entries.</Empty> : (
        <>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>IP</th><th>Details</th></tr></thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a._id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</td>
                    <td className="text-xs">{a.actorName || '—'}<div className="text-slate-500">{a.role}{a.impersonatedBy ? ' · via platform support' : ''}</div></td>
                    <td className="font-mono text-xs">{a.action}</td>
                    <td className="text-xs">{a.entity}</td>
                    <td className="text-xs">{a.ip}</td>
                    <td className="max-w-md truncate font-mono text-[11px]" title={JSON.stringify({ before: a.before, after: a.after })}>
                      {a.before ? `${JSON.stringify(a.before)} → ` : ''}{a.after ? JSON.stringify(a.after) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {data.page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} entries</span>
            <button className="btn-secondary" disabled={page * data.limit >= data.total} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Organisation() {
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/tenant').then((r) => setT(r.data.tenant)).catch((e) => setError(errorMessage(e)));
  }, []);
  if (!t) return error ? <Alert>{error}</Alert> : <Spinner />;
  const setPath = (group, k) => (e) => setT({ ...t, [group]: { ...t[group], [k]: e.target.value } });
  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      const r = await api.patch('/tenant', { name: t.name, contactEmail: t.contactEmail || undefined, branding: t.branding, settings: t.settings });
      setT(r.data.tenant);
      setMsg('Organisation settings saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const exportData = async () => {
    const r = await api.get('/tenant/export', { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t.slug}-export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const scheduleDelete = async () => {
    const confirm = window.prompt(`This cancels the account and permanently deletes all data after 30 days. Type ${t.slug} to confirm.`);
    if (!confirm) return;
    try {
      await api.post('/tenant/delete', { confirm });
      localStorage.removeItem('eb_token');
      window.location.href = '/login';
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">Organisation</h1>
        <p className="text-sm text-slate-600">Address <span className="font-mono">{t.slug}</span> · status {t.status} · plan {t.plan}{t.trialEndsAt && t.status === 'trial' ? ` · trial ends ${new Date(t.trialEndsAt).toLocaleDateString()}` : ''}</p>
      </div>
      <Alert>{error}</Alert>
      <Alert kind="success">{msg}</Alert>
      <form onSubmit={save} className="card grid gap-3 md:grid-cols-2">
        <h2 className="h2 md:col-span-2">Profile and branding</h2>
        <label className="text-xs">Organisation name<input className="input" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} required /></label>
        <label className="text-xs">Contact email<input className="input" type="email" value={t.contactEmail || ''} onChange={(e) => setT({ ...t, contactEmail: e.target.value })} /></label>
        <label className="text-xs">Logo URL<input className="input" value={t.branding.logoUrl} onChange={setPath('branding', 'logoUrl')} placeholder="https://…" /></label>
        <label className="text-xs">Primary colour<input className="input" value={t.branding.primaryColor} onChange={setPath('branding', 'primaryColor')} placeholder="#1e40af" /></label>
        <label className="text-xs">Email sender name<input className="input" value={t.branding.emailSenderName} onChange={setPath('branding', 'emailSenderName')} /></label>
        <label className="text-xs">Login page text<input className="input" value={t.branding.loginText} onChange={setPath('branding', 'loginText')} /></label>
        <label className="text-xs">Timezone<input className="input" value={t.settings.timezone} onChange={setPath('settings', 'timezone')} /></label>
        <label className="text-xs">Currency<input className="input" value={t.settings.currency} onChange={setPath('settings', 'currency')} maxLength={3} /></label>
        <label className="text-xs">Tax label<input className="input" value={t.settings.taxLabel} onChange={setPath('settings', 'taxLabel')} /></label>
        <label className="text-xs">Data residency<input className="input" value={t.settings.dataResidency} onChange={setPath('settings', 'dataResidency')} /></label>
        <div className="md:col-span-2"><button className="btn-primary">Save settings</button></div>
      </form>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2">Your data</h2>
          <p className="text-sm text-slate-600">Download everything as JSON, or close the account (30-day grace period before deletion).</p>
        </div>
        <div className="space-x-2">
          <button className="btn-secondary" onClick={exportData}>Export all data</button>
          <button className="btn-secondary text-rose-700" onClick={scheduleDelete}>Close account…</button>
        </div>
      </div>
      <AuditLog />
    </div>
  );
}
