import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

const store = new AsyncLocalStorage();

const asId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));

// Mongoose queries are lazy thenables: exec them inside the context so their hooks see it.
const run = (ctx, fn) =>
  store.run(ctx, () => {
    const r = fn();
    return r && typeof r.exec === 'function' ? r.exec() : r;
  });

/** Run fn with every tenant-owned query scoped to one tenant. */
export const withTenant = (tenantId, fn) => run({ tenant: asId(tenantId) }, fn);

/** Run fn without tenant scoping (login, platform console, seeds, migrations). */
export const asPlatform = (fn) => run({ bypass: true }, fn);

export const tenantContext = () => store.getStore() || null;
export const currentTenant = () => store.getStore()?.tenant || null;
