/** Assigns candidates of each shift to the allocated labs in lab-code order, seat numbers like LAB1-001. */
export function buildSeatPlan(candidates, allocations) {
  const updates = [];
  const byShift = new Map();
  for (const c of candidates) {
    const key = String(c.shiftId);
    if (!byShift.has(key)) byShift.set(key, []);
    byShift.get(key).push(c);
  }
  const unseated = [];
  for (const [shiftId, list] of byShift) {
    const slots = allocations
      .filter((a) => String(a.shiftId) === shiftId)
      .sort((a, b) => String(a.lab.code).localeCompare(String(b.lab.code)));
    const ordered = [...list].sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));
    let i = 0;
    for (const slot of slots) {
      for (let seat = 1; seat <= slot.seats && i < ordered.length; seat += 1, i += 1) {
        updates.push({ _id: ordered[i]._id, lab: slot.lab._id, seatNo: `${slot.lab.code}-${String(seat).padStart(3, '0')}` });
      }
    }
    for (; i < ordered.length; i += 1) unseated.push(ordered[i].rollNo);
  }
  return { updates, unseated };
}
