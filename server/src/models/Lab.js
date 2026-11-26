import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema(
  { from: { type: String, required: true }, to: { type: String, required: true }, reason: { type: String, default: '' } },
  { _id: true },
);

const labSchema = new mongoose.Schema(
  {
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ['computer_lab', 'exam_hall', 'classroom'], required: true },
    floor: { type: String, trim: true, default: '' },
    capacity: { type: Number, required: true, min: 1 },
    systemsTotal: { type: Number, default: 0, min: 0 },
    systemsWorking: { type: Number, default: 0, min: 0 },
    bufferSeats: { type: Number, default: 0, min: 0 },
    bandwidthMbps: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'maintenance', 'inactive'], default: 'active' },
    maintenanceBlocks: [blockSchema],
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

labSchema.index({ center: 1, code: 1 }, { unique: true });

labSchema.virtual('mode').get(function mode() {
  return this.type === 'computer_lab' ? 'online' : 'offline';
});

export function labMode(lab) {
  return lab.type === 'computer_lab' ? 'online' : 'offline';
}

export function usableSeats(lab) {
  const base = labMode(lab) === 'online' ? Math.min(lab.capacity, lab.systemsWorking || 0) : lab.capacity;
  return Math.max(0, base - (lab.bufferSeats || 0));
}

export function isBlocked(lab, date) {
  return (lab.maintenanceBlocks || []).some((b) => b.from <= date && date <= b.to);
}

export const Lab = mongoose.model('Lab', labSchema);
