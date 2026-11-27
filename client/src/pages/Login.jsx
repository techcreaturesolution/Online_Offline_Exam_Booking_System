import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui.jsx';
import { errorMessage } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABELS } from '../lib/format.js';

const DEMO = [
  ['admin@examhub.test', 'super_admin'],
  ['university@examhub.test', 'institute_admin'],
  ['vendor@examhub.test', 'booking_vendor'],
  ['network@examhub.test', 'network_admin'],
  ['center@examhub.test', 'center_incharge'],
  ['agency@examhub.test', 'exam_agency'],
  ['admin@acme.test', 'super_admin'],
  ['owner@examhub.test', 'platform_owner'],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(email, password);
      navigate(u.role === 'platform_owner' ? '/platform' : '/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-2">
        <form onSubmit={submit} className="space-y-4 p-8">
          <Link to="/" className="text-sm text-brand-600">← TheSpot Exam Booking</Link>
          <h1 className="h1">Sign in</h1>
          <Alert>{error}</Alert>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-sm text-slate-600">
            University or institute? <Link className="text-brand-600 hover:underline" to="/register">Register for exam bookings</Link>
            <br />New organisation? <Link className="text-brand-600 hover:underline" to="/signup">Start a free trial</Link>
          </p>
        </form>
        {import.meta.env.VITE_SHOW_DEMO_LOGINS !== 'false' && (
          <div className="bg-slate-50 p-8">
            <h2 className="h2">Demo accounts</h2>
            <p className="mb-3 text-xs text-slate-500">After <code>npm run seed</code>, every demo account uses password <b>Demo@1234</b>.</p>
            <div className="space-y-2">
              {DEMO.map(([e, role]) => (
                <button key={e} type="button" onClick={() => { setEmail(e); setPassword('Demo@1234'); }} className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-brand-500">
                  <div className="font-medium">{ROLE_LABELS[role]}</div>
                  <div className="text-xs text-slate-500">{e}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
