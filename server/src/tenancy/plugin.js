import mongoose from 'mongoose';
import { tenantContext } from './context.js';

const QUERY_OPS = ['countDocuments', 'deleteMany', 'deleteOne', 'distinct', 'find', 'findOne', 'findOneAndDelete', 'findOneAndReplace', 'findOneAndUpdate', 'replaceOne', 'updateMany', 'updateOne'];

function scope(model) {
  const ctx = tenantContext();
  if (ctx?.bypass) return null;
  if (ctx?.tenant) return ctx.tenant;
  throw new Error(`Unscoped ${model} query: run it inside withTenant() or asPlatform()`);
}

/** Adds `tenant` to a schema and scopes every query, save and aggregate to the current tenant. */
export function tenantScoped(schema, { required = true } = {}) {
  schema.add({ tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true, required } });
  schema.pre(QUERY_OPS, function scopeQuery() {
    const t = scope(this.model.modelName);
    if (t) this.where({ tenant: t });
  });
  schema.pre('aggregate', function scopeAggregate() {
    const t = scope(this.model().modelName);
    if (t) this.pipeline().unshift({ $match: { tenant: t } });
  });
  schema.pre('validate', function setTenant() {
    const ctx = tenantContext();
    if (ctx?.bypass) return;
    const t = scope(this.constructor.modelName);
    if (!this.tenant) this.tenant = t;
    else if (String(this.tenant) !== String(t)) throw new Error(`Cross-tenant write blocked on ${this.constructor.modelName}`);
  });
}
