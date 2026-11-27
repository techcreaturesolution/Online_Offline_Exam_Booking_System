import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AllocationPanel from '../components/booking/AllocationPanel.jsx';
import MockPanel from '../components/booking/MockPanel.jsx';
import ConductPanel from '../components/booking/ConductPanel.jsx';
import ReadinessPanel from '../components/booking/ReadinessPanel.jsx';
import { AgencyCard, BillingCard, CancelCard, FeedbackCard, Timeline } from '../components/booking/SidePanel.jsx';
import { Alert, ModeBadge, Spinner, StatusBadge } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { STATUS, STATUS_ORDER } from '../lib/format.js';

function Stepper({ booking }) {
  const idx = STATUS_ORDER.indexOf(booking.status);
  const labels = {
    requested: 'Requested',
    confirmed: booking.mode === 'online' ? 'Labs allocated' : 'Classrooms allocated',
    ready: 'Center ready',
    in_progress: 'In progress',
    completed: 'Completed',
  };
  if (booking.status === 'cancelled') return <Alert>Cancelled: {booking.cancelReason}</Alert>;
  return (
    <ol className="grid grid-cols-3 gap-2 md:grid-cols-5">
      {STATUS_ORDER.map((s, i) => (
        <li key={s} className={`rounded-lg border px-2 py-1.5 text-center text-xs font-medium ${i < idx ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : i === idx ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-400'}`}>
          {i < idx ? '✓ ' : ''}{labels[s]}
        </li>
      ))}
    </ol>
  );
}

export default function BookingDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get(`/bookings/${id}`).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const { booking, allocation, mockAllocations = [], actions, checklists } = data;
  const total = booking.shifts.reduce((n, s) => n + s.candidates, 0);
  const present = booking.shifts.reduce((n, s) => n + (s.attendance?.present || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link to="/bookings" className="text-sm text-brand-600">← Bookings</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="h1">{booking.examName}</h1>
          <StatusBadge status={booking.status} />
          <ModeBadge mode={booking.mode} />
        </div>
        <p className="text-sm text-slate-600">
          <span className="font-mono">{booking.bookingNo}</span>{booking.examCode ? ` · ${booking.examCode}` : ''} · {booking.institute.name}{booking.agency ? ` · ${booking.agency.name}` : ''} · <Link className="text-brand-600 hover:underline" to={`/centers/${booking.center._id}`}>{booking.center.name}, {booking.center.city}</Link>
        </p>
      </div>
      <Stepper booking={booking} />
      <Alert kind="info">{STATUS[booking.status] && nextStep(booking)}</Alert>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card p-3"><div className="text-xs text-slate-500">Shifts</div><div className="text-xl font-bold">{booking.shifts.length}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Candidates</div><div className="text-xl font-bold">{total}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Seats allocated</div><div className="text-xl font-bold">{allocation.totalSeats}</div></div>
            <div className="card p-3"><div className="text-xs text-slate-500">Present</div><div className="text-xl font-bold">{['in_progress', 'completed'].includes(booking.status) ? `${present} (${total ? Math.round((present / total) * 100) : 0}%)` : '–'}</div></div>
          </div>
          {(booking.requirements.length > 0 || booking.notes) && (
            <div className="card text-sm">
              {booking.requirements.length > 0 && <div className="mb-1 flex flex-wrap gap-1">{booking.requirements.map((r) => <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r}</span>)}</div>}
              {booking.notes && <p className="text-slate-600">{booking.notes}</p>}
            </div>
          )}
          {booking.status !== 'cancelled' && <AllocationPanel booking={booking} allocation={allocation} actions={actions} reload={load} />}
          {booking.mode === 'online' && booking.status !== 'cancelled' && (booking.mock || actions.includes('mockRequest')) && <MockPanel key={`m-${booking.updatedAt}`} booking={booking} mockAllocations={mockAllocations} actions={actions} reload={load} />}
          {booking.status !== 'cancelled' && <ReadinessPanel key={`r-${booking.updatedAt}`} booking={booking} checklists={checklists} actions={actions} reload={load} />}
          {['ready', 'in_progress', 'completed'].includes(booking.status) && <ConductPanel key={`c-${booking.updatedAt}`} booking={booking} allocation={allocation} actions={actions} reload={load} />}
        </div>
        <div className="space-y-5">
          <AgencyCard key={`a-${booking.updatedAt}`} booking={booking} actions={actions} reload={load} />
          <BillingCard key={`b-${booking.updatedAt}`} booking={booking} actions={actions} reload={load} />
          <FeedbackCard key={`f-${booking.updatedAt}`} booking={booking} actions={actions} reload={load} />
          <CancelCard booking={booking} actions={actions} reload={load} />
          <Timeline booking={booking} />
        </div>
      </div>
    </div>
  );
}

function nextStep(b) {
  const online = b.mode === 'online';
  switch (b.status) {
    case 'requested': return online ? 'Next: the Network Admin allocates computer labs for every shift.' : 'Next: the Center In-Charge allocates classrooms / exam halls for every shift.';
    case 'confirmed': return online ? 'Next: the Network Admin and Center In-Charge complete their readiness checklists.' : 'Next: the Center In-Charge completes the center checklist (incl. strong room and answer sheets).';
    case 'ready': return b.agency ? 'Next: the exam conducting agency starts the exam.' : 'Next: assign an exam conducting agency, then start the exam.';
    case 'in_progress': return 'Next: record attendance for every shift, then the agency marks the exam completed.';
    case 'completed': return 'Exam completed. The institute can rate the center.';
    default: return '';
  }
}
