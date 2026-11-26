import mongoose from 'mongoose';
import { tenantScoped } from '../tenancy/plugin.js';
import { ROLE_LIST } from './roles.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_LIST, required: true },
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'active' },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    centers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Center' }],
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

userSchema.methods.toSafe = function toSafe() {
  const { passwordHash: _p, __v: _v, ...rest } = this.toObject();
  return rest;
};

userSchema.plugin(tenantScoped, { required: false });

export const User = mongoose.model('User', userSchema);
