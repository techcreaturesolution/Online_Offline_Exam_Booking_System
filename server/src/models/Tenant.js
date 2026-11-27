import mongoose from 'mongoose';

export const TENANT_TYPES = ['vendor', 'institute', 'agency'];
export const TENANT_STATUSES = ['trial', 'active', 'suspended', 'cancelled'];

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/ },
    types: [{ type: String, enum: TENANT_TYPES }],
    status: { type: String, enum: TENANT_STATUSES, default: 'trial' },
    plan: { type: String, default: 'trial' },
    trialEndsAt: Date,
    contactEmail: { type: String, lowercase: true, trim: true, default: '' },
    branding: {
      logoUrl: { type: String, default: '' },
      primaryColor: { type: String, default: '' },
      emailSenderName: { type: String, default: '' },
      loginText: { type: String, default: '' },
    },
    settings: {
      timezone: { type: String, default: 'Asia/Kolkata' },
      currency: { type: String, default: 'INR' },
      taxLabel: { type: String, default: 'GST' },
      dataResidency: { type: String, default: 'IN' },
    },
    deletionScheduledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model('Tenant', tenantSchema);
