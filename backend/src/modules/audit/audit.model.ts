import { model, Schema } from 'mongoose'

const auditSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  branchId: { type: String, index: true },
  actorId: { type: String, required: true, index: true },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  correlationId: { type: String },
  previous: { type: Schema.Types.Mixed },
  next: { type: Schema.Types.Mixed },
  reason: { type: String },
}, { timestamps: true, strict: true })

auditSchema.index({ tenantId: 1, createdAt: -1 })
auditSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 })
export const AuditModel = model('AuditEvent', auditSchema)
