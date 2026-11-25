import mongoose from 'mongoose';

const centerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, trim: true, default: '' },
    modes: [{ type: String, enum: ['online', 'offline'] }],
    facilities: [{ type: String, trim: true }],
    openTime: { type: String, default: '08:00' },
    closeTime: { type: String, default: '20:00' },
    ratePerSeat: {
      online: { type: Number, default: 0, min: 0 },
      offline: { type: Number, default: 0, min: 0 },
    },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Center = mongoose.model('Center', centerSchema);
