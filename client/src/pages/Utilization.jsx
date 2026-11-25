import { useEffect, useState } from 'react';
import { Bar as RBar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Alert, Bar, Empty, Spinner, Stat } from '../components/ui.jsx';
import { api, downloadCsv, errorMessage } from '../lib/api.js';
import { LAB_TYPES, todayIso } from '../lib/format.js';

export default function Utilization() {
  const [q, setQ] = useState({ from: todayIso(-30), to: todayIso(30), mode: '', center: '' });
  const [centers, setCenters] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v)).toString();
  useEffect(() => {
    api.get('/centers').then((r) => setCenters(r.data.centers)).catch(() => {});
  }, []);
  useEffect(() => {
    api.get(`/reports/utilization?${qs}`).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorMessage(e)));
  }, [qs]);
  const set = (k) => (e) => setQ({ ...q, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="h1">Lab utilization</h1>
          <p className="text-sm text-slate-600">Utilization = allocated seat-hours ÷ usable seat-hours during center opening hours (maintenance days excluded).</p>
        </div>
        <button className="btn-secondary" onClick={() => downloadCsv(`/reports/utilization.csv?${qs}`, `lab-utilization-${q.from}-to-${q.to}.csv`).catch((e) => setError(errorMessage(e)))}>Export CSV</button>
      </div>
      <div className="card grid gap-3 md:grid-cols-4">
        <div><label className="label">From</label><input type="date" className="input" value={q.from} onChange={set('from')} /></div>
        <div><label className="label">To</label><input type="date" className="input" value={q.to} onChange={set('to')} /></div>
        <div><label className="label">Mode</label><select className="input" value={q.mode} onChange={set('mode')}><option value="">All</option><option value="online">Online (computer labs)</option><option value="offline">Offline (halls / classrooms)</option></select></div>
        <div><label className="label">Center</label><select className="input" value={q.center} onChange={set('center')}><option value="">All</option>{centers.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></div>
      </div>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Utilization" value={`${data.totals.utilization}%`} tone="text-brand-700" hint="Allocated vs capacity" />
            <Stat label="Attended utilization" value={`${data.totals.attendedUtilization}%`} tone="text-emerald-700" hint="Seats actually used by present candidates" />
            <Stat label="Allocated seat-hours" value={data.totals.allocatedSeatHours.toLocaleString('en-IN')} hint={`of ${data.totals.capacitySeatHours.toLocaleString('en-IN')} capacity`} />
            <Stat label="Labs / halls" value={data.totals.labs} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card">
              <h2 className="h2 mb-3">By center</h2>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data.centers}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="centerName" fontSize={11} />
                    <YAxis unit="%" fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <RBar dataKey="utilization" name="Allocated %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <RBar dataKey="attendedUtilization" name="Attended %" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <h2 className="h2 mb-3">Daily allocated seat-hours</h2>
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={data.daily.map((d) => ({ ...d, label: d.date.slice(5) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Line type="monotone" dataKey="seatHours" name="Seat-hours" stroke="#2563eb" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <div className="card overflow-x-auto p-0">
            {data.labs.length === 0 ? <div className="p-5"><Empty>No labs in scope.</Empty></div> : (
              <table className="table">
                <thead><tr><th>Center</th><th>Lab</th><th>Type</th><th>Usable seats</th><th>Open days</th><th>Sessions</th><th>Seat-hours (alloc / cap)</th><th className="w-48">Utilization</th></tr></thead>
                <tbody>
                  {data.labs.map((l) => (
                    <tr key={l.lab}>
                      <td>{l.centerName}</td>
                      <td><b>{l.labCode}</b> · {l.labName}</td>
                      <td>{LAB_TYPES[l.type]}</td>
                      <td>{l.usableSeats}</td>
                      <td>{l.openDays}</td>
                      <td>{l.sessions}</td>
                      <td>{l.allocatedSeatHours.toLocaleString('en-IN')} / {l.capacitySeatHours.toLocaleString('en-IN')}</td>
                      <td><div className="flex items-center gap-2"><Bar value={l.utilization} /><span className="w-12 text-right text-xs">{l.utilization}%</span></div><div className="text-[11px] text-slate-500">attended {l.attendedUtilization}%</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
