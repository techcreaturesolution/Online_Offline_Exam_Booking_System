import mongoose from 'mongoose';
import { tenantScoped } from '../tenancy/plugin.js';

const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    role: { type: String, default: '' },
    action: { type: String, required: true },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    ip: { type: String, default: '' },
    status: { type: Number, default: 0 },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    impersonatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.plugin(tenantScoped, { required: false });
auditSchema.index({ tenant: 1, createdAt: -1 });
const immutable = () => {
  throw new Error('Audit log entries are immutable');
};
auditSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'], immutable);
auditSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], { document: false, query: true }, function guardDelete() {
  if (!this.getOptions().purgeTenant) immutable();
});

export const AuditLog = mongoose.model('AuditLog', auditSchema);
