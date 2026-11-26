import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';

export default function Register() {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', instName: '', type: 'university', city: '', state: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await api.post('/auth/register-institute', { name: f.name, email: f.email, phone: f.phone, password: f.password, institute: { name: f.instName, type: f.type, city: f.city, state: f.state } });
      setDone(r.data.message);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="card w-full max-w-xl space-y-4">
        <Link to="/" className="text-sm text-brand-600">← Home</Link>
        <h1 className="h1">Register your University / Institute</h1>
        <Alert>{error}</Alert>
        <Alert kind="success">{done}</Alert>
        {!done && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2"><label className="label">Institute name</label><input className="input" value={f.instName} onChange={set('instName')} required /></div>
              <div><label className="label">Type</label>
                <select className="input" value={f.type} onChange={set('type')}>
                  {['university', 'institute', 'college', 'board', 'recruiter', 'company', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">City</label><input className="input" value={f.city} onChange={set('city')} required /></div>
              <div><label className="label">State</label><input className="input" value={f.state} onChange={set('state')} required /></div>
              <div><label className="label">Contact person</label><input className="input" value={f.name} onChange={set('name')} required /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={set('email')} required /></div>
              <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set('phone')} /></div>
              <div className="md:col-span-2"><label className="label">Password (min 8 characters)</label><input className="input" type="password" value={f.password} onChange={set('password')} required minLength={8} /></div>
            </div>
            <button className="btn-primary w-full">Submit for approval</button>
          </>
        )}
        <p className="text-sm">Already registered? <Link className="text-brand-600 hover:underline" to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
