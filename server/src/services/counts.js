const NO_BLOCK = 'No block';
const sum = (rows, k) => rows.reduce((n, r) => n + (r[k] || 0), 0);

/** Allocated / present / absent per classroom, per block and for the whole center. */
export function attendanceCounts(allocations) {
  const classrooms = allocations
    .map((a) => ({
      lab: a.lab?._id || a.lab,
      code: a.lab?.code || '',
      name: a.lab?.name || '',
      block: a.lab?.block || NO_BLOCK,
      allocated: a.seats,
      present: a.present ?? null,
      absent: a.present == null ? null : Math.max(0, a.seats - a.present),
    }))
    .sort((x, y) => (x.block === NO_BLOCK) - (y.block === NO_BLOCK) || x.block.localeCompare(y.block) || x.code.localeCompare(y.code));
  const blocks = [];
  for (const c of classrooms) {
    let b = blocks.find((x) => x.block === c.block);
    if (!b) blocks.push((b = { block: c.block, rooms: [] }));
    b.rooms.push(c);
  }
  return {
    classrooms,
    blocks: blocks.map(({ block, rooms }) => ({ block, allocated: sum(rooms, 'allocated'), present: sum(rooms, 'present'), absent: sum(rooms, 'absent'), rooms: rooms.length })),
    total: { allocated: sum(classrooms, 'allocated'), present: sum(classrooms, 'present'), absent: sum(classrooms, 'absent'), pending: classrooms.filter((c) => c.present == null).length },
  };
}
