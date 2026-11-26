import mongoose from 'mongoose';

const lockSchema = new mongoose.Schema({
  _id: { type: String },
  at: { type: Date, default: Date.now, expires: 60 },
});

export const LabLock = mongoose.model('LabLock', lockSchema);
