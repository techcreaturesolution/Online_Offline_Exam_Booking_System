import mongoose from 'mongoose';
import { currentTenant } from '../tenancy/context.js';

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', counterSchema);

export async function nextSeq(name) {
  const doc = await Counter.findOneAndUpdate({ _id: currentTenant() ? `${currentTenant()}:${name}` : name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return doc.seq;
}
