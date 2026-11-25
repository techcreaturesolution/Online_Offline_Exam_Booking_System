import { useEffect, useState } from 'react';
import { Alert } from '../ui.jsx';
import { api, errorMessage } from '../../lib/api.js';
import { ACTION_LABELS, ROLE_LABELS, fmtDateTime, inr } from '../../lib/format.js';

function useAct(reload) {
  const [error, setError] = useState('');
  const act = async (fn) => {
    setError('');
    try {
      await fn();
      reload();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  return [error, act];
}

export function AgencyCard({ booking, actions, reload }) {
  const [agencies, setAgencies] = useState([]);
  const [agency, setAgency] = useState(booking.agency?._id || '');
  const [error, act] = useAct(reload);
  const editable = actions.includes('assignAgency');
  useEffect(() => {
    if (editable) api.get('/meta/agencies').then((r) => setAgencies(r.data.agencies));
  }, [editable]);
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Exam conducting agency</h3>
      <Alert>{error}</Alert>
      {booking.agency ? <div className="text-sm"><b>{booking.agency.name}</b><div className="text-xs text-slate-500">{[booking.agency.email, booking.agency.phone].filter(Boolean).join(' · ')}</div></div> : <p className="text-sm text-amber-700">Not assigned yet</p>}
      {editable && (
        <div className="flex gap-2">
          <select className="input" value={agency} onChange={(e) => setAgency(e.target.value)}>
            <option value="">No agency</option>
            {agencies.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => act(() => api.post(`/bookings/${booking._id}/agency`, { agency: agency || null }))}>Save</button>
        </div>
      )}
    </div>
  );
}

export function BillingCard({ booking, actions, reload }) {
  const b = booking.billing || {};
  const [f, setF] = useState({ ratePerSeat: b.ratePerSeat || 0, paymentStatus: b.paymentStatus || 'unpaid', invoiceNo: b.invoiceNo || '' });
  const [error, act] = useAct(reload);
  const editable = actions.includes('billing');
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Billing</h3>
      <Alert>{error}</Alert>
      <div className="text-sm">
        <div className="text-2xl font-bold">{inr(b.amount)}</div>
        <div className="text-xs text-slate-500">{inr(b.ratePerSeat)} per seat · <span className="capitalize">{b.paymentStatus || 'unpaid'}</span>{b.invoiceNo ? ` · Invoice ${b.invoiceNo}` : ''}</div>
      </div>
      {editable && (
        <div className="grid grid-cols-2 gap-2">
          <input type="number" min={0} className="input" value={f.ratePerSeat} onChange={(e) => setF({ ...f, ratePerSeat: e.target.value })} aria-label="Rate per seat" />
          <select className="input" value={f.paymentStatus} onChange={(e) => setF({ ...f, paymentStatus: e.target.value })}>
            {['unpaid', 'paid', 'waived'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input className="input col-span-2" placeholder="Invoice no." value={f.invoiceNo} onChange={(e) => setF({ ...f, invoiceNo: e.target.value })} />
          <button className="btn-secondary col-span-2" onClick={() => act(() => api.put(`/bookings/${booking._id}/billing`, { ...f, ratePerSeat: Number(f.ratePerSeat) }))}>Update billing</button>
        </div>
      )}
    </div>
  );
}

export function FeedbackCard({ booking, actions, reload }) {
  const [rating, setRating] = useState(booking.feedback?.rating || 5);
  const [comment, setComment] = useState(booking.feedback?.comment || '');
  const [error, act] = useAct(reload);
  if (!booking.feedback?.rating && !actions.includes('feedback')) return null;
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Center rating</h3>
      <Alert>{error}</Alert>
      {booking.feedback?.rating ? <div className="text-sm"><span className="text-amber-500">{'★'.repeat(booking.feedback.rating)}{'☆'.repeat(5 - booking.feedback.rating)}</span> {booking.feedback.comment}</div> : null}
      {actions.includes('feedback') && (
        <div className="space-y-2">
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`text-2xl ${n <= rating ? 'text-amber-500' : 'text-slate-300'}`} onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>)}</div>
          <textarea className="input" rows={2} placeholder="How was the center?" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn-secondary" onClick={() => act(() => api.post(`/bookings/${booking._id}/feedback`, { rating, comment }))}>Submit rating</button>
        </div>
      )}
    </div>
  );
}

export function CancelCard({ booking, actions, reload }) {
  const [reason, setReason] = useState('');
  const [error, act] = useAct(reload);
  if (!actions.includes('cancel')) return null;
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold">Cancel booking</h3>
      <Alert>{error}</Alert>
      <input className="input" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-danger" disabled={reason.trim().length < 3} onClick={() => window.confirm('Cancel this booking and release its labs?') && act(() => api.post(`/bookings/${booking._id}/cancel`, { reason }))}>Cancel booking</button>
    </div>
  );
}

export function Timeline({ booking }) {
  return (
    <div className="card">
      <h3 className="mb-2 font-semibold">Activity</h3>
      <ol className="space-y-2 border-l border-slate-200 pl-4">
        {[...booking.timeline].reverse().map((t, i) => (
          <li key={i} className="relative text-sm">
            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
            <div className="font-medium">{ACTION_LABELS[t.action] || t.action}</div>
            {t.note && <div className="text-xs text-slate-600">{t.note}</div>}
            <div className="text-[11px] text-slate-400">{t.byName} ({ROLE_LABELS[t.byRole]}) · {fmtDateTime(t.at)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
