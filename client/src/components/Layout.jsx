import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, SUPPORT_KEY } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS, fmtDateTime } from '../lib/format.js';

function navFor(role) {
  const items = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/bookings', label: role === 'exam_agency' ? 'Assigned exams' : 'Exam bookings' },
  ];
  if (['institute_admin', 'super_admin'].includes(role)) items.push({ to: '/bookings/new', label: 'New booking' });
  items.push({ to: '/centers', label: ['network_admin', 'center_incharge'].includes(role) ? 'My centers & labs' : 'Centers & labs' });
  items.push({ to: '/planning', label: 'Lab planning' });
  items.push({ to: '/attendance', label: 'Attendance counts' });
  items.push({ to: '/utilization', label: 'Lab utilization' });
  if (role === 'exam_agency') items.push({ to: '/directory', label: 'User directory' });
  if (role === 'super_admin') items.push({ to: '/admin', label: 'Users & organizations' }, { to: '/organisation', label: 'Organisation & audit log' });
  return items;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const navigate = useNavigate();
  const load = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    api.get('/notifications').then((r) => setData(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) await api.post(`/notifications/${n._id}/read`).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await api.post('/notifications/read-all');
    load();
  };
  return (
    <div className="relative">
      <button className="btn-secondary relative" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        Notifications
        {data.unread > 0 && <span className="ml-1 rounded-full bg-rose-600 px-1.5 text-xs text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-96 max-w-[90vw] rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {data.unread > 0 && <button className="text-xs text-brand-600 hover:underline" onClick={readAll}>Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {data.notifications.length === 0 && <div className="p-4 text-sm text-slate-500">No notifications yet.</div>}
            {data.notifications.map((n) => (
              <button key={n._id} onClick={() => openItem(n)} className={`block w-full border-b px-4 py-2 text-left text-sm hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50'}`}>
                <div className="font-medium text-slate-800">{n.title}</div>
                {n.body && <div className="text-xs text-slate-600">{n.body}</div>}
                <div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, tenant, impersonatedBy, logout } = useAuth();
  const owner = user.role === 'platform_owner';
  const exitSupport = () => {
    sessionStorage.removeItem(SUPPORT_KEY);
    window.location.href = '/platform';
  };
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const org = user.organization?.name || (user.centers || []).map((c) => c.name).join(', ');
  return (
    <div className="min-h-screen md:flex">
      <aside className={`no-print w-full bg-brand-900 text-slate-100 md:min-h-screen md:w-64 md:shrink-0 ${menu ? '' : 'max-md:[&>nav]:hidden'}`}>
        <div className="flex items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="text-lg font-bold">TheSpot <span className="text-sky-300">Exam Booking</span></Link>
          <button className="md:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menu">☰</button>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          {(owner ? [{ to: '/platform', label: 'Tenants' }] : navFor(user.role)).map((i) => (
            <NavLink key={i.to} to={i.to} end onClick={() => setMenu(false)} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-semibold text-white' : 'text-slate-300 hover:bg-white/10'}`}>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{user.name}</div>
            <div className="text-xs text-slate-500">
              {ROLE_LABELS[user.role]}
              {org ? ` · ${org}` : ''}
              {tenant ? ` · ${tenant.name}` : ''}
              {tenant?.status === 'trial' && tenant.trialEndsAt ? ` (trial until ${new Date(tenant.trialEndsAt).toLocaleDateString()})` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!owner && <Notifications />}
            <button className="btn-secondary" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
          </div>
        </header>
        {impersonatedBy && (
          <div className="no-print flex items-center justify-between bg-amber-100 px-6 py-2 text-sm text-amber-900">
            <span>Platform support session as {user.name}. Every action is recorded in this organisation's audit log.</span>
            <button className="btn-secondary" onClick={exitSupport}>Exit support session</button>
          </div>
        )}
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
