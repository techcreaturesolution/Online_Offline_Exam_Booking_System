/**
 * Removes the Booking Vendor from an existing database. Idempotent.
 *   node scripts/migrate-remove-vendor.js
 * - vendor users are deactivated and re-roled to exam_agency (kept for history, cannot sign in)
 * - vendor organizations are marked inactive as kind 'agency'; center vendor links are cleared
 * - bookings waiting for verification (`allocated`) become `confirmed`; mock days waiting for permission become `approved`
 * - tenant type 'vendor' becomes 'center'
 */
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';

export async function migrateRemoveVendor(db = mongoose.connection.db) {
  const users = await db.collection('users').updateMany({ role: 'booking_vendor' }, { $set: { role: 'exam_agency', status: 'disabled' } });
  const orgs = await db.collection('organizations').updateMany({ kind: 'vendor' }, { $set: { kind: 'agency', active: false } });
  const centers = await db.collection('centers').updateMany({ vendor: { $exists: true } }, { $unset: { vendor: '' } });
  const bookings = await db.collection('bookings').updateMany({ status: 'allocated' }, { $set: { status: 'confirmed' } });
  const reviews = await db.collection('bookings').updateMany({ review: { $exists: true } }, { $unset: { review: '' } });
  const mocks = await db.collection('bookings').updateMany({ 'mock.status': 'allocated' }, { $set: { 'mock.status': 'approved' }, $unset: { 'mock.permission': '' } });
  await db.collection('tenants').updateMany({ types: 'vendor' }, { $addToSet: { types: 'center' } });
  const tenants = await db.collection('tenants').updateMany({ types: 'vendor' }, { $pull: { types: 'vendor' } });
  return { users: users.modifiedCount, organizations: orgs.modifiedCount, centers: centers.modifiedCount, bookings: bookings.modifiedCount, reviews: reviews.modifiedCount, mocks: mocks.modifiedCount, tenants: tenants.modifiedCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await connectDb();
  console.log(JSON.stringify(await migrateRemoveVendor(), null, 2));
  await mongoose.disconnect();
}
