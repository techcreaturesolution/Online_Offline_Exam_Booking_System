import { useEffect, useState } from 'react';
import { Alert, Empty, Spinner } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { ROLE_LABELS } from '../lib/format.js';

export default function Directory() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/meta/directory').then((r) => setUsers(r.data.users)).catch((e) => setError(errorMessage(e)));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!users) return <Spinner />;
  const term = search.trim().toLowerCase();
  const list = users.filter((u) => (!role || u.role === role) && (!term || [u.name, u.email, u.phone, u.organization?.name, ...(u.centers || []).map((c) => c.name)].some((v) => v?.toLowerCase().includes(term))));
  const roles = [...new Set(users.map((u) => u.role))];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="h1">User directory</h1>
        <p className="text-sm text-slate-600">Contacts of institutes, network admins, center in-charges and agencies for exam-day coordination.</p>
      </div>
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-xs">Role
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        <label className="flex-1 text-xs">Search<input className="input" placeholder="Name, email, organization or center" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <span className="text-sm text-slate-500">{list.length} users</span>
      </div>
      {list.length === 0 ? <Empty>No users match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Organization</th><th>Centers</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u._id}>
                  <td className="font-medium">{u.name}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>{u.organization?.name || '–'}</td>
                  <td>{(u.centers || []).map((c) => c.code).join(', ') || '–'}</td>
                  <td><a className="text-brand-600 hover:underline" href={`mailto:${u.email}`}>{u.email}</a></td>
                  <td>{u.phone ? <a className="hover:underline" href={`tel:${u.phone}`}>{u.phone}</a> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
