/**
 * Moves single-tenant data into a default tenant. Idempotent: documents that already
 * have a tenant are left alone. `--down` removes the tenant field again (dev only).
 *   node scripts/migrate-default-tenant.js [--slug default] [--name "My Org"] [--down]
 */
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Booking } from '../src/models/Booking.js';
import { Center } from '../src/models/Center.js';
import { Counter } from '../src/models/Counter.js';
import { Lab } from '../src/models/Lab.js';
import { LabAllocation } from '../src/models/LabAllocation.js';
import { Notification } from '../src/models/Notification.js';
import { Organization } from '../src/models/Organization.js';
import { Tenant } from '../src/models/Tenant.js';
import { User } from '../src/models/User.js';
import { ROLES } from '../src/models/roles.js';
import { asPlatform } from '../src/tenancy/context.js';

const SCOPED = [Booking, Center, Lab, LabAllocation, Notification, Organization, User, AuditLog];
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

export async function migrateDefaultTenant({ slug = 'default', name = 'Default Organisation' } = {}) {
  return asPlatform(async () => {
    const tenant = (await Tenant.findOne({ slug })) || (await Tenant.create({ name, slug, types: ['vendor', 'institute', 'agency'], status: 'active', plan: 'enterprise' }));
    const report = {};
    for (const Model of SCOPED) {
      const filter = { tenant: { $exists: false } };
      if (Model === User) filter.role = { $ne: ROLES.PLATFORM_OWNER };
      const r = await Model.collection.updateMany(filter, { $set: { tenant: tenant._id } });
      report[Model.modelName] = r.modifiedCount;
    }
    for (const c of await Counter.find({ _id: { $not: /:/ } }).lean()) {
      await Counter.updateOne({ _id: `${tenant._id}:${c._id}` }, { $max: { seq: c.seq } }, { upsert: true });
      await Counter.deleteOne({ _id: c._id });
    }
    for (const [Model, index] of [
      [Booking, 'bookingNo_1'],
      [Center, 'code_1'],
      [Organization, 'kind_1_code_1'],
    ]) {
      await Model.collection.dropIndex(index).catch(() => {});
    }
    await Promise.all(SCOPED.map((m) => m.syncIndexes()));
    return { tenant: { _id: tenant._id, slug: tenant.slug }, migrated: report };
  });
}

export async function rollbackDefaultTenant() {
  return asPlatform(async () => {
    if ((await Tenant.countDocuments()) > 1) throw new Error('Rollback is only possible while a single tenant exists');
    for (const Model of SCOPED) {
      for (const idx of await Model.collection.indexes()) if (idx.key.tenant && idx.name !== '_id_') await Model.collection.dropIndex(idx.name);
      await Model.collection.updateMany({}, { $unset: { tenant: '' } });
    }
    for (const c of await Counter.find({ _id: /:/ }).lean()) {
      await Counter.collection.insertOne({ _id: c._id.split(':').pop(), seq: c.seq });
      await Counter.deleteOne({ _id: c._id });
    }
    await Tenant.deleteMany({});
    return { ok: true };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDb();
  const result = process.argv.includes('--down') ? await rollbackDefaultTenant() : await migrateDefaultTenant({ slug: arg('slug', 'default'), name: arg('name', 'Default Organisation') });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}
