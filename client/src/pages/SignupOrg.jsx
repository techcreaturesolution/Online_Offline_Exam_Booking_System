import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';

const TYPES = [
  ['vendor', 'Booking vendor / exam center network'],
  ['institute', 'University / institute'],
  ['agency', 'Exam conducting agency'],
];

export default function SignupOrg() {
  const [f, setF] = useState({ orgName: '', slug: '', types: ['vendor'], name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const toggle = (t) => setF({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/auth/signup-tenant', { organisation: { name: f.orgName, slug: f.slug, types: f.types }, name: f.name, email: f.email, phone: f.phone, password: f.password });
      if (r.data.host && r.data.host !== window.location.host) {
        window.location.href = `${window.location.protocol}//${r.data.host}/login`;
        return;
      }
      localStorage.setItem('eb_token', r.data.token);
      window.location.href = '/organisation';
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="card w-full max-w-xl space-y-4">
        <Link to="/" className="text-sm text-brand-600">← Home</Link>
        <h1 className="h1">Start a free trial for your organisation</h1>
        <p className="text-sm text-slate-600">You get a private workspace for your centers, labs and exam bookings. You become its Super Admin.</p>
        <Alert>{error}</Alert>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><label className="label">Organisation name</label><input className="input" value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value, slug: f.slug && f.slug !== slugify(f.orgName) ? f.slug : slugify(e.target.value) })} required minLength={3} /></div>
          <div className="md:col-span-2"><label className="label">Organisation address (lowercase letters, numbers, dashes)</label><input className="input font-mono" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} required minLength={3} /></div>
          <div className="md:col-span-2 space-y-1">
            <span className="label">What does your organisation do?</span>
            {TYPES.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.types.includes(k)} onChange={() => toggle(k)} />{label}</label>
            ))}
          </div>
          <div><label className="label">Your name</label><input className="input" value={f.name} onChange={set('name')} required /></div>
          <div><label className="label">Work email</label><input className="input" type="email" value={f.email} onChange={set('email')} required /></div>
          <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
          <div><label className="label">Password (min 8 characters)</label><input className="input" type="password" value={f.password} onChange={set('password')} required minLength={8} /></div>
        </div>
        <button className="btn-primary w-full" disabled={!f.types.length}>Create organisation</button>
        <p className="text-sm">Already have an account? <Link className="text-brand-600 hover:underline" to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
