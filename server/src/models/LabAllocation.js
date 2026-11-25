import mongoose from 'mongoose';

const allocationSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, required: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
    lab: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', required: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    seats: { type: Number, required: true, min: 1 },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

allocationSchema.index({ lab: 1, date: 1 });
allocationSchema.index({ center: 1, date: 1 });
allocationSchema.index({ booking: 1, shiftId: 1, lab: 1 }, { unique: true });

export const LabAllocation = mongoose.model('LabAllocation', allocationSchema);
