const n = (v) => (v == null ? '–' : v);

/** Classroom rows grouped by block, with block subtotals and a center total. */
export default function CountsTable({ counts, title }) {
  if (!counts?.classrooms?.length) return null;
  return (
    <div className="overflow-x-auto">
      {title && <h3 className="mb-2 font-semibold">{title}</h3>}
      <table className="table">
        <thead><tr><th>Block / classroom</th><th>Candidates (allocated)</th><th>Present</th><th>Absent</th></tr></thead>
        <tbody>
          {counts.blocks.map((b) => (
            <BlockRows key={b.block} block={b} rooms={counts.classrooms.filter((c) => c.block === b.block)} />
          ))}
          <tr className="bg-brand-50 font-bold">
            <td>Center total{counts.total.pending ? <span className="ml-1 text-xs font-normal text-amber-700">({counts.total.pending} classroom{counts.total.pending > 1 ? 's' : ''} pending)</span> : null}</td>
            <td>{counts.total.allocated}</td><td>{counts.total.present}</td><td>{counts.total.absent}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function BlockRows({ block, rooms }) {
  return (
    <>
      {rooms.map((r) => (
        <tr key={r.lab}>
          <td className="pl-6"><b>{r.code}</b> · {r.name}</td>
          <td>{r.allocated}</td><td>{n(r.present)}</td><td>{n(r.absent)}</td>
        </tr>
      ))}
      <tr className="bg-slate-50 font-semibold">
        <td>{block.block} total</td><td>{block.allocated}</td><td>{block.present}</td><td>{block.absent}</td>
      </tr>
    </>
  );
}
