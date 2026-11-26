import { STATUS } from '../lib/format.js';

export function StatusBadge({ status }) {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-100' };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function ModeBadge({ mode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${mode === 'online' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'}`}>
      {mode === 'online' ? 'Online (CBT)' : 'Offline (Pen & paper)'}
    </span>
  );
}

export function Stat({ label, value, hint, tone = 'text-slate-900' }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const cls = kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Bar({ value, className = '' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 85 ? 'bg-rose-500' : v >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className={`h-2 w-full rounded-full bg-slate-100 ${className}`}>
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Empty({ children }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function Spinner() {
  return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
}
