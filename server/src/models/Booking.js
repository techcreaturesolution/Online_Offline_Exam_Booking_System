import mongoose from 'mongoose';
import { tenantScoped } from '../tenancy/plugin.js';
import { BOOKING_STATUSES } from './roles.js';

const shiftSchema = new mongoose.Schema({
  label: { type: String, default: '' },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  candidates: { type: Number, required: true, min: 1 },
  attendance: {
    present: { type: Number, default: null },
    absent: { type: Number, default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recordedAt: Date,
  },
});

const checkSchema = new mongoose.Schema(
  {
    items: { type: Map, of: Boolean, default: {} },
    remarks: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
    done: { type: Boolean, default: false },
  },
  { _id: false },
);

const incidentSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ['technical', 'network', 'power', 'malpractice', 'medical', 'other'], required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    shiftId: { type: mongoose.Schema.Types.ObjectId },
    description: { type: String, required: true },
    resolved: { type: Boolean, default: false },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byRole: String,
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const eventSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    note: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    byRole: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const mockSchema = new mongoose.Schema({
  status: { type: String, enum: ['requested', 'allocated', 'approved', 'completed'], default: 'requested' },
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  candidates: { type: Number, required: true, min: 1 },
  notes: { type: String, default: '' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requestedRole: String,
  permission: {
    decision: { type: String, enum: ['approved', 'rejected', null], default: null },
    note: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
  },
  result: {
    present: { type: Number, default: null },
    remarks: { type: String, default: '' },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
  },
});

const bookingSchema = new mongoose.Schema(
  {
    bookingNo: { type: String, required: true },
    institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    center: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    examName: { type: String, required: true, trim: true },
    examCode: { type: String, trim: true, default: '' },
    mode: { type: String, enum: ['online', 'offline'], required: true },
    shifts: { type: [shiftSchema], validate: (v) => v.length > 0 },
    requirements: [{ type: String, trim: true }],
    notes: { type: String, default: '' },
    status: { type: String, enum: BOOKING_STATUSES, default: 'requested', index: true },
    mock: { type: mockSchema, default: null },
    review: {
      decision: { type: String, enum: ['approved', 'changes_requested', null], default: null },
      note: { type: String, default: '' },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
    readiness: {
      network: { type: checkSchema, default: () => ({}) },
      center: { type: checkSchema, default: () => ({}) },
    },
    billing: {
      ratePerSeat: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
      paymentStatus: { type: String, enum: ['unpaid', 'paid', 'waived'], default: 'unpaid' },
      invoiceNo: { type: String, default: '' },
    },
    incidents: [incidentSchema],
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      at: Date,
    },
    cancelReason: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timeline: [eventSchema],
  },
  { timestamps: true },
);

bookingSchema.index({ 'shifts.date': 1 });
bookingSchema.index({ tenant: 1, bookingNo: 1 }, { unique: true });

bookingSchema.plugin(tenantScoped, {});

export const Booking = mongoose.model('Booking', bookingSchema);
