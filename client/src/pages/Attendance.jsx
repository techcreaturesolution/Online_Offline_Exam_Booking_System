import { useEffect, useState } from 'react';
import { Alert } from '../components/ui.jsx';
import CountsTable from '../components/CountsTable.jsx';
import { api, errorMessage } from '../lib/api.js';
import { todayIso } from '../lib/format.js';

export default function Attendance() {
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api.get('/reports/attendance', { params: { date } })
      .then((r) => live && (setData(r.data), setError('')))
      .catch((e) => live && setError(errorMessage(e)));
    return () => { live = false; };
  }, [date]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Attendance counts</h1>
          <p className="text-sm text-slate-500">Candidates, present and absent per classroom, block and center for the selected exam date.</p>
        </div>
        <div><label className="label">Exam date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <Alert>{error}</Alert>
      {data && data.centers.length === 0 && <div className="card text-sm text-slate-500">No exams allocated on this date.</div>}
      {data?.centers.map((c) => (
        <div key={c.center._id} className="card space-y-2">
          <h2 className="h2">{c.center.name} <span className="text-sm font-normal text-slate-500">{c.center.code} · {c.center.city}</span></h2>
          <CountsTable counts={c} />
        </div>
      ))}
    </div>
  );
}
