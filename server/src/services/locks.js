import { LabLock } from '../models/LabLock.js';
import { HttpError } from '../utils/httpError.js';

const STALE_MS = 30000;
const WAIT_MS = 8000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire(key) {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    try {
      await LabLock.create({ _id: key, at: new Date() });
      return;
    } catch (e) {
      if (e?.code !== 11000) throw e;
      await LabLock.deleteOne({ _id: key, at: { $lt: new Date(Date.now() - STALE_MS) } });
      if (Date.now() > until) throw new HttpError(409, 'Another allocation for this lab is being saved; please try again');
      await sleep(25 + Math.random() * 50);
    }
  }
}

/** Serialises allocation writes per center/date so two saves cannot both pass the free-seat check. */
export async function withLocks(keys, fn) {
  const sorted = [...new Set(keys)].sort();
  const held = [];
  try {
    for (const k of sorted) {
      await acquire(k);
      held.push(k);
    }
    return await fn();
  } finally {
    if (held.length) await LabLock.deleteMany({ _id: { $in: held } });
  }
}
