import { model, Schema } from 'mongoose'

const syncOperationSchema = new Schema({
  tenantId: { type: String, required: true, index: true }, branchId: { type: String, required: true, index: true },
  operationId: { type: String, required: true }, batchId: { type: String, required: true }, deviceId: { type: String, required: true },
  entityType: { type: String, required: true }, entityId: { type: String, required: true }, operation: { type: String, enum: ['create', 'update', 'capture'], required: true },
  payload: { type: Schema.Types.Mixed, required: true }, status: { type: String, enum: ['accepted', 'rejected', 'pending_review'], default: 'pending_review' },
  result: { type: Schema.Types.Mixed }, createdAtClient: { type: Date, required: true }, sequence: { type: Number, required: true, index: true },
}, { timestamps: true })
syncOperationSchema.index({ tenantId: 1, operationId: 1 }, { unique: true })
syncOperationSchema.index({ tenantId: 1, branchId: 1, status: 1, sequence: 1 })
export const SyncOperationModel = model('SyncOperation', syncOperationSchema)

const syncCounterSchema = new Schema({ tenantId: { type: String, required: true }, value: { type: Number, default: 0 } })
syncCounterSchema.index({ tenantId: 1 }, { unique: true })
export const SyncCounterModel = model('SyncCounter', syncCounterSchema)
