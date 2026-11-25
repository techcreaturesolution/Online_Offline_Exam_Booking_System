import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['institute', 'vendor', 'agency'], required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['university', 'institute', 'college', 'board', 'recruiter', 'company', 'other'], default: 'other' },
    code: { type: String, trim: true, uppercase: true },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

organizationSchema.index({ kind: 1, code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });

export const Organization = mongoose.model('Organization', organizationSchema);
