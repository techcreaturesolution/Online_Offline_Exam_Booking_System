import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rollNo: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    lab: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', default: null },
    seatNo: { type: String, default: '' },
  },
  { timestamps: true },
);

candidateSchema.index({ booking: 1, rollNo: 1 }, { unique: true });

export const Candidate = mongoose.model('Candidate', candidateSchema);
