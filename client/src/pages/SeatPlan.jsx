import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Spinner } from '../components/ui.jsx';
import { api, errorMessage } from '../lib/api.js';
import { fmtDate } from '../lib/format.js';

export default function SeatPlan() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get(`/bookings/${id}`), api.get(`/bookings/${id}/candidates`)])
      .then(([b, c]) => setData({ booking: b.data.booking, candidates: c.data.candidates }))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  if (error) return <div className="p-6"><Alert>{error}</Alert></div>;
  if (!data) return <Spinner />;
  const { booking, candidates } = data;
  return (
    <div className="mx-auto max-w-5xl bg-white p-8">
      <div className="no-print mb-4 flex justify-end"><button className="btn-primary" onClick={() => window.print()}>Print</button></div>
      {booking.shifts.map((s, i) => {
        const list = candidates.filter((c) => String(c.shiftId) === String(s._id));
        if (!list.length) return null;
        return (
          <section key={s._id} className="mb-10 break-after-page">
            <h1 className="text-xl font-bold">{booking.examName}</h1>
            <p className="text-sm">{booking.bookingNo} · {booking.center.name}, {booking.center.city} · {s.label || `Shift ${i + 1}`} · {fmtDate(s.date)} {s.startTime}–{s.endTime}</p>
            <table className="table mt-3 border">
              <thead><tr><th>#</th><th>Roll no.</th><th>Name</th><th>Lab / hall</th><th>Seat</th><th>Signature</th></tr></thead>
              <tbody>
                {list.map((c, n) => (
                  <tr key={c._id}><td>{n + 1}</td><td className="font-mono">{c.rollNo}</td><td>{c.name}</td><td>{c.lab ? `${c.lab.code} – ${c.lab.name}` : '–'}</td><td className="font-mono">{c.seatNo || '–'}</td><td className="w-40" /></tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      {!candidates.length && <Alert kind="info">No candidates uploaded yet.</Alert>}
    </div>
  );
}
